import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { Hostel } from '../models/Hostel.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { RentDue } from '../models/RentDue.js';
import { Payment } from '../models/Payment.js';
import { TenantApplication } from '../models/TenantApplication.js';
import { RoomConfigurationHistory } from '../models/RoomConfigurationHistory.js';
import { parseLocalDate } from '../validators/stayValidators.js';
import { env } from '../config/environment.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';
import { getOccupancyByRoom } from '../utils/roomOccupancy.js';

const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const inKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

async function transaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 11000) throw new AppError(409, error.keyPattern?.phone ? 'An account with this phone number already exists.' : 'An account with this email already exists.', error.keyPattern?.phone ? 'PHONE_IN_USE' : 'EMAIL_IN_USE');
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This administrative workflow requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}

function logChange(actorId, action, entityType, entityId, reason, before, after, requestId, session) {
  return AuditLog.create([{ actorId, action, entityType, entityId, reason, before, after, requestId: requestId || '' }], { session });
}

export async function listUsers(query) {
  const filter = { ...(query.role ? { role: query.role } : {}), ...(query.isActive !== undefined ? { isActive: query.isActive } : {}), ...(query.isDeleted !== undefined ? { isDeleted: query.isDeleted } : query.includeDeleted ? {} : { isDeleted: false }) };
  if (query.search) {
    const pattern = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).select('name email phone role gender isActive isDeleted deletedAt createdAt updatedAt +isSystemAdmin').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    User.countDocuments(filter),
  ]);
  const configuredPhone = normalizeIndianPhone(env.ADMIN_PHONE || '');
  return { items: items.map(({ isSystemAdmin, ...item }) => ({ ...item, isProtectedAdmin: item.role === 'ADMIN' && (isSystemAdmin || (Boolean(configuredPhone) && item.phone === configuredPhone)) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function createOwner(admin, input, requestId = '') {
  return transaction(async (session) => {
    const contact = input.email ? { email: input.email.toLowerCase() } : { phone: normalizeIndianPhone(input.phone) };
    if (await User.exists(contact).session(session)) throw new AppError(409, input.email ? 'An account with this email already exists.' : 'An account with this phone number already exists.', input.email ? 'EMAIL_IN_USE' : 'PHONE_IN_USE');
    const passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
    const [owner] = await User.create([{ name: input.name, ...contact, passwordHash, role: 'OWNER', gender: 'PREFER_NOT_TO_SAY' }], { session });
    await logChange(admin._id, 'OWNER_ACCOUNT_CREATED', 'USER', owner._id, input.reason, null, { name: owner.name, ...contact, role: owner.role }, requestId, session);
    return owner;
  });
}

export async function changeOwnerPassword(admin, userId, input, requestId = '') {
  return transaction(async (session) => {
    const owner = await User.findOne({ _id: userId, role: 'OWNER', isDeleted: false }).select('+passwordHash').session(session);
    if (!owner) throw new AppError(404, 'Owner account not found.', 'OWNER_NOT_FOUND');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const before = { passwordChanged: false };
    owner.passwordHash = passwordHash;
    await owner.save({ session });
    await logChange(admin._id, 'OWNER_PASSWORD_CHANGED', 'USER', owner._id, input.reason, before, { passwordChanged: true }, requestId, session);
    return User.findById(owner._id).select('name email phone role isActive').session(session);
  });
}

export async function listHostels(query) {
  const filter = { ...(query.isActive !== undefined ? { isActive: query.isActive } : {}), ...(query.includeDeleted ? {} : { isDeleted: false }) };
  const [items, total] = await Promise.all([
    Hostel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('ownerId', 'name email').lean(),
    Hostel.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function listRooms(query) {
  const match = { ...(query.hostelId ? { hostelId: new mongoose.Types.ObjectId(query.hostelId) } : {}), ...(query.isActive !== undefined ? { isActive: query.isActive } : {}), ...(query.includeDeleted ? {} : { isDeleted: false }) };
  if (query.search) match.identifier = { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (query.genderEligibility) match.genderEligibility = query.genderEligibility;
  if (query.sharingType !== undefined) match.sharingType = query.sharingType;
  if (query.minCapacity !== undefined || query.maxCapacity !== undefined) match.maxCapacity = { ...(query.minCapacity !== undefined ? { $gte: query.minCapacity } : {}), ...(query.maxCapacity !== undefined ? { $lte: query.maxCapacity } : {}) };
  if (query.minRentPaise !== undefined || query.maxRentPaise !== undefined) match.defaultRentPaise = { ...(query.minRentPaise !== undefined ? { $gte: query.minRentPaise } : {}), ...(query.maxRentPaise !== undefined ? { $lte: query.maxRentPaise } : {}) };
  const sort = { identifier_asc: { identifier: 1, _id: 1 }, identifier_desc: { identifier: -1, _id: 1 }, rent_asc: { defaultRentPaise: 1, identifier: 1, _id: 1 }, rent_desc: { defaultRentPaise: -1, identifier: 1, _id: 1 }, available_desc: { availableBeds: -1, identifier: 1, _id: 1 }, occupancy_desc: { occupancy: -1, identifier: 1, _id: 1 }, created_desc: { createdAt: -1, _id: 1 } }[query.sortBy || 'identifier_asc'];
  const availabilityMatch = query.availability === 'AVAILABLE' ? { isActive: true, availableBeds: { $gt: 0 } }
    : query.availability === 'PARTIAL' ? { isActive: true, $expr: { $and: [{ $gt: ['$occupancy', 0] }, { $lt: ['$occupancy', '$maxCapacity'] }] } }
      : query.availability === 'FULL' ? { isActive: true, $expr: { $gte: ['$occupancy', '$maxCapacity'] } }
        : query.availability === 'INACTIVE' ? { isActive: false } : null;
  const [result] = await Room.aggregate([
    { $match: match },
    { $lookup: { from: 'stays', let: { roomId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$roomId', '$$roomId'] }, { $eq: ['$status', 'ACTIVE'] }] } } }, { $count: 'count' }], as: 'activeStayCounts' } },
    { $addFields: { occupancy: { $ifNull: [{ $arrayElemAt: ['$activeStayCounts.count', 0] }, 0] } } },
    { $addFields: { availableBeds: { $max: [0, { $subtract: ['$maxCapacity', '$occupancy'] }] } } },
    ...(query.minAvailableBeds !== undefined ? [{ $match: { availableBeds: { $gte: query.minAvailableBeds } } }] : []),
    ...(availabilityMatch ? [{ $match: availabilityMatch }] : []),
    { $lookup: { from: 'hostels', localField: 'hostelId', foreignField: '_id', as: 'hostel' } },
    { $addFields: { hostelId: { $arrayElemAt: ['$hostel', 0] } } },
    { $facet: { items: [{ $sort: sort }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }, { $project: { activeStayCounts: 0, hostel: 0, 'hostelId.ownerId': 0 } }], count: [{ $count: 'total' }] } },
  ]).collation({ locale: 'en', numericOrdering: true });
  const total = result?.count?.[0]?.total || 0;
  return { items: result?.items || [], pagination: pageMeta(query.page, query.limit, total) };
}

export async function setUserStatus(admin, userId, input, requestId = '') {
  if (String(admin._id) === userId && !input.isActive) {
    await rejectedAdminAttempt(admin, 'USER_DEACTIVATION_REJECTED', admin, { isActive: true }, { isActive: false }, input.reason || 'Self-deactivation attempt');
    throw new AppError(422, 'You cannot deactivate your own administrator account.', 'SELF_DEACTIVATION');
  }
  return transaction(async (session) => {
    const user = await User.findOne({ _id: userId, isDeleted: false }).select('+isSystemAdmin').session(session);
    if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    const configuredPhone = normalizeIndianPhone(env.ADMIN_PHONE || '');
    if (!input.isActive && user.role === 'ADMIN' && (user.isSystemAdmin || (configuredPhone && user.phone === configuredPhone))) {
      await rejectedAdminAttempt(admin, 'USER_DEACTIVATION_REJECTED', user, { isActive: true }, { isActive: false }, input.reason || 'Protected system administrator deactivation attempted');
      throw new AppError(409, 'The configured system administrator is protected from deactivation.', 'PROTECTED_ADMIN');
    }
    if (!input.isActive && user.role === 'ADMIN') {
      const anchor = await User.findOne({ role: 'ADMIN', isActive: true, isDeleted: false }).select('_id').session(session);
      if (anchor) await User.collection.updateOne({ _id: anchor._id }, { $inc: { adminGuardVersion: 1 } }, { session });
      const usableAdmins = await User.countDocuments({ role: 'ADMIN', isActive: true, isDeleted: false }).session(session);
      if (usableAdmins <= 1) {
        await rejectedAdminAttempt(admin, 'USER_DEACTIVATION_REJECTED', user, { role: 'ADMIN', isActive: true }, { role: 'ADMIN', isActive: false }, input.reason || 'Last administrator deactivation attempted');
        throw new AppError(409, 'At least one active administrator account must remain.', 'LAST_ADMIN');
      }
    }
    const before = { isActive: user.isActive, isDeleted: user.isDeleted };
    const updated = await User.updateOne({ _id: user._id, isActive: user.isActive, isDeleted: false }, { $set: { isActive: input.isActive } }, { session });
    if (!updated.modifiedCount && user.isActive !== input.isActive) throw new AppError(409, 'The account status changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    const after = { isActive: input.isActive, isDeleted: false };
    await logChange(admin._id, input.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'USER', user._id, input.reason, before, after, requestId, session);
    return User.findById(user._id).select('name email phone role gender isActive isDeleted').session(session);
  });
}

export async function listAuditLogs(query) {
  const filter = { ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}), ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.action ? { action: new RegExp(query.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {}) };
  if (query.from || query.to) filter.occurredAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ occurredAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('actorId', 'name email role').lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

async function rejectedAdminAttempt(admin, action, target, before, attempted, reason) {
  await AuditLog.create({ actorId: admin._id, action, entityType: 'USER', entityId: target._id, reason, before, after: attempted });
}

export async function setUserRole(admin, userId, input, requestId = '') {
  if (String(admin._id) === userId) {
    await rejectedAdminAttempt(admin, 'USER_ROLE_CHANGE_REJECTED', admin, { role: 'ADMIN' }, { role: input.role }, input.reason || 'Self role change attempted');
    throw new AppError(422, 'You cannot change your own role.', 'SELF_ROLE_CHANGE');
  }
  return transaction(async (session) => {
    const user = await User.findOne({ _id: userId, isDeleted: false }).select('+isSystemAdmin').session(session);
    if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    const before = { role: user.role };
    const after = { role: input.role };
    const configuredPhone = normalizeIndianPhone(env.ADMIN_PHONE || '');
    const protectedAdmin = user.role === 'ADMIN' && (user.isSystemAdmin || (configuredPhone && user.phone === configuredPhone));
    const reject = async (message, code) => {
      await rejectedAdminAttempt(admin, 'USER_ROLE_CHANGE_REJECTED', user, before, after, input.reason || message);
      throw new AppError(409, message, code);
    };
    if (protectedAdmin && input.role !== 'ADMIN') return reject('The configured system administrator role is protected.', 'PROTECTED_ADMIN');
    if (user.role === input.role) throw new AppError(422, 'The account already has this role.', 'ROLE_UNCHANGED');
    if (user.role === 'ADMIN' && input.role !== 'ADMIN') {
      const anchor = await User.findOne({ role: 'ADMIN', isActive: true, isDeleted: false }).select('_id').session(session);
      if (anchor) await User.collection.updateOne({ _id: anchor._id }, { $inc: { adminGuardVersion: 1 } }, { session });
      const usableAdmins = await User.countDocuments({ role: 'ADMIN', isActive: true, isDeleted: false }).session(session);
      if (usableAdmins <= 1) return reject('At least one active administrator account must remain.', 'LAST_ADMIN');
    }
    if (user.role === 'OWNER' && input.role !== 'OWNER' && await Hostel.exists({ ownerId: user._id, isDeleted: false }).session(session)) {
      return reject('This owner manages hostels. Transfer or close those resources before changing the role.', 'OWNER_HAS_PROPERTIES');
    }
    if (user.role === 'TENANT' && input.role !== 'TENANT' && (await Stay.exists({ tenantId: user._id, status: 'ACTIVE' }).session(session) || await TenantApplication.exists({ tenantId: user._id, status: 'PENDING' }).session(session))) {
      return reject('This tenant has an active stay or pending application. Resolve it before changing the role.', 'TENANT_HAS_ACTIVE_RECORDS');
    }
    const changed = await User.collection.updateOne({ _id: user._id, role: user.role, isDeleted: false }, { $set: { role: input.role } }, { session });
    if (!changed.modifiedCount) throw new AppError(409, 'The account changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    await logChange(admin._id, 'USER_ROLE_CHANGED', 'USER', user._id, input.reason || 'Role changed by administrator', before, after, requestId, session);
    return User.findById(user._id).select('name email phone role gender isActive isDeleted createdAt').session(session);
  });
}

export async function getSystemSummary() {
  const today = new Date(`${inKolkata(new Date())}T00:00:00+05:30`);
  const activeStayIds = await Stay.distinct('_id', { status: 'ACTIVE' });
  const activeStayFilter = { stayId: { $in: activeStayIds } };
  const [userRoles, hostels, rooms, activeStays, overdueDues, activeRooms] = await Promise.all([
    User.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$role', count: { $sum: 1 } } }]), Hostel.countDocuments({ isDeleted: false }), Room.countDocuments({ isDeleted: false }), Stay.countDocuments({ status: 'ACTIVE' }),
    RentDue.aggregate([{ $match: { ...activeStayFilter, dueDate: { $lt: today }, $expr: { $gt: [{ $subtract: ['$amountDuePaise', '$amountSettledPaise'] }, 0] } } }, { $group: { _id: null, count: { $sum: 1 }, amountPaise: { $sum: { $subtract: ['$amountDuePaise', '$amountSettledPaise'] } } } }]),
    Room.find({ isDeleted: false, isActive: true }).select('_id sharingType maxCapacity').lean(),
  ]);
  const occupancyByRoom = await getOccupancyByRoom(activeRooms.map((room) => room._id));
  const sharingSummary = new Map();
  let vacantCapacity = 0;
  let availableRooms = 0;
  for (const room of activeRooms) {
    const occupiedBeds = occupancyByRoom.get(String(room._id)) || 0;
    const availableBeds = Math.max(0, room.maxCapacity - occupiedBeds);
    vacantCapacity += availableBeds;
    if (availableBeds > 0) availableRooms += 1;
    const item = sharingSummary.get(room.sharingType) || { sharingType: room.sharingType, totalRooms: 0, totalCapacity: 0, occupiedBeds: 0, availableBeds: 0 };
    item.totalRooms += 1; item.totalCapacity += room.maxCapacity; item.occupiedBeds += occupiedBeds; item.availableBeds += availableBeds;
    sharingSummary.set(room.sharingType, item);
  }
  const roles = Object.fromEntries(userRoles.map(({ _id, count }) => [_id, count]));
  const overdue = overdueDues[0] || { count: 0, amountPaise: 0 };
  const totalUsers = Object.values(roles).reduce((sum, value) => sum + value, 0);
  return { users: totalUsers, userRoles: { ADMIN: roles.ADMIN || 0, OWNER: roles.OWNER || 0, TENANT: roles.TENANT || 0 }, hostels, rooms, activeStays, availableRooms, vacantCapacity, sharingSummary: [...sharingSummary.values()].sort((a, b) => a.sharingType - b.sharingType), overdueDueCount: overdue.count, overduePaise: overdue.amountPaise };
}

export async function restoreRecord(admin, entityType, entityId, reason, requestId = '') {
  if (!['USER', 'HOSTEL', 'ROOM'].includes(entityType)) throw new AppError(422, 'This record type cannot be restored through this workflow.', 'RESTORE_TYPE_NOT_ALLOWED');
  return transaction(async (session) => {
    const Model = { USER: User, HOSTEL: Hostel, ROOM: Room }[entityType];
    const record = await Model.findOne({ _id: entityId, isDeleted: true }).session(session);
    if (!record) throw new AppError(404, 'Deleted record not found.', 'DELETED_RECORD_NOT_FOUND');
    if (entityType === 'ROOM') {
      const hostel = await Hostel.findOne({ _id: record.hostelId, isDeleted: false }).session(session);
      if (!hostel) throw new AppError(409, 'Restore the parent hostel before restoring this room.', 'HOSTEL_NOT_RESTORED');
      if (await Room.exists({ hostelId: record.hostelId, identifier: record.identifier, isDeleted: false }).session(session)) throw new AppError(409, 'An active room already uses this identifier.', 'ROOM_IDENTIFIER_CONFLICT');
    }
    const before = { isDeleted: record.isDeleted, deletedAt: record.deletedAt, deletedBy: record.deletedBy, deletionReason: record.deletionReason };
    const after = { isDeleted: false, deletedAt: null, deletedBy: null, deletionReason: '' };
    await Model.updateOne({ _id: record._id, isDeleted: true }, { $set: after }, { session });
    if (entityType === 'ROOM') await RoomConfigurationHistory.create([{
      roomId: record._id, hostelId: record.hostelId, actorId: admin._id, reason,
      previous: { identifier: record.identifier, sharingType: record.sharingType, maxCapacity: record.maxCapacity, genderEligibility: record.genderEligibility, defaultRentPaise: record.defaultRentPaise, isActive: record.isActive, isDeleted: true },
      next: { identifier: record.identifier, sharingType: record.sharingType, maxCapacity: record.maxCapacity, genderEligibility: record.genderEligibility, defaultRentPaise: record.defaultRentPaise, isActive: record.isActive, isDeleted: false },
    }], { session });
    await logChange(admin._id, `${entityType}_RESTORED`, entityType, record._id, reason, before, after, requestId, session);
    return Model.findById(record._id).session(session);
  });
}

function cycleDay(anchor, offset) {
  const [year, month, day] = anchor.split('-').map(Number);
  const targetMonth = month - 1 + offset;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function nextRentCycle(stay, session) {
  const latestDue = await RentDue.findOne({ stayId: stay._id }).sort({ dueDate: -1 }).select('dueDate').session(session).lean();
  const latestTermMs = stay.rentTerms.reduce((latest, term) => Math.max(latest, term.effectiveFrom.valueOf()), 0);
  const boundary = [inKolkata(new Date()), latestDue ? inKolkata(latestDue.dueDate) : '', latestTermMs ? inKolkata(new Date(latestTermMs)) : ''].sort().at(-1);
  for (let month = 1; month < 1200; month += 1) {
    const date = cycleDay(inKolkata(stay.moveInDate), month);
    if (date > boundary) return date;
  }
  throw new AppError(422, 'Could not find a future rent cycle.', 'RENT_CYCLE_NOT_FOUND');
}

export async function correctStayFinancials(admin, stayId, input, requestId = '') {
  return transaction(async (session) => {
    const stay = await Stay.findById(stayId).session(session);
    if (!stay) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
    const lock = await Stay.updateOne({ _id: stay._id, __v: stay.__v }, { $inc: { __v: 1 } }, { session });
    if (!lock.modifiedCount) throw new AppError(409, 'The stay changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    const before = { moveInDate: stay.moveInDate, rentCycleAnchorDay: stay.rentCycleAnchorDay, agreedMonthlyRentPaise: stay.agreedMonthlyRentPaise, rentTerms: stay.rentTerms.map((term) => ({ monthlyRentPaise: term.monthlyRentPaise, effectiveFrom: term.effectiveFrom })) };
    const after = { ...before, rentTerms: [...before.rentTerms] };
    const set = {};
    const push = {};
    if (input.moveInDate) {
      if (stay.leavingDate && input.moveInDate > inKolkata(stay.leavingDate)) throw new AppError(422, 'Corrected move-in date cannot be after the leaving date.', 'INVALID_STAY_DATE');
      const correctedDate = parseLocalDate(input.moveInDate);
      after.moveInDate = correctedDate;
      after.rentCycleAnchorDay = Number(input.moveInDate.slice(-2));
      // Mongoose immutability is intentionally bypassed only in this audited admin workflow.
      await Stay.collection.updateOne({ _id: stay._id }, { $set: { moveInDate: correctedDate, rentCycleAnchorDay: after.rentCycleAnchorDay } }, { session });
    }
    if (input.agreedMonthlyRentPaise !== undefined) {
      const effectiveFromDay = await nextRentCycle(stay, session);
      const currentTerms = stay.rentTerms.filter((term) => inKolkata(term.effectiveFrom) <= effectiveFromDay).sort((a, b) => b.effectiveFrom - a.effectiveFrom);
      const oldRent = currentTerms[0]?.monthlyRentPaise || stay.agreedMonthlyRentPaise;
      if (oldRent === input.agreedMonthlyRentPaise) throw new AppError(422, 'Corrected rent must differ from the current term.', 'RENT_UNCHANGED');
      if (await RentDue.exists({ stayId: stay._id, dueDate: { $gte: parseLocalDate(effectiveFromDay) } }).session(session)) throw new AppError(409, 'A rent due already exists on or after the correction cycle.', 'RENT_DUE_ALREADY_GENERATED');
      push.rentTerms = { monthlyRentPaise: input.agreedMonthlyRentPaise, effectiveFrom: parseLocalDate(effectiveFromDay), actorId: admin._id, reason: input.reason, recordedAt: new Date() };
      after.rentTerms.push({ monthlyRentPaise: input.agreedMonthlyRentPaise, effectiveFrom: parseLocalDate(effectiveFromDay) });
    }
    if (input.depositAdjustmentPaise !== undefined) {
      if (!Number.isInteger(input.depositAdjustmentPaise) || input.depositAdjustmentPaise === 0) throw new AppError(422, 'Deposit adjustment must be a non-zero integer number of paise.', 'INVALID_DEPOSIT_ADJUSTMENT');
      const rows = await DepositTransaction.aggregate([
        { $match: { stayId: stay._id } },
        { $group: { _id: null, balance: { $sum: { $cond: [{ $in: ['$type', ['RECEIVED', 'ADJUSTMENT_CREDIT']] }, '$amountPaise', { $multiply: ['$amountPaise', -1] }] } } } },
      ]).session(session);
      const balance = rows[0]?.balance || 0;
      if (balance + input.depositAdjustmentPaise < 0) throw new AppError(409, 'The adjustment would make the deposit balance negative.', 'DEPOSIT_BALANCE_TOO_LOW');
      await DepositTransaction.create([{
        stayId: stay._id, tenantId: stay.tenantId, hostelId: stay.hostelId,
        type: input.depositAdjustmentPaise > 0 ? 'ADJUSTMENT_CREDIT' : 'ADJUSTMENT_DEBIT',
        amountPaise: Math.abs(input.depositAdjustmentPaise), transactionDate: new Date(), reference: '',
        reason: input.reason, actorId: admin._id,
      }], { session });
      after.depositAdjustmentPaise = input.depositAdjustmentPaise;
      after.depositBalancePaise = balance + input.depositAdjustmentPaise;
      before.depositBalancePaise = balance;
    }
    if (input.moveInDate && input.agreedMonthlyRentPaise !== undefined) throw new AppError(422, 'Correct move-in dates and rent terms in separate audited corrections.', 'SEPARATE_FINANCIAL_CORRECTIONS_REQUIRED');
    if (input.moveInDate) after.moveInDate = parseLocalDate(input.moveInDate);
    if (input.agreedMonthlyRentPaise !== undefined) after.nextMonthlyRentPaise = input.agreedMonthlyRentPaise;
    if (Object.keys(push).length) await Stay.updateOne({ _id: stay._id }, { $push: push }, { session });
    await logChange(admin._id, 'STAY_FINANCIAL_TERMS_CORRECTED', 'STAY', stay._id, input.reason, before, after, requestId, session);
    return { stayId: stay._id, before, after };
  });
}
