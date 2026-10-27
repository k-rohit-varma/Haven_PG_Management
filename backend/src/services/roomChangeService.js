import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { Hostel } from '../models/Hostel.js';
import { Room } from '../models/Room.js';
import { RoomChangeRequest } from '../models/RoomChangeRequest.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { notifyOnce } from './notificationWriter.js';

const ownerScope = (user) => user.role === 'OWNER' ? { ownerId: user._id } : {};

async function lockHostel(hostel, session) {
  const result = await Hostel.updateOne({ _id: hostel._id, __v: hostel.__v, isActive: true, isBlocked: { $ne: true }, isDeleted: false }, { $inc: { __v: 1 } }, { session });
  if (!result.modifiedCount) throw new AppError(409, 'Hostel access or status changed. Refresh and retry.', 'CONCURRENT_UPDATE');
}

async function transaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 11000) throw new AppError(409, 'A room-change request is already pending for this stay.', 'PENDING_ROOM_CHANGE_EXISTS');
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This workflow requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}

export async function createRequest(user, input) {
  if (user.role !== 'TENANT') throw new AppError(403, 'Only tenants can request a room change.', 'FORBIDDEN');
  return transaction(async (session) => {
    const stay = await Stay.findOne({ _id: input.stayId, tenantId: user._id, status: 'ACTIVE' }).session(session);
    if (!stay) throw new AppError(404, 'Active stay not found.', 'STAY_NOT_FOUND');
    const hostel = await Hostel.findOne({ _id: stay.hostelId, isActive: true, isBlocked: { $ne: true }, isDeleted: false }).session(session);
    if (!hostel) throw new AppError(423, 'This hostel is unavailable for room changes.', 'HOSTEL_BLOCKED');
    await lockHostel(hostel, session);
    const [room, tenant, pending] = await Promise.all([
      Room.findOne({ _id: input.requestedRoomId, hostelId: hostel._id, isActive: true, isDeleted: false }).session(session),
      User.findById(user._id).select('gender').session(session),
      RoomChangeRequest.exists({ stayId: stay._id, status: 'PENDING' }).session(session),
    ]);
    if (pending) throw new AppError(409, 'A room-change request is already pending for this stay.', 'PENDING_ROOM_CHANGE_EXISTS');
    if (!room || String(room._id) === String(stay.roomId)) throw new AppError(422, 'Choose a different active room in your current hostel.', 'INVALID_TARGET_ROOM');
    if ((hostel.accommodationPolicy === 'MALE_ONLY' && tenant.gender !== 'MALE') || (hostel.accommodationPolicy === 'FEMALE_ONLY' && tenant.gender !== 'FEMALE') || (room.genderEligibility !== 'ANY' && room.genderEligibility !== tenant.gender)) throw new AppError(422, 'The requested room does not match your hostel and room eligibility.', 'TENANT_NOT_ELIGIBLE');
    const occupancy = await Stay.countDocuments({ roomId: room._id, status: 'ACTIVE' }).session(session);
    if (occupancy >= room.maxCapacity) throw new AppError(409, 'The requested room is currently full.', 'ROOM_FULL');
    const [request] = await RoomChangeRequest.create([{ tenantId: user._id, stayId: stay._id, hostelId: hostel._id, currentRoomId: stay.roomId, requestedRoomId: room._id, reason: input.reason, events: [{ fromStatus: null, toStatus: 'PENDING', actorId: user._id, reason: input.reason }] }], { session });
    return request;
  });
}

export async function listRequests(user, query) {
  const filter = { ...(user.role === 'TENANT' ? { tenantId: user._id } : {}), ...(query.status ? { status: query.status } : {}) };
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true } }).select('_id').lean();
    filter.hostelId = { $in: hostels.map(({ _id }) => _id) };
  }
  const [items, total] = await Promise.all([
    RoomChangeRequest.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('tenantId', 'name email phone gender').populate('hostelId', 'name city')
      .populate('currentRoomId', 'identifier').populate('requestedRoomId', 'identifier maxCapacity genderEligibility defaultRentPaise')
      .populate('stayId', 'agreedMonthlyRentPaise securityDepositPaise status').lean(),
    RoomChangeRequest.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function decideRequest(user, requestId, input) {
  if (!['OWNER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'Only the assigned owner or an admin can review room changes.', 'FORBIDDEN');
  return transaction(async (session) => {
    const request = await RoomChangeRequest.findById(requestId).session(session);
    if (!request) throw new AppError(404, 'Room-change request not found.', 'ROOM_CHANGE_NOT_FOUND');
    const hostel = await Hostel.findOne({ _id: request.hostelId, ...ownerScope(user) }).session(session);
    if (!hostel) throw new AppError(404, 'Room-change request not found.', 'ROOM_CHANGE_NOT_FOUND');
    if (hostel.isBlocked) throw new AppError(423, 'This hostel is blocked. Room-change decisions are unavailable.', 'HOSTEL_BLOCKED');
    await lockHostel(hostel, session);
    if (request.status !== 'PENDING') throw new AppError(409, 'Only pending room-change requests can be decided.', 'ROOM_CHANGE_NOT_PENDING');
    const stay = await Stay.findOne({ _id: request.stayId, tenantId: request.tenantId, status: 'ACTIVE' }).session(session);
    if (!stay || String(stay.roomId) !== String(request.currentRoomId)) throw new AppError(409, 'The tenant’s current room has changed. Review the latest stay before retrying.', 'STAY_ROOM_CHANGED');
    const now = new Date();
    if (input.decision === 'APPROVED') {
      const target = await Room.findOne({ _id: request.requestedRoomId, hostelId: hostel._id, isActive: true, isDeleted: false }).session(session);
      const tenant = await User.findOne({ _id: request.tenantId, role: 'TENANT', isActive: true, isDeleted: false }).select('gender').session(session);
      if (!target || !tenant) throw new AppError(409, 'The requested room or tenant is no longer eligible.', 'RESOURCE_NOT_AVAILABLE');
      if ((hostel.accommodationPolicy === 'MALE_ONLY' && tenant.gender !== 'MALE') || (hostel.accommodationPolicy === 'FEMALE_ONLY' && tenant.gender !== 'FEMALE') || (target.genderEligibility !== 'ANY' && target.genderEligibility !== tenant.gender)) throw new AppError(422, 'The requested room is no longer eligible.', 'TENANT_NOT_ELIGIBLE');
      const roomLock = await Room.updateOne({ _id: target._id, __v: target.__v, isActive: true, isDeleted: false }, { $inc: { __v: 1 } }, { session });
      if (!roomLock.modifiedCount) throw new AppError(409, 'The requested room changed. Refresh and retry.', 'CONCURRENT_UPDATE');
      const occupants = await Stay.countDocuments({ roomId: target._id, status: 'ACTIVE' }).session(session);
      if (occupants >= target.maxCapacity) throw new AppError(409, 'The requested room is now full.', 'ROOM_FULL');
      const stayUpdate = await Stay.updateOne({ _id: stay._id, roomId: request.currentRoomId, status: 'ACTIVE', __v: stay.__v }, { $set: { roomId: target._id }, $push: { roomTransfers: { fromRoomId: request.currentRoomId, toRoomId: target._id, effectiveAt: now, requestId: request._id, actorId: user._id, reason: request.reason } }, $inc: { __v: 1 } }, { session });
      if (!stayUpdate.modifiedCount) throw new AppError(409, 'The stay changed. Refresh and retry.', 'CONCURRENT_UPDATE');
    }
    const status = input.decision;
    const update = await RoomChangeRequest.updateOne({ _id: request._id, status: 'PENDING' }, { $set: { status, reviewerId: user._id, reviewedAt: now, rejectionReason: status === 'REJECTED' ? input.reason : '' }, $push: { events: { fromStatus: 'PENDING', toStatus: status, actorId: user._id, at: now, reason: status === 'REJECTED' ? input.reason : request.reason } } }, { session });
    if (!update.modifiedCount) throw new AppError(409, 'The request was already decided.', 'ROOM_CHANGE_NOT_PENDING');
    await AuditLog.create([{ actorId: user._id, action: `ROOM_CHANGE_${status}`, entityType: 'ROOM_CHANGE_REQUEST', entityId: request._id, reason: status === 'REJECTED' ? input.reason : request.reason, before: { status: 'PENDING', roomId: request.currentRoomId }, after: { status, roomId: status === 'APPROVED' ? request.requestedRoomId : request.currentRoomId } }], { session });
    await notifyOnce({ recipientId: request.tenantId, type: 'ROOM_CHANGE_DECISION', title: status === 'APPROVED' ? 'Room change approved' : 'Room change declined', message: status === 'APPROVED' ? 'Your room assignment has been updated. Your stay and financial history remain intact.' : `Your room-change request was declined${input.reason ? `: ${input.reason}` : '.'}`, destination: '/hostels', relatedEntityId: request._id, eventKey: `room-change:${request._id}:${status}` }, session);
    return RoomChangeRequest.findById(request._id).session(session);
  });
}
