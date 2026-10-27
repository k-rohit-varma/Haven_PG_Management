import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { notifyOnce } from './notificationWriter.js';
import { Hostel } from '../models/Hostel.js';
import { RentChangeRequest } from '../models/RentChangeRequest.js';
import { RentDue } from '../models/RentDue.js';
import { Stay } from '../models/Stay.js';
import { parseLocalDate } from '../validators/stayValidators.js';

const ownerScope = (user) => user.role === 'OWNER' ? { ownerId: user._id } : {};
const inKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

function cycleDay(anchor, offset) {
  const [year, month, day] = anchor.split('-').map(Number);
  const targetMonth = month - 1 + offset;
  const last = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, targetMonth, Math.min(day, last)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isCycleDay(anchor, candidate) {
  for (let month = 1; month < 1200; month += 1) {
    const day = cycleDay(anchor, month);
    if (day === candidate) return true;
    if (day > candidate) return false;
  }
  return false;
}

function rentAt(stay, dateOnlyValue) {
  const term = stay.rentTerms.filter((item) => inKolkata(item.effectiveFrom) <= dateOnlyValue).sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
  return term?.monthlyRentPaise || stay.agreedMonthlyRentPaise;
}

async function transaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 11000) throw new AppError(409, 'A pending rent change already exists for this stay.', 'PENDING_RENT_CHANGE_EXISTS');
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This workflow requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}

async function lockStay(stay, session) {
  const result = await Stay.updateOne({ _id: stay._id, __v: stay.__v }, { $inc: { __v: 1 } }, { session });
  if (!result.modifiedCount) throw new AppError(409, 'The stay changed. Refresh and try again.', 'CONCURRENT_UPDATE');
}

async function nextEffectiveDate(stay, session) {
  const latest = await RentDue.findOne({ stayId: stay._id }).sort({ dueDate: -1 }).select('dueDate').session(session).lean();
  const latestTerm = stay.rentTerms.reduce((max, term) => Math.max(max, term.effectiveFrom.valueOf()), 0);
  const latestTermDay = latestTerm ? inKolkata(new Date(latestTerm)) : '0000-00-00';
  const boundary = [inKolkata(new Date()), latest ? inKolkata(latest.dueDate) : '0000-00-00', latestTermDay].sort().at(-1);
  const anchor = inKolkata(stay.moveInDate);
  for (let month = 1; month < 1200; month += 1) {
    const dueDay = cycleDay(anchor, month);
    if (dueDay > boundary) return dueDay;
  }
  throw new AppError(422, 'Could not find a future rent cycle for this stay.', 'RENT_CYCLE_NOT_FOUND');
}

export async function createRequest(user, input) {
  if (user.role !== 'TENANT') throw new AppError(403, 'Only tenants can request a rent change.', 'FORBIDDEN');
  return transaction(async (session) => {
    const stay = await Stay.findOne({ _id: input.stayId, tenantId: user._id, status: 'ACTIVE' }).session(session);
    if (!stay) throw new AppError(404, 'Active stay not found.', 'STAY_NOT_FOUND');
    if (await Hostel.exists({ _id: stay.hostelId, isBlocked: true }).session(session)) throw new AppError(423, 'This hostel is blocked. Rent-change requests are unavailable.', 'HOSTEL_BLOCKED');
    await lockStay(stay, session);
    if (await RentChangeRequest.exists({ stayId: stay._id, status: 'PENDING' }).session(session)) throw new AppError(409, 'A rent change request is already pending for this stay.', 'PENDING_RENT_CHANGE_EXISTS');
    const effectiveDateDay = await nextEffectiveDate(stay, session);
    const currentRentPaise = rentAt(stay, effectiveDateDay);
    if (input.requestedRentPaise === currentRentPaise) throw new AppError(422, 'Requested rent must differ from the rent at the next applicable cycle.', 'RENT_UNCHANGED');
    const effectiveDate = parseLocalDate(effectiveDateDay);
    const [request] = await RentChangeRequest.create([{
      tenantId: user._id, stayId: stay._id, hostelId: stay.hostelId,
      currentRentPaise, requestedRentPaise: input.requestedRentPaise,
      reason: input.reason, effectiveDate, events: [{ fromStatus: null, toStatus: 'PENDING', actorId: user._id, reason: input.reason }],
    }], { session });
    return request;
  });
}

export async function listRequests(user, query, stayId) {
  let filter = { ...(user.role === 'TENANT' ? { tenantId: user._id } : {}), ...(query.status ? { status: query.status } : {}), ...(stayId ? { stayId } : {}) };
  if (user.role === 'TENANT') {
    const blocked = await Hostel.find({ isBlocked: true }).select('_id').lean();
    filter.hostelId = { $nin: blocked.map(({ _id }) => _id) };
  }
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true } }).select('_id').lean();
    filter.hostelId = { $in: hostels.map((hostel) => hostel._id) };
  }
  const [items, total] = await Promise.all([
    RentChangeRequest.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('tenantId', 'name email').populate({ path: 'stayId', select: 'agreedMonthlyRentPaise moveInDate rentCycleAnchorDay status roomId', populate: { path: 'roomId', select: 'identifier' } }).populate('hostelId', 'name city').populate('reviewerId', 'name').lean(),
    RentChangeRequest.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function decideRequest(user, requestId, input) {
  if (!['OWNER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'Only the hostel owner can review rent changes.', 'FORBIDDEN');
  return transaction(async (session) => {
    const request = await RentChangeRequest.findById(requestId).session(session);
    if (!request) throw new AppError(404, 'Rent change request not found.', 'RENT_CHANGE_NOT_FOUND');
    const hostel = await Hostel.findOne({ _id: request.hostelId, ...ownerScope(user) }).session(session);
    if (!hostel) throw new AppError(404, 'Rent change request not found.', 'RENT_CHANGE_NOT_FOUND');
    if (hostel.isBlocked && user.role !== 'ADMIN') throw new AppError(423, 'This hostel is blocked. Rent-change decisions are unavailable.', 'HOSTEL_BLOCKED');
    if (request.status !== 'PENDING') throw new AppError(409, 'Only pending rent changes can be reviewed.', 'RENT_CHANGE_NOT_PENDING');
    const stay = await Stay.findOne({ _id: request.stayId, status: 'ACTIVE' }).session(session);
    if (!stay) throw new AppError(409, 'The tenant stay is no longer active.', 'STAY_NOT_ACTIVE');
    await lockStay(stay, session);
    const now = new Date();
    if (rentAt(stay, inKolkata(request.effectiveDate)) !== request.currentRentPaise) throw new AppError(409, 'The agreed rent changed after this request was submitted.', 'RENT_CHANGED');
    if (input.decision === 'APPROVED') {
      const dateOnlyValue = inKolkata(request.effectiveDate);
      if (dateOnlyValue <= inKolkata(new Date())) throw new AppError(409, 'The effective rent cycle has passed. Submit a new request.', 'RENT_EFFECTIVE_DATE_PASSED');
      if (!isCycleDay(inKolkata(stay.moveInDate), dateOnlyValue)) throw new AppError(409, 'The rent change must begin on an anchored monthly cycle.', 'INVALID_RENT_EFFECTIVE_DATE');
      if (await RentDue.exists({ stayId: stay._id, dueDate: { $gte: request.effectiveDate } }).session(session)) throw new AppError(409, 'A rent due already exists on or after this effective date; existing dues are preserved. Submit a new request for a later cycle.', 'RENT_DUE_ALREADY_GENERATED');
      const rentTerms = [];
      if (!stay.rentTerms.length) rentTerms.push({
        monthlyRentPaise: stay.agreedMonthlyRentPaise,
        effectiveFrom: parseLocalDate(cycleDay(inKolkata(stay.moveInDate), 1)),
        actorId: user._id,
        reason: 'Prior agreed rent captured when effective-dated history began',
        recordedAt: now,
      });
      rentTerms.push({ monthlyRentPaise: request.requestedRentPaise, effectiveFrom: request.effectiveDate, actorId: user._id, requestId: request._id, reason: request.reason, recordedAt: now });
      await Stay.updateOne({ _id: stay._id }, { $push: { rentTerms: { $each: rentTerms } } }, { session });
    }
    const updated = await RentChangeRequest.updateOne({ _id: request._id, status: 'PENDING' }, {
      $set: { status: input.decision, reviewerId: user._id, reviewedAt: now, ...(input.decision === 'REJECTED' ? { rejectionReason: input.reason } : {}) },
      $push: { events: { fromStatus: 'PENDING', toStatus: input.decision, actorId: user._id, at: now, reason: input.decision === 'REJECTED' ? input.reason : 'Rent change approved' } },
    }, { session });
    if (!updated.modifiedCount) throw new AppError(409, 'The request was already reviewed.', 'RENT_CHANGE_NOT_PENDING');
    await AuditLog.create([{
      actorId: user._id, action: `RENT_CHANGE_${input.decision}`, entityType: 'RENT_CHANGE_REQUEST', entityId: request._id,
      reason: input.decision === 'REJECTED' ? input.reason : request.reason,
      before: { status: 'PENDING', currentRentPaise: request.currentRentPaise },
      after: { status: input.decision, requestedRentPaise: request.requestedRentPaise, effectiveDate: request.effectiveDate },
    }], { session });
    await notifyOnce({ recipientId: request.tenantId, type: 'RENT_CHANGE_DECISION', title: input.decision === 'APPROVED' ? 'Rent change approved' : 'Rent change declined', message: input.decision === 'APPROVED' ? 'Your requested rent change was approved.' : 'Your requested rent change was declined.', destination: '/rent-changes', relatedEntityId: request._id, eventKey: `rent-change:${request._id}:${input.decision}` }, session);
    return RentChangeRequest.findById(request._id).session(session);
  });
}
