import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { notifyOnce } from './notificationWriter.js';
import { Hostel } from '../models/Hostel.js';
import { Payment } from '../models/Payment.js';
import { RentDue } from '../models/RentDue.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { parseLocalDate } from '../validators/stayValidators.js';

const ownerScope = (user) => user.role === 'OWNER' ? { ownerId: user._id } : {};
const dayInKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dateFromDay = (day) => parseLocalDate(day);
const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

function dayAtOffset(anchor, offset) {
  const [year, month, day] = anchor.split('-').map(Number);
  const targetMonth = month - 1 + offset;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
}

export async function generateRentDues(now = new Date()) {
  const today = dayInKolkata(now);
  const activeStayIds = await Stay.find({ status: 'ACTIVE' }).select('_id').lean();
  let created = 0;
  for (const { _id } of activeStayIds) {
    created += await transaction(async (session) => {
      const stay = await Stay.findOne({ _id, status: 'ACTIVE' }).session(session);
      if (!stay) return 0;
      const lock = await Stay.updateOne({ _id: stay._id, status: 'ACTIVE', __v: stay.__v }, { $inc: { __v: 1 } }, { session });
      if (!lock.modifiedCount) throw new AppError(409, 'The stay changed during rent generation. Retry the job.', 'CONCURRENT_UPDATE');
      const anchor = dayInKolkata(stay.moveInDate);
      const leaving = stay.leavingDate ? dayInKolkata(stay.leavingDate) : null;
      let inserted = 0;
      for (let cycle = 0; cycle < 1200; cycle += 1) {
        const periodStartDay = dayAtOffset(anchor, cycle);
        const dueDay = dayAtOffset(anchor, cycle + 1);
        if (dueDay > dayAtOffset(today, 1) || (leaving && dueDay > leaving)) break;
        const nextDueDay = dayAtOffset(anchor, cycle + 2);
        const term = stay.rentTerms.filter((item) => dayInKolkata(item.effectiveFrom) <= dueDay).sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
        const doc = {
          tenantId: stay.tenantId, stayId: stay._id, hostelId: stay.hostelId, roomId: stay.roomId,
          billingPeriod: dueDay.slice(0, 7), periodStart: dateFromDay(periodStartDay), dueDate: dateFromDay(dueDay),
          amountDuePaise: term?.monthlyRentPaise || stay.agreedMonthlyRentPaise, amountSettledPaise: 0, status: 'UPCOMING',
        };
        try {
          const result = await RentDue.updateOne({ stayId: stay._id, billingPeriod: dueDay.slice(0, 7) }, { $setOnInsert: doc }, { upsert: true, session });
          if (result.upsertedCount) inserted += 1;
        } catch (error) { if (error.code !== 11000) throw error; }
        if (nextDueDay <= dueDay) break;
      }
      return inserted;
    });
  }
  const pendingIds = await Payment.distinct('rentDueId', { status: 'PENDING' });
  const pendingSet = new Set(pendingIds.map(String));
  const dues = await RentDue.find().lean();
  const updates = dues.map((due) => {
    const balance = due.amountDuePaise - due.amountSettledPaise;
    let status;
    if (balance <= 0) status = due.lastPaymentPaidOn && dayInKolkata(due.lastPaymentPaidOn) > dayInKolkata(due.dueDate) ? 'PAID_LATE' : 'PAID';
    else if (pendingSet.has(String(due._id))) status = 'PAYMENT_PENDING';
    else if (due.amountSettledPaise > 0) status = 'PARTIALLY_PAID';
    else status = today > dayInKolkata(due.dueDate) ? 'OVERDUE' : 'UPCOMING';
    return RentDue.updateOne({ _id: due._id, status: { $ne: status } }, { $set: { status } });
  });
  await Promise.all(updates);
  return { created, staysProcessed: activeStayIds.length };
}

function filtersFor(user, query) {
  return { ...(user.role === 'TENANT' ? { tenantId: user._id } : {}), ...(query.hostelId ? { hostelId: query.hostelId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.month ? { billingPeriod: new RegExp(`^${query.month}`) } : {}) };
}

export async function listRentDues(user, query) {
  let filter = filtersFor(user, query);
  if (user.role === 'TENANT') {
    const blocked = await Hostel.find({ isBlocked: true }).select('_id').lean();
    filter.hostelId = { $nin: blocked.map(({ _id }) => _id), ...(query.hostelId ? { $eq: query.hostelId } : {}) };
  }
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true }, ...(query.hostelId ? { _id: query.hostelId } : {}) }).select('_id').lean();
    if (query.hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = { $in: hostels.map((item) => item._id) };
  }
  if (user.role === 'ADMIN' && query.hostelId && !await Hostel.exists({ _id: query.hostelId })) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  if (query.search) {
    const search = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [tenantIds, roomRows] = await Promise.all([
      RentDue.distinct('tenantId', filter),
      Room.find({ identifier: { $regex: search, $options: 'i' }, ...(filter.hostelId ? { hostelId: filter.hostelId } : {}) }).select('_id').lean(),
    ]);
    const tenants = await User.find({ _id: { $in: tenantIds }, name: { $regex: search, $options: 'i' } }).select('_id').lean();
    filter.$or = [{ tenantId: { $in: tenants.map(({ _id }) => _id) } }, { roomId: { $in: roomRows.map(({ _id }) => _id) } }];
  }
  const [items, total] = await Promise.all([
    RentDue.find(filter).sort({ dueDate: 1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .populate('tenantId', 'name email').populate('stayId', 'agreedMonthlyRentPaise moveInDate').populate('hostelId', 'name city').populate('roomId', 'identifier').lean(),
    RentDue.countDocuments(filter),
  ]);
  return { items: items.map((due) => ({ ...due, outstandingPaise: Math.max(0, due.amountDuePaise - due.amountSettledPaise) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function getRentDue(user, rentDueId) {
  const due = await RentDue.findById(rentDueId).populate('tenantId', 'name email').populate('stayId', 'agreedMonthlyRentPaise moveInDate').populate('hostelId', 'name city').populate('roomId', 'identifier').lean();
  if (!due || (user.role === 'TENANT' && String(due.tenantId?._id) !== String(user._id)) || (user.role === 'OWNER' && !await Hostel.exists({ _id: due.hostelId?._id || due.hostelId, ownerId: user._id }))) throw new AppError(404, 'Rent due not found.', 'RENT_DUE_NOT_FOUND');
  if (user.role !== 'ADMIN' && await Hostel.exists({ _id: due.hostelId?._id || due.hostelId, isBlocked: true })) throw new AppError(423, 'This hostel is blocked. Rent records are temporarily unavailable.', 'HOSTEL_BLOCKED');
  return { ...due, outstandingPaise: Math.max(0, due.amountDuePaise - due.amountSettledPaise) };
}

export async function getRentSummary(user, query) {
  let filter = { ...(user.role === 'TENANT' ? { tenantId: user._id } : {}), ...(query.hostelId ? { hostelId: query.hostelId } : {}), ...(query.month ? { billingPeriod: new RegExp(`^${query.month}`) } : {}) };
  if (user.role === 'TENANT') {
    const blocked = await Hostel.find({ isBlocked: true }).select('_id').lean();
    filter.hostelId = { $nin: blocked.map(({ _id }) => _id), ...(query.hostelId ? { $eq: query.hostelId } : {}) };
  }
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true }, ...(query.hostelId ? { _id: query.hostelId } : {}) }).select('_id').lean();
    if (query.hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = { $in: hostels.map((item) => item._id) };
  }
  const rows = await RentDue.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, amountDuePaise: { $sum: '$amountDuePaise' }, amountSettledPaise: { $sum: '$amountSettledPaise' } } }]);
  return rows.reduce((summary, row) => { summary[row._id] = { count: row.count, amountDuePaise: row.amountDuePaise, amountSettledPaise: row.amountSettledPaise, outstandingPaise: row.amountDuePaise - row.amountSettledPaise }; return summary; }, {});
}

async function transaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 11000) throw new AppError(409, 'A pending payment request already exists for this rent due.', 'PENDING_PAYMENT_EXISTS');
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This workflow requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}

export async function submitPayment(user, input) {
  if (input.paidOn > dayInKolkata(new Date())) throw new AppError(422, 'Payment date cannot be in the future.', 'INVALID_PAYMENT_DATE');
  return transaction(async (session) => {
    const due = await RentDue.findOne({ _id: input.rentDueId, tenantId: user._id }).session(session);
    if (!due) throw new AppError(404, 'Rent due not found.', 'RENT_DUE_NOT_FOUND');
    if (await Hostel.exists({ _id: due.hostelId, isBlocked: true }).session(session)) throw new AppError(423, 'This hostel is blocked. Payment actions are temporarily unavailable.', 'HOSTEL_BLOCKED');
    const updated = await RentDue.updateOne({ _id: due._id, __v: due.__v }, { $inc: { __v: 1 } }, { session });
    if (!updated.modifiedCount) throw new AppError(409, 'Rent due changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    if (await Payment.exists({ rentDueId: due._id, status: 'PENDING' }).session(session)) throw new AppError(409, 'You already have a pending request for this rent due.', 'PENDING_PAYMENT_EXISTS');
    const outstanding = due.amountDuePaise - due.amountSettledPaise;
    if (outstanding <= 0) throw new AppError(409, 'This rent due is already settled.', 'RENT_DUE_SETTLED');
    if (input.amountPaise > outstanding) throw new AppError(422, 'Payment cannot exceed the outstanding balance.', 'PAYMENT_EXCEEDS_BALANCE');
    const [payment] = await Payment.create([{
      tenantId: user._id, stayId: due.stayId, rentDueId: due._id, hostelId: due.hostelId,
      amountPaise: input.amountPaise, paidOn: parseLocalDate(input.paidOn), method: input.method,
      transactionReference: input.transactionReference || '',
      events: [{ fromStatus: null, toStatus: 'PENDING', actorId: user._id, note: 'Payment submitted for verification' }],
    }], { session });
    await RentDue.updateOne({ _id: due._id }, { $set: { status: 'PAYMENT_PENDING' } }, { session });
    return payment;
  });
}

export async function listPayments(user, query) {
  let filter = { ...(user.role === 'TENANT' ? { tenantId: user._id } : {}), ...(query.status ? { status: query.status } : {}), ...(query.rentDueId ? { rentDueId: query.rentDueId } : {}) };
  if (user.role === 'TENANT') {
    const blocked = await Hostel.find({ isBlocked: true }).select('_id').lean();
    filter.hostelId = { $nin: blocked.map(({ _id }) => _id) };
  }
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true }, ...(query.hostelId ? { _id: query.hostelId } : {}) }).select('_id').lean();
    if (query.hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = { $in: hostels.map((item) => item._id) };
  } else if (user.role === 'ADMIN' && query.hostelId) filter.hostelId = query.hostelId;
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ submittedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('tenantId', 'name email').populate('rentDueId', 'billingPeriod dueDate amountDuePaise amountSettledPaise').populate('stayId', 'agreedMonthlyRentPaise').populate('hostelId', 'name city').lean(),
    Payment.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function decidePayment(user, paymentId, { decision, reason = '' }) {
  return transaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
    const hostel = await Hostel.findOne({ _id: payment.hostelId, ...ownerScope(user) }).session(session);
    if (!hostel) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
    if (hostel.isBlocked && user.role !== 'ADMIN') throw new AppError(423, 'This hostel is blocked. Payment actions are temporarily unavailable.', 'HOSTEL_BLOCKED');
    if (payment.status !== 'PENDING') throw new AppError(409, 'Only pending payment requests can be decided.', 'PAYMENT_NOT_PENDING');
    const due = await RentDue.findById(payment.rentDueId).session(session);
    if (!due) throw new AppError(409, 'The rent record is unavailable.', 'RENT_DUE_NOT_FOUND');
    const lock = await RentDue.updateOne({ _id: due._id, __v: due.__v }, { $inc: { __v: 1 } }, { session });
    if (!lock.modifiedCount) throw new AppError(409, 'The rent balance changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    if (decision === 'APPROVED' && due.amountSettledPaise + payment.amountPaise > due.amountDuePaise) throw new AppError(409, 'The approved amount would exceed the rent balance.', 'PAYMENT_EXCEEDS_BALANCE');
    const now = new Date();
    const updated = await Payment.updateOne({ _id: payment._id, status: 'PENDING' }, { $set: { status: decision, decisionMakerId: user._id, decidedAt: now, ...(decision === 'REJECTED' ? { rejectionReason: reason } : {}) }, $push: { events: { fromStatus: 'PENDING', toStatus: decision, actorId: user._id, at: now, note: decision === 'REJECTED' ? reason : 'Payment verified' } } }, { session });
    if (!updated.modifiedCount) throw new AppError(409, 'The payment request was already decided.', 'PAYMENT_NOT_PENDING');
    let settled = due.amountSettledPaise;
    if (decision === 'APPROVED') {
      settled += payment.amountPaise;
      await RentDue.updateOne({ _id: due._id }, { $set: { amountSettledPaise: settled, lastPaymentPaidOn: payment.paidOn } }, { session });
    }
    const remaining = due.amountDuePaise - settled;
    const pending = decision === 'REJECTED' && await Payment.exists({ rentDueId: due._id, status: 'PENDING', _id: { $ne: payment._id } }).session(session);
    const day = dayInKolkata(now);
    const paidLate = dayInKolkata(payment.paidOn) > dayInKolkata(due.dueDate);
    const status = remaining <= 0 ? (paidLate ? 'PAID_LATE' : 'PAID') : (pending ? 'PAYMENT_PENDING' : settled > 0 ? 'PARTIALLY_PAID' : day > dayInKolkata(due.dueDate) ? 'OVERDUE' : 'UPCOMING');
    await RentDue.updateOne({ _id: due._id }, { $set: { status } }, { session });
    await AuditLog.create([{
      actorId: user._id, action: `PAYMENT_${decision}`, entityType: 'PAYMENT', entityId: payment._id,
      reason: decision === 'REJECTED' ? reason : 'Payment verified',
      before: { paymentStatus: 'PENDING', amountSettledPaise: due.amountSettledPaise },
      after: { paymentStatus: decision, amountSettledPaise: settled, rentStatus: status },
    }], { session });
    await notifyOnce({ recipientId: payment.tenantId, type: 'PAYMENT_DECISION', title: decision === 'APPROVED' ? 'Payment approved' : 'Payment declined', message: decision === 'APPROVED' ? 'Your rent payment was verified.' : 'Your rent payment was declined. Review the payment details.', destination: '/payments', relatedEntityId: payment._id, eventKey: `payment:${payment._id}:${decision}` }, session);
    return Payment.findById(payment._id).session(session);
  });
}

export async function getPayment(user, paymentId) {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
  if (user.role === 'TENANT' && String(payment.tenantId) !== String(user._id)) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
  if (user.role === 'OWNER' && !await Hostel.exists({ _id: payment.hostelId, ownerId: user._id })) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
  if (user.role !== 'ADMIN' && await Hostel.exists({ _id: payment.hostelId, isBlocked: true })) throw new AppError(423, 'This hostel is blocked. Payment records are temporarily unavailable.', 'HOSTEL_BLOCKED');
  return payment;
}
