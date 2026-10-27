import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { Hostel } from '../models/Hostel.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { TenantApplication } from '../models/TenantApplication.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { parseLocalDate } from '../validators/stayValidators.js';
import { notifyOnce } from './notificationWriter.js';

function ownerScope(user) {
  return user.role === 'OWNER' ? { ownerId: user._id } : {};
}

function inKolkata(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextCycleDay(anchorDay) {
  const [year, month, day] = anchorDay.split('-').map(Number);
  const targetMonth = month;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function pageMeta(page, limit, total) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

function mapMongoConflict(error) {
  if (error?.code === 11000) return new AppError(409, 'A pending application or active stay already exists for this tenant.', 'DUPLICATE_TENANT_WORKFLOW');
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

async function countRoomOccupancy(roomId, session) {
  return Stay.countDocuments({ roomId, status: 'ACTIVE' }).session(session);
}

async function lockHostel(hostel, user, session, { requireActive = true } = {}) {
  const updated = await Hostel.updateOne({ _id: hostel._id, ...ownerScope(user), ...(requireActive ? { isActive: true } : {}), isDeleted: false, __v: hostel.__v }, { $inc: { __v: 1 } }, { session });
  if (!updated.modifiedCount) throw new AppError(409, 'The hostel changed during approval. Refresh and try again.', 'CONCURRENT_UPDATE');
}

async function lockRoom(room, session) {
  const updated = await Room.updateOne({ _id: room._id, hostelId: room.hostelId, isActive: true, isDeleted: false, __v: room.__v }, { $inc: { __v: 1 } }, { session });
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

function assertEligible(tenant, hostel, room) {
  if (hostel.accommodationPolicy === 'MALE_ONLY' && tenant.gender !== 'MALE') throw new AppError(422, 'This hostel is limited to male accommodation.', 'TENANT_NOT_ELIGIBLE');
  if (hostel.accommodationPolicy === 'FEMALE_ONLY' && tenant.gender !== 'FEMALE') throw new AppError(422, 'This hostel is limited to female accommodation.', 'TENANT_NOT_ELIGIBLE');
  if (room.genderEligibility !== 'ANY' && room.genderEligibility !== tenant.gender) throw new AppError(422, 'This room is not configured for the tenant’s profile.', 'TENANT_NOT_ELIGIBLE');
}

async function requireOwnedApplication(user, applicationId, session) {
  const application = await TenantApplication.findById(applicationId).session(session || null);
  if (!application) throw new AppError(404, 'Tenant application not found.', 'APPLICATION_NOT_FOUND');
  const hostel = await Hostel.findOne({ _id: application.hostelId, ...ownerScope(user) }).session(session || null);
  if (!hostel) throw new AppError(404, 'Tenant application not found.', 'APPLICATION_NOT_FOUND');
  if (hostel.isBlocked) throw new AppError(423, 'This hostel is blocked. Application decisions are unavailable until it is unblocked.', 'HOSTEL_BLOCKED');
  return { application, hostel };
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

export async function createApplication(user, hostelId) {
  if (user.role !== 'TENANT') throw new AppError(403, 'Only tenants can submit an application.', 'FORBIDDEN');
  const [hostel, activeStay, pendingApplication] = await Promise.all([
    Hostel.findOne({ _id: hostelId, isActive: true, isDeleted: false, isBlocked: { $ne: true } }),
    Stay.exists({ tenantId: user._id, status: 'ACTIVE' }),
    TenantApplication.exists({ tenantId: user._id, hostelId, status: 'PENDING' }),
  ]);
  if (!hostel) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  if ((hostel.accommodationPolicy === 'MALE_ONLY' && user.gender !== 'MALE') || (hostel.accommodationPolicy === 'FEMALE_ONLY' && user.gender !== 'FEMALE')) throw new AppError(422, 'Your profile does not meet this hostel’s accommodation policy.', 'TENANT_NOT_ELIGIBLE');
  if (activeStay) throw new AppError(409, 'Close your current stay before applying for another hostel.', 'ACTIVE_STAY_EXISTS');
  if (pendingApplication) throw new AppError(409, 'You already have a pending application for this hostel.', 'PENDING_APPLICATION_EXISTS');
  try {
    return await TenantApplication.create({ tenantId: user._id, hostelId, status: 'PENDING', events: [{ fromStatus: null, toStatus: 'PENDING', actorId: user._id, reason: 'Application submitted' }] });
  } catch (error) {
    if (error?.code === 11000) throw new AppError(409, 'You already have a pending application for this hostel.', 'PENDING_APPLICATION_EXISTS');
    throw mapMongoConflict(error);
  }
}

export async function listMyApplications(user, query) {
  const filter = { tenantId: user._id, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    TenantApplication.find(filter).sort({ submittedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('hostelId', 'name city address accommodationPolicy isActive').lean(),
    TenantApplication.countDocuments(filter),
  ]);
  const assigned = await Stay.find({ applicationId: { $in: items.map(({ _id }) => _id) } }).select('applicationId').lean();
  const assignedIds = new Set(assigned.map(({ applicationId }) => String(applicationId)));
  return { items: items.map((item) => ({ ...item, stayAssigned: assignedIds.has(String(item._id)) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function listOwnerApplications(user, query, hostelId) {
  let hostelFilter = { ...ownerScope(user) };
  if (hostelId) hostelFilter._id = hostelId;
  const hostels = await Hostel.find({ ...hostelFilter, isBlocked: { $ne: true } }).select('_id name city ownerId').lean();
  if (hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  const filter = { hostelId: { $in: hostels.map((hostel) => hostel._id) }, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    TenantApplication.find(filter).sort({ submittedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('tenantId', 'name email gender').populate('hostelId', 'name city').lean(),
    TenantApplication.countDocuments(filter),
  ]);
  const assigned = await Stay.find({ applicationId: { $in: items.map(({ _id }) => _id) } }).select('applicationId').lean();
  const assignedIds = new Set(assigned.map(({ applicationId }) => String(applicationId)));
  return { items: items.map((item) => ({ ...item, stayAssigned: assignedIds.has(String(item._id)) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function rejectApplication(user, applicationId, reason) {
  const { application } = await requireOwnedApplication(user, applicationId);
  if (application.status !== 'PENDING') throw new AppError(409, 'Only pending applications can be rejected.', 'APPLICATION_NOT_PENDING');
  const now = new Date();
  const updated = await TenantApplication.findOneAndUpdate({ _id: applicationId, status: 'PENDING' }, {
    $set: { status: 'REJECTED', decidedAt: now, decisionMakerId: user._id, rejectionReason: reason },
    $push: { events: { fromStatus: 'PENDING', toStatus: 'REJECTED', actorId: user._id, at: now, reason } },
  }, { new: true, runValidators: true });
  if (!updated) throw new AppError(409, 'The application was already decided. Refresh and try again.', 'APPLICATION_NOT_PENDING');
  await AuditLog.create({ actorId: user._id, action: 'APPLICATION_REJECTED', entityType: 'TENANT_APPLICATION', entityId: application._id, reason, before: { status: 'PENDING' }, after: { status: 'REJECTED' } });
  await notifyOnce({ recipientId: application.tenantId, type: 'APPLICATION_DECISION', title: 'Application declined', message: 'Your hostel application was declined.', destination: '/applications', relatedEntityId: application._id, eventKey: `application:${application._id}:REJECTED` });
  return updated;
}

export async function approveApplication(user, applicationId) {
  return withTransaction(async (session) => {
    const { application, hostel } = await requireOwnedApplication(user, applicationId, session);
    if (application.status !== 'PENDING') throw new AppError(409, 'Only pending applications can be approved.', 'APPLICATION_NOT_PENDING');
    if (!hostel.isActive) throw new AppError(409, 'An inactive hostel cannot accept applications.', 'HOSTEL_INACTIVE');
    const tenant = await User.findOne({ _id: application.tenantId, role: 'TENANT', isActive: true, isDeleted: false }).session(session);
    if (!tenant) throw new AppError(404, 'Tenant account not found or inactive.', 'TENANT_NOT_FOUND');
    if (hostel.accommodationPolicy === 'MALE_ONLY' && tenant.gender !== 'MALE') throw new AppError(422, 'This hostel is limited to male accommodation.', 'TENANT_NOT_ELIGIBLE');
    if (hostel.accommodationPolicy === 'FEMALE_ONLY' && tenant.gender !== 'FEMALE') throw new AppError(422, 'This hostel is limited to female accommodation.', 'TENANT_NOT_ELIGIBLE');
    const now = new Date();
    const result = await TenantApplication.updateOne({ _id: application._id, status: 'PENDING' }, {
      $set: { status: 'APPROVED', decidedAt: now, decisionMakerId: user._id },
      $push: { events: { fromStatus: 'PENDING', toStatus: 'APPROVED', actorId: user._id, at: now, reason: 'Application approved; room assignment is pending' } },
    }, { session });
    if (!result.modifiedCount) throw new AppError(409, 'The application was already decided. Refresh and try again.', 'APPLICATION_NOT_PENDING');
    await AuditLog.create([{ actorId: user._id, action: 'APPLICATION_APPROVED', entityType: 'TENANT_APPLICATION', entityId: application._id, reason: 'Application approved; room assignment is pending', before: { status: 'PENDING' }, after: { status: 'APPROVED' } }], { session });
    await notifyOnce({ recipientId: tenant._id, type: 'APPLICATION_DECISION', title: 'Application approved', message: 'Your hostel application was approved. A room assignment is still pending.', destination: '/applications', relatedEntityId: application._id, eventKey: `application:${application._id}:APPROVED` }, session);
    return TenantApplication.findById(application._id).session(session);
  });
}

export async function cancelApplication(user, applicationId) {
  const now = new Date();
  const updated = await TenantApplication.findOneAndUpdate({ _id: applicationId, tenantId: user._id, status: 'PENDING' }, {
    $set: { status: 'CANCELLED', decidedAt: now, decisionMakerId: user._id },
    $push: { events: { fromStatus: 'PENDING', toStatus: 'CANCELLED', actorId: user._id, at: now, reason: 'Cancelled by tenant' } },
  }, { new: true, runValidators: true });
  if (!updated) {
    const exists = await TenantApplication.exists({ _id: applicationId, tenantId: user._id });
    if (!exists) throw new AppError(404, 'Tenant application not found.', 'APPLICATION_NOT_FOUND');
    throw new AppError(409, 'Only a pending application can be cancelled.', 'APPLICATION_NOT_PENDING');
  }
  return updated;
}

export async function approveAndAssign(user, applicationId, input) {
  return withTransaction(async (session) => {
    const { application, hostel } = await requireOwnedApplication(user, applicationId, session);
    if (!['PENDING', 'APPROVED'].includes(application.status)) throw new AppError(409, 'Only pending or approved applications can be assigned.', 'APPLICATION_NOT_PENDING');
    if (!hostel.isActive) throw new AppError(409, 'An inactive hostel cannot accept new stays.', 'HOSTEL_INACTIVE');

    const tenant = await User.findOne({ _id: application.tenantId, role: 'TENANT', isActive: true, isDeleted: false }).select('+activeStayLockVersion').session(session);
    if (!tenant) throw new AppError(404, 'Tenant account not found or inactive.', 'TENANT_NOT_FOUND');
    const room = await Room.findOne({ _id: input.roomId, hostelId: hostel._id, isActive: true, isDeleted: false }).session(session);
    if (!room) throw new AppError(404, 'Available room not found in this hostel.', 'ROOM_NOT_FOUND');

    assertEligible(tenant, hostel, room);
    await lockHostel(hostel, user, session);
    await lockRoom(room, session);
    await lockTenant(tenant, session);

    const activeStay = await Stay.exists({ tenantId: tenant._id, status: 'ACTIVE' }).session(session);
    if (activeStay) throw new AppError(409, 'This tenant already has an active stay.', 'ACTIVE_STAY_EXISTS');
    const occupancy = await countRoomOccupancy(room._id, session);
    if (occupancy >= room.maxCapacity) throw new AppError(409, 'This room is at capacity.', 'ROOM_FULL');

    const moveInDate = parseLocalDate(input.moveInDate);
    const now = new Date();
    const [stay] = await Stay.create([{
      tenantId: tenant._id,
      hostelId: hostel._id,
      roomId: room._id,
      applicationId: application._id,
      moveInDate,
      agreedMonthlyRentPaise: input.agreedMonthlyRentPaise,
      rentTerms: [{ monthlyRentPaise: input.agreedMonthlyRentPaise, effectiveFrom: parseLocalDate(nextCycleDay(input.moveInDate)), actorId: user._id, reason: 'Initial agreed rent' }],
      securityDepositPaise: input.securityDepositPaise,
      rentCycleAnchorDay: Number(input.moveInDate.slice(-2)),
      status: 'ACTIVE',
      financialTermsLocked: true,
      termsConfirmedAt: now,
      events: [{ fromStatus: null, toStatus: 'ACTIVE', actorId: user._id, at: now, reason: 'Application approved and room assigned' }],
    }], { session });
    const previousApplicationStatus = application.status;
    const decision = application.status === 'PENDING' ? await TenantApplication.updateOne({ _id: application._id, status: 'PENDING' }, {
      $set: { status: 'APPROVED', decidedAt: now, decisionMakerId: user._id },
      $push: { events: { fromStatus: 'PENDING', toStatus: 'APPROVED', actorId: user._id, at: now, reason: 'Room assigned and stay confirmed' } },
    }, { session }) : { modifiedCount: 1 };
    if (!decision.modifiedCount) throw new AppError(409, 'The application was already decided. Refresh and try again.', 'APPLICATION_NOT_PENDING');
    await AuditLog.create([{ actorId: user._id, action: previousApplicationStatus === 'PENDING' ? 'APPLICATION_APPROVED' : 'TENANT_ASSIGNED', entityType: 'TENANT_APPLICATION', entityId: application._id, reason: 'Room assigned and stay confirmed', before: { status: previousApplicationStatus }, after: { status: 'APPROVED', stayId: stay._id, roomId: room._id } }], { session });
    await notifyOnce({ recipientId: tenant._id, type: 'APPLICATION_DECISION', title: previousApplicationStatus === 'PENDING' ? 'Application approved' : 'Room assigned', message: 'Your application was approved and a room was assigned.', destination: '/applications', relatedEntityId: application._id, eventKey: `application:${application._id}:ASSIGNED` }, session);
    return stay;
  });
}

export async function listMyStays(user, query) {
  const blockedHostels = await Hostel.find({ isBlocked: true }).select('_id').lean();
  const filter = { tenantId: user._id, hostelId: { $nin: blockedHostels.map(({ _id }) => _id) }, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    Stay.find(filter).sort({ moveInDate: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('hostelId', 'name city address accommodationPolicy')
      .populate('roomId', 'identifier sharingType genderEligibility')
      .populate('roomTransfers.fromRoomId', 'identifier').populate('roomTransfers.toRoomId', 'identifier').lean(),
    Stay.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function listOwnerStays(user, query) {
  const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true } }).select('_id').lean();
  const filter = { hostelId: { $in: hostels.map((hostel) => hostel._id) }, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    Stay.find(filter).sort({ moveInDate: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('tenantId', 'name email gender')
      .populate('hostelId', 'name city')
      .populate('roomId', 'identifier sharingType maxCapacity').lean(),
    Stay.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
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
  return { items, pagination: pageMeta(query.page, query.limit, total) };
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
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getStay(user, stayId) {
  const { stay } = await requireAuthorizedStay(user, stayId);
  const populated = await Stay.findById(stay._id)
    .populate('hostelId', 'name city address accommodationPolicy')
    .populate('roomId', 'identifier sharingType maxCapacity genderEligibility')
    .populate(user.role === 'TENANT' ? { path: 'tenantId', select: 'name email gender' } : { path: 'tenantId', select: 'name email gender' })
    .lean();
  return populated;
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
    await lockRoom(room, session);
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
