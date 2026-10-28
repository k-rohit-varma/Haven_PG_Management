import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { Hostel } from '../models/Hostel.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { parseLocalDate } from '../validators/stayValidators.js';
import { currentRentPaise } from '../utils/rentTerms.js';

function ownerScope(user) {
  return user.role === 'OWNER' ? { ownerId: user._id } : {};
}

function inKolkata(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pageMeta(page, limit, total) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function mapMongoConflict(error) {
  if (error?.code === 11000) return new AppError(409, 'A related record conflicts with this change.', 'DUPLICATE_TENANT_WORKFLOW');
  return error;
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) {
      throw new AppError(503, 'This workflow requires MongoDB transaction support. Configure the database as a replica set and retry.', 'TRANSACTIONS_UNAVAILABLE');
    }
    throw mapMongoConflict(error);
  } finally {
    await session.endSession();
  }
}

async function lockHostel(hostel, user, session, { requireActive = true } = {}) {
  const updated = await Hostel.updateOne({ _id: hostel._id, ...ownerScope(user), ...(requireActive ? { isActive: true } : {}), isDeleted: false, __v: hostel.__v }, { $inc: { __v: 1 } }, { session });
  if (!updated.modifiedCount) throw new AppError(409, 'The hostel changed during approval. Refresh and try again.', 'CONCURRENT_UPDATE');
}

async function lockRoom(room, session, { requireActive = true } = {}) {
  const updated = await Room.updateOne({ _id: room._id, hostelId: room.hostelId, ...(requireActive ? { isActive: true } : {}), isDeleted: false, __v: room.__v }, { $inc: { __v: 1 } }, { session });
  if (!updated.modifiedCount) throw new AppError(409, 'The room changed during approval. Refresh and try again.', 'CONCURRENT_UPDATE');
}

async function lockTenant(tenant, session) {
  const lockVersion = tenant.activeStayLockVersion || 0;
  const versionFilter = lockVersion === 0
    ? { $or: [{ activeStayLockVersion: 0 }, { activeStayLockVersion: { $exists: false } }] }
    : { activeStayLockVersion: lockVersion };
  const updated = await User.updateOne({ _id: tenant._id, isActive: true, isDeleted: false, ...versionFilter }, { $inc: { activeStayLockVersion: 1 } }, { session });
  if (!updated.modifiedCount) throw new AppError(409, 'The tenant account changed during approval. Refresh and try again.', 'CONCURRENT_UPDATE');
}

async function requireAuthorizedStay(user, stayId, session) {
  const stay = await Stay.findById(stayId).session(session || null);
  if (!stay) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  if (user.role === 'TENANT' && String(stay.tenantId) !== String(user._id)) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  const hostel = await Hostel.findOne({ _id: stay.hostelId, ...ownerScope(user) }).session(session || null);
  if (!hostel) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  if (hostel.isBlocked && user.role !== 'ADMIN') throw new AppError(423, 'This hostel is blocked. Stay access is temporarily unavailable.', 'HOSTEL_BLOCKED');
  return { stay, hostel };
}

export async function listOwnerStays(user, query) {
  const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true } }).select('_id').lean();
  const accessibleHostelIds = hostels.map((hostel) => hostel._id);
  const filter = { hostelId: { $in: query.hostelId ? accessibleHostelIds.filter((id) => String(id) === query.hostelId) : accessibleHostelIds }, ...(query.status ? { status: query.status } : {}), ...(query.roomId ? { roomId: query.roomId } : {}) };
  if (query.gender) {
    const tenants = await User.find({ role: 'TENANT', gender: query.gender }).select('_id').lean();
    filter.tenantId = { $in: tenants.map(({ _id }) => _id) };
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const [tenants, rooms, matchingHostels] = await Promise.all([
      User.find({ role: 'TENANT', $or: [{ name: pattern }, { email: pattern }, { phone: pattern }] }).select('_id').lean(),
      Room.find({ hostelId: { $in: accessibleHostelIds }, identifier: pattern }).select('_id').lean(),
      Hostel.find({ _id: { $in: accessibleHostelIds }, name: pattern }).select('_id').lean(),
    ]);
    filter.$or = [
      { tenantId: { $in: tenants.map(({ _id }) => _id) } },
      { roomId: { $in: rooms.map(({ _id }) => _id) } },
      { hostelId: { $in: matchingHostels.map(({ _id }) => _id) } },
    ];
  }
  const [items, total] = await Promise.all([
    Stay.find(filter).sort({ moveInDate: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('tenantId', 'name email gender')
      .populate('hostelId', 'name city')
      .populate('roomId', 'identifier sharingType maxCapacity').lean(),
    Stay.countDocuments(filter),
  ]);
  return { items: items.map((stay) => ({ ...stay, currentRentPaise: currentRentPaise(stay) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function listHostelStays(user, hostelId, query) {
  const hostel = await Hostel.findOne({ _id: hostelId, ...ownerScope(user), ...(user.role === 'ADMIN' ? {} : { isBlocked: { $ne: true } }) });
  if (!hostel) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  const filter = { hostelId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    Stay.find(filter).sort({ moveInDate: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('tenantId', 'name email gender')
      .populate('roomId', 'identifier sharingType maxCapacity').lean(),
    Stay.countDocuments(filter),
  ]);
  return { items: items.map((stay) => ({ ...stay, currentRentPaise: currentRentPaise(stay) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function listTenantStays(user, tenantId, query) {
  const tenant = await User.findOne({ _id: tenantId, role: 'TENANT' }).select('_id');
  if (!tenant) throw new AppError(404, 'Tenant not found.', 'TENANT_NOT_FOUND');
  const scopeHostels = user.role === 'ADMIN' ? null : await Hostel.find({ ownerId: user._id, isBlocked: { $ne: true } }).select('_id').lean();
  const filter = { tenantId, ...(query.status ? { status: query.status } : {}), ...(scopeHostels ? { hostelId: { $in: scopeHostels.map((hostel) => hostel._id) } } : {}) };
  const [items, total] = await Promise.all([
    Stay.find(filter).sort({ moveInDate: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('hostelId', 'name city address').populate('roomId', 'identifier sharingType').lean(),
    Stay.countDocuments(filter),
  ]);
  return { items: items.map((stay) => ({ ...stay, currentRentPaise: currentRentPaise(stay) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function getStay(user, stayId) {
  const { stay } = await requireAuthorizedStay(user, stayId);
  const populated = await Stay.findById(stay._id)
    .populate('hostelId', 'name city address accommodationPolicy')
    .populate('roomId', 'identifier sharingType maxCapacity genderEligibility')
    .populate(user.role === 'TENANT' ? { path: 'tenantId', select: 'name email gender' } : { path: 'tenantId', select: 'name email gender' })
    .lean();
  return { ...populated, currentRentPaise: currentRentPaise(populated) };
}

export async function markStayLeft(user, stayId, input) {
  return withTransaction(async (session) => {
    const { stay, hostel } = await requireAuthorizedStay(user, stayId, session);
    if (user.role === 'TENANT') throw new AppError(403, 'Only the hostel owner can close a stay.', 'FORBIDDEN');
    if (stay.status !== 'ACTIVE') throw new AppError(409, 'Only an active stay can be marked as left.', 'STAY_NOT_ACTIVE');
    const leavingDate = parseLocalDate(input.leavingDate);
    if (input.leavingDate < inKolkata(stay.moveInDate)) throw new AppError(422, 'Leaving date cannot be before the confirmed move-in date.', 'INVALID_STAY_DATE');
    if (input.leavingDate > inKolkata(new Date())) throw new AppError(422, 'Leaving date cannot be in the future.', 'INVALID_STAY_DATE');

    const room = await Room.findOne({ _id: stay.roomId, hostelId: hostel._id }).session(session);
    const tenant = await User.findOne({ _id: stay.tenantId, isDeleted: false }).select('+activeStayLockVersion').session(session);
    if (!room || !tenant) throw new AppError(409, 'The room or tenant record for this stay is unavailable.', 'STAY_REFERENCE_UNAVAILABLE');
    await lockHostel(hostel, user, session, { requireActive: false });
    await lockRoom(room, session, { requireActive: false });
    await lockTenant(tenant, session);

    const now = new Date();
    const updated = await Stay.findOneAndUpdate({ _id: stay._id, status: 'ACTIVE', moveInDate: stay.moveInDate }, {
      $set: { status: 'LEFT', leavingDate },
      $push: { events: { fromStatus: 'ACTIVE', toStatus: 'LEFT', actorId: user._id, at: now, reason: input.reason || '' } },
    }, { new: true, runValidators: true, session });
    if (!updated) throw new AppError(409, 'The stay was already closed. Refresh and try again.', 'STAY_NOT_ACTIVE');
    return updated;
  });
}
