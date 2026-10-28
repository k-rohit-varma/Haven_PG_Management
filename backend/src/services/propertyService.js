import mongoose from 'mongoose';
import { Hostel } from '../models/Hostel.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { RoomConfigurationHistory } from '../models/RoomConfigurationHistory.js';
import { User } from '../models/User.js';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { notifyOnce } from './notificationWriter.js';
import { currentRentPaise } from '../utils/rentTerms.js';
import { ACTIVE_STAY_STATUS, activeRoomOccupancyStages, getOccupancyByRoom, getRoomOccupancy } from '../utils/roomOccupancy.js';

const editableHostelFields = ['name', 'description', 'address', 'city', 'facilities', 'images', 'accommodationPolicy', 'contactPhone', 'isActive'];
const editableRoomFields = ['identifier', 'sharingType', 'maxCapacity', 'genderEligibility', 'defaultRentPaise', 'facilities', 'notes', 'isActive'];
const roomSnapshotFields = ['identifier', 'sharingType', 'maxCapacity', 'genderEligibility', 'defaultRentPaise', 'facilities', 'notes', 'isActive'];

function pick(source, fields) {
  return Object.fromEntries(fields.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ownerScope(user) {
  return user.role === 'OWNER' ? { ownerId: user._id } : {};
}

async function requireHostel(user, hostelId, { includeDeleted = false } = {}) {
  const filter = { _id: hostelId, ...ownerScope(user), ...(includeDeleted ? {} : { isDeleted: false }), ...(user.role === 'TENANT' ? { isActive: true } : {}), ...(user.role === 'ADMIN' ? {} : { isBlocked: { $ne: true } }) };
  const hostel = await Hostel.findOne(filter);
  if (!hostel) {
    if (user.role !== 'ADMIN' && await Hostel.exists({ _id: hostelId, isBlocked: true, isDeleted: false })) throw new AppError(423, 'This hostel is temporarily blocked. Contact an administrator for details.', 'HOSTEL_BLOCKED');
    throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  }
  return hostel;
}

async function activeOccupants(roomId) {
  const stays = await mongoose.connection.collection('stays').find({ roomId, status: ACTIVE_STAY_STATUS }, { projection: { tenantId: 1 } }).toArray();
  if (!stays.length) return [];
  return User.find({ _id: { $in: stays.map((stay) => stay.tenantId) }, isDeleted: false }).select('_id gender').lean();
}

function roomEligibleForPolicy(eligibility, policy) {
  if (policy === 'MIXED') return true;
  return policy === 'MALE_ONLY' ? eligibility === 'MALE' : eligibility === 'FEMALE';
}

function ensureRoomPolicy(eligibility, policy) {
  if (!roomEligibleForPolicy(eligibility, policy)) throw new AppError(422, 'Room gender eligibility must match the hostel accommodation policy.', 'GENDER_POLICY_MISMATCH');
}

function ensureTenantEligible(gender, policy, eligibility) {
  if (policy === 'MALE_ONLY' && gender !== 'MALE') throw new AppError(422, 'This hostel is limited to male accommodation.', 'TENANT_NOT_ELIGIBLE');
  if (policy === 'FEMALE_ONLY' && gender !== 'FEMALE') throw new AppError(422, 'This hostel is limited to female accommodation.', 'TENANT_NOT_ELIGIBLE');
  if (eligibility !== 'ANY' && eligibility !== gender) throw new AppError(422, 'This room is not configured for the tenant’s profile.', 'TENANT_NOT_ELIGIBLE');
}

function publicHostel(hostel) {
  return {
    _id: hostel._id,
    name: hostel.name,
    description: hostel.description,
    address: hostel.address,
    city: hostel.city,
    facilities: hostel.facilities,
    images: hostel.images,
    accommodationPolicy: hostel.accommodationPolicy,
    contactPhone: hostel.contactPhone,
    isActive: hostel.isActive,
  };
}

function publicRoom(room, occupancy = 0) {
  return {
    _id: room._id,
    identifier: room.identifier,
    sharingType: room.sharingType,
    maxCapacity: room.maxCapacity,
    genderEligibility: room.genderEligibility,
    defaultRentPaise: room.defaultRentPaise,
    facilities: room.facilities,
    notes: room.notes,
    occupancy,
    availableBeds: Math.max(0, room.maxCapacity - occupancy),
  };
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) {
      throw new AppError(503, 'This operation requires MongoDB transaction support. Configure the database as a replica set and retry.', 'TRANSACTIONS_UNAVAILABLE');
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function listHostels(user, query) {
  const filter = { isDeleted: false };
  if (user.role === 'OWNER') { filter.ownerId = user._id; filter.isBlocked = { $ne: true }; }
  else if (user.role === 'TENANT') { filter.isActive = true; filter.isBlocked = { $ne: true }; }
  if (query.active !== undefined && user.role !== 'TENANT') filter.isActive = query.active === 'true';
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { city: pattern }, { address: pattern }];
  }

  const skip = (query.page - 1) * query.limit;
  if (user.role === 'TENANT') {
    const available = await Room.aggregate([
      { $match: { isDeleted: false, isActive: true, genderEligibility: { $in: ['ANY', ...(user.gender === 'MALE' || user.gender === 'FEMALE' ? [user.gender] : [])] } } },
      ...activeRoomOccupancyStages(),
      { $match: { availableBeds: { $gt: 0 } } },
      { $group: { _id: '$hostelId', availableBeds: { $sum: '$availableBeds' }, activeRooms: { $sum: 1 } } },
    ]);
    const inventory = new Map(available.map((item) => [String(item._id), item]));
    // Discovery is independent of inventory: tenants must be able to inspect a
    // property and its policies even whe n rooms are not configured or full.
    const tenantFilter = { ...filter, ...(user.gender === 'MALE' ? { accommodationPolicy: { $in: ['MIXED', 'MALE_ONLY'] } } : {}), ...(user.gender === 'FEMALE' ? { accommodationPolicy: { $in: ['MIXED', 'FEMALE_ONLY'] } } : {}) };
    const [tenantItems, tenantTotal] = await Promise.all([
      Hostel.find(tenantFilter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Hostel.countDocuments(tenantFilter),
    ]);
    return {
      items: tenantItems.map((item) => ({ ...publicHostel(item), ...(inventory.get(String(item._id)) || { availableBeds: 0, activeRooms: 0 }) })),
      pagination: { page: query.page, limit: query.limit, total: tenantTotal, pages: Math.ceil(tenantTotal / query.limit) },
    };
  }
  const [items, total] = await Promise.all([
    Hostel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    Hostel.countDocuments(filter),
  ]);
  const roomFilter = { hostelId: { $in: items.map((item) => item._id) }, isDeleted: false, isActive: true };
  const rooms = await Room.find(roomFilter).select('_id hostelId maxCapacity').lean();
  const occupancy = await getOccupancyByRoom(rooms.map((room) => room._id));
  const availableByHostel = new Map();
  const inventoryByHostel = new Map();
  for (const room of rooms) {
    const key = String(room.hostelId);
    const available = Math.max(0, room.maxCapacity - (occupancy.get(String(room._id)) || 0));
    availableByHostel.set(key, (availableByHostel.get(key) || 0) + available);
    inventoryByHostel.set(key, (inventoryByHostel.get(key) || 0) + 1);
  }
  return {
    items: items.map((item) => ({ ...item, availableBeds: availableByHostel.get(String(item._id)) || 0, activeRooms: inventoryByHostel.get(String(item._id)) || 0 })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  };
}

export async function getHostel(user, hostelId) {
  const hostel = await requireHostel(user, hostelId);
  if (user.role === 'TENANT' && !hostel.isActive) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  const [summary] = await Room.aggregate([
    { $match: { hostelId: hostel._id, isDeleted: false, isActive: true } },
    ...activeRoomOccupancyStages(),
    { $group: { _id: null, count: { $sum: 1 }, occupancy: { $sum: '$occupancy' }, capacity: { $sum: '$maxCapacity' } } },
  ]);
  const roomSummary = { count: summary?.count || 0, occupied: summary?.occupancy || 0, capacity: summary?.capacity || 0, available: Math.max(0, (summary?.capacity || 0) - (summary?.occupancy || 0)) };
  return { hostel: user.role === 'TENANT' ? publicHostel(hostel) : hostel, roomSummary };
}

export async function createHostel(user, input) {
  if (user.role !== 'ADMIN') throw new AppError(403, 'Only administrators can create hostels.', 'FORBIDDEN');
  const ownerId = input.ownerId;
  if (!ownerId) throw new AppError(422, 'Select an active owner for this hostel.', 'OWNER_REQUIRED');
  return withTransaction(async (session) => {
    const owner = await User.findOne({ _id: ownerId, role: 'OWNER', isActive: true, isDeleted: false }).select('_id').session(session);
    if (!owner) throw new AppError(422, 'Choose an active OWNER account.', 'INVALID_HOSTEL_OWNER');
    const [hostel] = await Hostel.create([{ ...pick(input, ['name', 'description', 'address', 'city', 'facilities', 'images', 'accommodationPolicy', 'contactPhone']), ownerId: owner._id }], { session });
    await AuditLog.create([{ actorId: user._id, action: 'HOSTEL_CREATED', entityType: 'HOSTEL', entityId: hostel._id, reason: 'Hostel created', before: null, after: { name: hostel.name, city: hostel.city, accommodationPolicy: hostel.accommodationPolicy } }], { session });
    return hostel;
  });
}

export async function assignHostelOwner(actor, hostelId, ownerId) {
  if (actor.role !== 'ADMIN') throw new AppError(403, 'Only administrators can assign hostel owners.', 'FORBIDDEN');
  return withTransaction(async (session) => {
    const hostel = await Hostel.findOne({ _id: hostelId, isDeleted: false }).session(session);
    if (!hostel) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    const nextOwner = await User.findOne({ _id: ownerId, role: 'OWNER', isActive: true, isDeleted: false }).select('_id name').session(session);
    if (!nextOwner) throw new AppError(422, 'Choose an active OWNER account.', 'INVALID_HOSTEL_OWNER');
    if (String(hostel.ownerId) === String(nextOwner._id)) return hostel;
    const previousOwnerId = hostel.ownerId;
    const updated = await Hostel.findOneAndUpdate({ _id: hostel._id, ownerId: previousOwnerId, __v: hostel.__v }, { $set: { ownerId: nextOwner._id }, $inc: { __v: 1 } }, { new: true, session });
    if (!updated) throw new AppError(409, 'The hostel changed while you were assigning its owner. Refresh and retry.', 'CONCURRENT_UPDATE');
    await AuditLog.create([{ actorId: actor._id, action: 'HOSTEL_OWNER_ASSIGNED', entityType: 'HOSTEL', entityId: hostel._id, reason: 'Hostel owner reassigned', before: { ownerId: previousOwnerId }, after: { ownerId: nextOwner._id } }], { session });
    const recipients = [...new Set([String(previousOwnerId), String(nextOwner._id)])];
    await Promise.all(recipients.map((recipientId) => notifyOnce({ recipientId, type: 'HOSTEL_OWNERSHIP', title: 'Hostel ownership updated', message: `Ownership for ${hostel.name} has been updated.`, destination: '/hostels', relatedEntityId: hostel._id, eventKey: `hostel-owner:${hostel._id}:${updated.__v}:${recipientId}` }, session)));
    return updated;
  });
}

export async function setHostelBlocked(actor, hostelId, blocked, reason = '') {
  if (actor.role !== 'ADMIN') throw new AppError(403, 'Only administrators can block or unblock a hostel.', 'FORBIDDEN');
  return withTransaction(async (session) => {
    const hostel = await Hostel.findOne({ _id: hostelId, isDeleted: false }).session(session);
    if (!hostel) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    if (hostel.isBlocked === blocked) return hostel;
    const now = new Date();
    const updated = await Hostel.findOneAndUpdate({ _id: hostel._id, isBlocked: hostel.isBlocked, __v: hostel.__v }, {
      $set: { isBlocked: blocked, blockedAt: blocked ? now : null, blockedBy: blocked ? actor._id : null, blockReason: blocked ? reason : '' }, $inc: { __v: 1 },
    }, { new: true, session, runValidators: true });
    if (!updated) throw new AppError(409, 'The hostel status changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    await AuditLog.create([{ actorId: actor._id, action: blocked ? 'HOSTEL_BLOCKED' : 'HOSTEL_UNBLOCKED', entityType: 'HOSTEL', entityId: hostel._id, reason: reason || (blocked ? 'Access blocked by administrator' : 'Access restored by administrator'), before: { isBlocked: hostel.isBlocked }, after: { isBlocked: blocked, blockedAt: updated.blockedAt } }], { session });
    return updated;
  });
}

export async function updateHostel(user, hostelId, input) {
  return withTransaction(async (session) => {
    const hostel = await Hostel.findOne({ _id: hostelId, ...ownerScope(user), isDeleted: false, ...(user.role === 'ADMIN' ? {} : { isBlocked: { $ne: true } }) }).session(session);
    if (!hostel) {
      if (user.role !== 'ADMIN' && await Hostel.exists({ _id: hostelId, isBlocked: true, isDeleted: false }).session(session)) throw new AppError(423, 'This hostel is blocked. Property access is temporarily unavailable.', 'HOSTEL_BLOCKED');
      throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    }
    const changes = pick(input, editableHostelFields);
    if (changes.accommodationPolicy && changes.accommodationPolicy !== hostel.accommodationPolicy) {
      const rooms = await Room.find({ hostelId, isDeleted: false }).select('identifier genderEligibility').session(session).lean();
      const mismatch = rooms.find((room) => !roomEligibleForPolicy(room.genderEligibility, changes.accommodationPolicy));
      if (mismatch) throw new AppError(409, `Room ${mismatch.identifier} must be reconfigured before changing the hostel policy.`, 'ROOM_POLICY_CONFLICT');
    }
    const updated = await Hostel.findOneAndUpdate({ _id: hostelId, ...ownerScope(user), isDeleted: false, ...(user.role === 'ADMIN' ? {} : { isBlocked: { $ne: true } }), __v: hostel.__v }, { $set: changes, $inc: { __v: 1 } }, { new: true, runValidators: true, session });
    if (!updated) throw new AppError(409, 'The hostel changed while you were editing it. Refresh and try again.', 'CONCURRENT_UPDATE');
    return updated;
  });
}

export async function softDeleteHostel(user, hostelId, reason) {
  const hostel = await requireHostel(user, hostelId);
  const rooms = await Room.find({ hostelId, isDeleted: false }).select('_id').lean();
  const occupancy = await getOccupancyByRoom(rooms.map((room) => room._id));
  if ([...occupancy.values()].some((count) => count > 0)) throw new AppError(409, 'A hostel with active occupants cannot be deleted. Deactivate it or close the active stays first.', 'HOSTEL_HAS_ACTIVE_STAYS');
  return withTransaction(async (session) => {
    const now = new Date();
    const result = await Hostel.updateOne({ _id: hostelId, ...ownerScope(user), isDeleted: false, __v: hostel.__v }, { $set: { isDeleted: true, isActive: false, deletedAt: now, deletedBy: user._id, deletionReason: reason || '' }, $inc: { __v: 1 } }, { session });
    if (!result.modifiedCount) throw new AppError(409, 'The hostel could not be deleted because it changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    await AuditLog.create([{ actorId: user._id, action: 'HOSTEL_SOFT_DELETED', entityType: 'HOSTEL', entityId: hostel._id, reason: reason || 'Hostel soft-deleted', before: { isActive: hostel.isActive, isDeleted: false }, after: { isActive: false, isDeleted: true, deletedAt: now } }], { session });
    return { deleted: true };
  });
}

export async function listRooms(user, hostelId, query) {
  const hostel = await requireHostel(user, hostelId);
  if (user.role === 'TENANT' && !hostel.isActive) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  const match = { hostelId: hostel._id, isDeleted: false };
  if (user.role === 'TENANT') {
    match.isActive = true;
    match.genderEligibility = { $in: ['ANY', ...(user.gender === 'MALE' || user.gender === 'FEMALE' ? [user.gender] : [])] };
  }
  else if (query.active !== undefined) match.isActive = query.active === 'true';
  if (query.search) match.identifier = { $regex: escapeRegex(query.search), $options: 'i' };
  if (query.genderEligibility) match.genderEligibility = query.genderEligibility;
  if (query.sharingType !== undefined) match.sharingType = query.sharingType;
  if (query.minCapacity !== undefined || query.maxCapacity !== undefined) match.maxCapacity = { ...(query.minCapacity !== undefined ? { $gte: query.minCapacity } : {}), ...(query.maxCapacity !== undefined ? { $lte: query.maxCapacity } : {}) };
  if (query.minRentPaise !== undefined || query.maxRentPaise !== undefined) match.defaultRentPaise = { ...(query.minRentPaise !== undefined ? { $gte: query.minRentPaise } : {}), ...(query.maxRentPaise !== undefined ? { $lte: query.maxRentPaise } : {}) };
  const sort = {
    identifier_asc: { identifier: 1, _id: 1 }, identifier_desc: { identifier: -1, _id: 1 },
    rent_asc: { defaultRentPaise: 1, identifier: 1, _id: 1 }, rent_desc: { defaultRentPaise: -1, identifier: 1, _id: 1 },
    available_desc: { availableBeds: -1, identifier: 1, _id: 1 }, occupancy_desc: { occupancy: -1, identifier: 1, _id: 1 }, created_desc: { createdAt: -1, _id: 1 },
  }[query.sortBy || 'identifier_asc'];
  const availabilityMatch = query.availability === 'AVAILABLE' ? { isActive: true, availableBeds: { $gt: 0 } }
    : query.availability === 'PARTIAL' ? { isActive: true, $expr: { $and: [{ $gt: ['$occupancy', 0] }, { $lt: ['$occupancy', '$maxCapacity'] }] } }
      : query.availability === 'FULL' ? { isActive: true, $expr: { $gte: ['$occupancy', '$maxCapacity'] } }
        : query.availability === 'INACTIVE' ? { isActive: false } : null;
  const pipeline = [
    { $match: match },
    ...activeRoomOccupancyStages(),
    { $addFields: { availableBeds: { $max: [0, { $subtract: ['$maxCapacity', '$occupancy'] }] } } },
    ...(query.minAvailableBeds !== undefined ? [{ $match: { availableBeds: { $gte: query.minAvailableBeds } } }] : []),
    ...(availabilityMatch ? [{ $match: availabilityMatch }] : []),
    { $facet: {
      items: [{ $sort: sort }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }, { $project: { activeStayCounts: 0 } }],
      count: [{ $count: 'total' }],
    } },
  ];
  const [result] = await Room.aggregate(pipeline).collation({ locale: 'en', numericOrdering: true });
  const total = result?.count?.[0]?.total || 0;
  const items = (result?.items || []).map((room) => user.role === 'TENANT' ? publicRoom(room, room.occupancy) : room);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function createRoom(user, hostelId, input) {
  return withTransaction(async (session) => {
    const hostel = await Hostel.findOne({ _id: hostelId, ...ownerScope(user), isDeleted: false, isActive: true, ...(user.role === 'ADMIN' ? {} : { isBlocked: { $ne: true } }) }).session(session);
    if (!hostel) {
      if (user.role !== 'ADMIN' && await Hostel.exists({ _id: hostelId, isBlocked: true, isDeleted: false }).session(session)) throw new AppError(423, 'This hostel is blocked. Room management is temporarily unavailable.', 'HOSTEL_BLOCKED');
      throw new AppError(404, 'Hostel not found or inactive.', 'HOSTEL_NOT_FOUND');
    }
    ensureRoomPolicy(input.genderEligibility, hostel.accommodationPolicy);
    const lockedHostel = await Hostel.updateOne({ _id: hostelId, __v: hostel.__v, isDeleted: false, isActive: true, ...(user.role === 'ADMIN' ? {} : { isBlocked: { $ne: true } }) }, { $inc: { __v: 1 } }, { session });
    if (!lockedHostel.modifiedCount) throw new AppError(409, 'The hostel changed while you were adding a room. Refresh and try again.', 'CONCURRENT_UPDATE');
    const [room] = await Room.create([{ ...pick(input, ['identifier', 'sharingType', 'maxCapacity', 'genderEligibility', 'defaultRentPaise', 'facilities', 'notes']), hostelId }], { session });
    await RoomConfigurationHistory.create([{ roomId: room._id, hostelId, actorId: user._id, reason: 'Initial room configuration', previous: {}, next: Object.fromEntries(roomSnapshotFields.map((key) => [key, room[key]])) }], { session });
    await AuditLog.create([{ actorId: user._id, action: 'ROOM_CREATED', entityType: 'ROOM', entityId: room._id, reason: 'Room created', before: null, after: { hostelId, identifier: room.identifier, maxCapacity: room.maxCapacity } }], { session });
    return room;
  });
}

async function requireRoom(user, roomId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false });
  if (!room) throw new AppError(404, 'Room not found.', 'ROOM_NOT_FOUND');
  await requireHostel(user, room.hostelId);
  return room;
}

export async function updateRoom(user, roomId, input) {
  const room = await requireRoom(user, roomId);
  const hostel = await requireHostel(user, room.hostelId);
  const changes = pick(input, editableRoomFields);
  const nextCapacity = changes.maxCapacity ?? room.maxCapacity;
  const nextSharing = changes.sharingType ?? room.sharingType;
  const nextEligibility = changes.genderEligibility ?? room.genderEligibility;
  if (nextSharing > nextCapacity) throw new AppError(422, 'Maximum capacity cannot be below the sharing type.', 'INVALID_ROOM_CAPACITY');
  ensureRoomPolicy(nextEligibility, hostel.accommodationPolicy);
  const occupants = await activeOccupants(room._id);
  if (nextCapacity < occupants.length) throw new AppError(409, `Capacity cannot be reduced below the ${occupants.length} current occupant(s).`, 'CAPACITY_BELOW_OCCUPANCY');
  if (nextEligibility !== room.genderEligibility) {
    const incompatible = occupants.find((tenant) => tenant.gender !== nextEligibility && nextEligibility !== 'ANY');
    if (incompatible) throw new AppError(409, 'Room eligibility cannot change while an occupant would become ineligible.', 'ROOM_HAS_INCOMPATIBLE_OCCUPANTS');
  }
  if (changes.isActive === false && occupants.length) throw new AppError(409, 'A room with active occupants cannot be deactivated.', 'ROOM_HAS_ACTIVE_OCCUPANTS');
  return withTransaction(async (session) => {
    const lockedHostel = await Hostel.updateOne({ _id: hostel._id, ...ownerScope(user), isDeleted: false, __v: hostel.__v }, { $inc: { __v: 1 } }, { session });
    if (!lockedHostel.modifiedCount) throw new AppError(409, 'The hostel changed while you were editing its room. Refresh and try again.', 'CONCURRENT_UPDATE');
    const previous = Object.fromEntries(roomSnapshotFields.map((key) => [key, room[key]]));
    const updated = await Room.findOneAndUpdate({ _id: roomId, isDeleted: false, __v: room.__v }, { $set: changes, $inc: { __v: 1 } }, { new: true, runValidators: true, session });
    if (!updated) throw new AppError(409, 'The room changed while you were editing it. Refresh and try again.', 'CONCURRENT_UPDATE');
    const next = Object.fromEntries(roomSnapshotFields.map((key) => [key, updated[key]]));
    await RoomConfigurationHistory.create([{ roomId, hostelId: room.hostelId, actorId: user._id, reason: input.reason || '', previous, next }], { session });
    return updated;
  });
}

export async function softDeleteRoom(user, roomId, reason) {
  const room = await requireRoom(user, roomId);
  const occupancy = await getOccupancyByRoom([room._id]);
  if ((occupancy.get(String(room._id)) || 0) > 0) throw new AppError(409, 'A room with active occupants cannot be deleted.', 'ROOM_HAS_ACTIVE_OCCUPANTS');
  return withTransaction(async (session) => {
    const hostel = await Hostel.findOne({ _id: room.hostelId, ...ownerScope(user), isDeleted: false }).session(session);
    if (!hostel) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    const hostelLock = await Hostel.updateOne({ _id: hostel._id, __v: hostel.__v, isDeleted: false }, { $inc: { __v: 1 } }, { session });
    if (!hostelLock.modifiedCount) throw new AppError(409, 'The hostel changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    const result = await Room.updateOne({ _id: roomId, isDeleted: false, __v: room.__v }, { $set: { isDeleted: true, isActive: false, deletedAt: new Date(), deletedBy: user._id, deletionReason: reason || '' }, $inc: { __v: 1 } }, { session });
    if (!result.modifiedCount) throw new AppError(409, 'The room changed while you were editing it. Refresh and try again.', 'CONCURRENT_UPDATE');
    const previous = Object.fromEntries(roomSnapshotFields.map((key) => [key, room[key]]));
    await RoomConfigurationHistory.create([{ roomId, hostelId: room.hostelId, actorId: user._id, reason: reason || 'Room soft-deleted', previous, next: { ...previous, isActive: false, isDeleted: true } }], { session });
    await AuditLog.create([{ actorId: user._id, action: 'ROOM_SOFT_DELETED', entityType: 'ROOM', entityId: room._id, reason: reason || 'Room soft-deleted', before: previous, after: { ...previous, isActive: false, isDeleted: true } }], { session });
    return { deleted: true };
  });
}

export async function getRoomHistory(user, roomId) {
  const room = await Room.findById(roomId);
  if (!room) throw new AppError(404, 'Room not found.', 'ROOM_NOT_FOUND');
  await requireHostel(user, room.hostelId, { includeDeleted: true });
  const items = await RoomConfigurationHistory.find({ roomId: room._id }).sort({ changedAt: -1 }).populate('actorId', 'name role').lean();
  return { items };
}

export async function getRoomDetails(user, roomId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false }).lean();
  if (!room) throw new AppError(404, 'Room not found.', 'ROOM_NOT_FOUND');
  const hostel = await requireHostel(user, room.hostelId);
  const [occupancy, stays] = await Promise.all([
    getRoomOccupancy(room._id),
    Stay.find({ roomId: room._id, status: ACTIVE_STAY_STATUS }).select('tenantId moveInDate agreedMonthlyRentPaise rentTerms securityDepositPaise').populate('tenantId', user.role === 'TENANT' ? 'name' : 'name email phone').lean(),
  ]);
  const occupantCount = occupancy?.occupancy || 0;
  const occupants = stays.filter((stay) => stay.tenantId).map((stay) => user.role === 'TENANT'
    ? { name: stay.tenantId.name }
    : { name: stay.tenantId.name, email: stay.tenantId.email || '', phone: stay.tenantId.phone || '', moveInDate: stay.moveInDate, currentRentPaise: currentRentPaise(stay), securityDepositPaise: stay.securityDepositPaise });
  return { room: { ...publicRoom(room, occupantCount), isActive: room.isActive }, hostel: publicHostel(hostel), occupants };
}

export async function validateAssignmentEligibility(hostelId, roomId, tenantId) {
  const [hostel, room, tenant] = await Promise.all([
    Hostel.findOne({ _id: hostelId, isActive: true, isDeleted: false }),
    Room.findOne({ _id: roomId, hostelId, isActive: true, isDeleted: false }),
    User.findOne({ _id: tenantId, isActive: true, isDeleted: false }).select('_id gender'),
  ]);
  if (!hostel || !room || !tenant) throw new AppError(404, 'The selected hostel, room, or tenant was not found.', 'RESOURCE_NOT_FOUND');
  ensureTenantEligible(tenant.gender, hostel.accommodationPolicy, room.genderEligibility);
  const occupancy = await getOccupancyByRoom([room._id]);
  const current = occupancy.get(String(room._id)) || 0;
  if (current >= room.maxCapacity) throw new AppError(409, 'This room is at capacity.', 'ROOM_FULL');
  return { hostel, room, tenant, currentOccupancy: current };
}
