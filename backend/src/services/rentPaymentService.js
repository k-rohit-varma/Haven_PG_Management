import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { Hostel } from '../models/Hostel.js';
import { Payment } from '../models/Payment.js';
import { RentDue } from '../models/RentDue.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { dayInKolkata } from '../utils/dateOnly.js';
import { logger } from '../utils/logger.js';
import { parseLocalDate } from '../validators/stayValidators.js';

const ownerScope = (user) => user.role === 'OWNER' ? { ownerId: user._id } : {};
const dateFromDay = (day) => parseLocalDate(day);
const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

function dayAtOffset(anchor, offset) {
  const [year, month, day] = anchor.split('-').map(Number);
  const targetMonth = month - 1 + offset;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
}

export async function generateRentDues(now = new Date(), hostelIds = null) {
  const today = dayInKolkata(now);
  // LEFT stays still need dues for billing periods that ended on or before
  // their leaving date. The period bound below prevents charging past it.
  const scope = hostelIds ? { hostelId: { $in: hostelIds } } : {};
  const eligibleStays = await Stay.find({ ...scope, $or: [{ status: 'ACTIVE' }, { status: 'LEFT', leavingDate: { $type: 'date' } }] }).select('_id').lean();
  let created = 0;
  let skipped = 0;
  for (const { _id } of eligibleStays) {
    const result = await transaction(async (session) => {
      const stay = await Stay.findOne({ _id, $or: [{ status: 'ACTIVE' }, { status: 'LEFT', leavingDate: { $type: 'date' } }] }).session(session);
      if (!stay) return { inserted: 0, alreadyPresent: 0 };
      const lock = await Stay.updateOne({ _id: stay._id, status: stay.status, __v: stay.__v }, { $inc: { __v: 1 } }, { session });
      if (!lock.modifiedCount) throw new AppError(409, 'The stay changed during rent generation. Retry the job.', 'CONCURRENT_UPDATE');
      const anchor = dayInKolkata(stay.moveInDate);
      const leaving = stay.leavingDate ? dayInKolkata(stay.leavingDate) : null;
      let inserted = 0;
      let alreadyPresent = 0;
      for (let cycle = 0; cycle < 1200; cycle += 1) {
        const periodStartDay = dayAtOffset(anchor, cycle);
        const dueDay = dayAtOffset(anchor, cycle + 1);
        if (dueDay > dayAtOffset(today, 1) || (leaving && dueDay > leaving)) break;
        const nextDueDay = dayAtOffset(anchor, cycle + 2);
        const term = stay.rentTerms.filter((item) => dayInKolkata(item.effectiveFrom) <= periodStartDay).sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
        const doc = {
          tenantId: stay.tenantId, stayId: stay._id, hostelId: stay.hostelId, roomId: stay.roomId,
          billingPeriod: dueDay.slice(0, 7), periodStart: dateFromDay(periodStartDay), dueDate: dateFromDay(dueDay),
          amountDuePaise: term?.monthlyRentPaise || stay.agreedMonthlyRentPaise, amountSettledPaise: 0, status: 'UPCOMING',
        };
        try {
          const result = await RentDue.updateOne({ stayId: stay._id, billingPeriod: dueDay.slice(0, 7) }, { $setOnInsert: doc }, { upsert: true, session });
          if (result.upsertedCount) inserted += 1;
          else alreadyPresent += 1;
        } catch (error) {
          if (error.code !== 11000) throw error;
          alreadyPresent += 1;
        }
        if (nextDueDay <= dueDay) break;
      }
      return { inserted, alreadyPresent };
    });
    created += result.inserted || 0;
    skipped += result.alreadyPresent || 0;
  }
  const pendingIds = await Payment.distinct('rentDueId', { ...scope, status: 'PENDING' });
  const pendingSet = new Set(pendingIds.map(String));
  const dues = await RentDue.find(scope).lean();
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
  return { checked: eligibleStays.length, created, skipped };
}

export async function reconcileRentDues(user) {
  if (!['OWNER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'Only an owner or admin can reconcile rent dues.', 'FORBIDDEN');
  if (user.role === 'ADMIN') return generateRentDues();
  const hostels = await Hostel.find({ ownerId: user._id, isDeleted: false, isBlocked: { $ne: true } }).select('_id').lean();
  return generateRentDues(new Date(), hostels.map(({ _id }) => _id));
}

function filtersFor(user, query) {
  return { ...(query.hostelId ? { hostelId: query.hostelId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.month ? { billingPeriod: new RegExp(`^${query.month}`) } : {}) };
}

export async function listRentDues(user, query) {
  let filter = filtersFor(user, query);
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true }, ...(query.hostelId ? { _id: query.hostelId } : {}) }).select('_id').lean();
    if (query.hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = { $in: hostels.map((item) => item._id) };
  }
  if (user.role === 'ADMIN' && query.hostelId && !await Hostel.exists({ _id: query.hostelId })) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
  filter.stayId = { $in: await Stay.distinct('_id', { status: 'ACTIVE', ...(filter.hostelId ? { hostelId: filter.hostelId } : {}) }) };
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
  if (!due || (user.role === 'OWNER' && !await Hostel.exists({ _id: due.hostelId?._id || due.hostelId, ownerId: user._id }))) throw new AppError(404, 'Rent due not found.', 'RENT_DUE_NOT_FOUND');
  if (!await Stay.exists({ _id: due.stayId?._id || due.stayId, status: 'ACTIVE' })) throw new AppError(404, 'Rent due not found.', 'RENT_DUE_NOT_FOUND');
  if (user.role !== 'ADMIN' && await Hostel.exists({ _id: due.hostelId?._id || due.hostelId, isBlocked: true })) throw new AppError(423, 'This hostel is blocked. Rent records are temporarily unavailable.', 'HOSTEL_BLOCKED');
  return { ...due, outstandingPaise: Math.max(0, due.amountDuePaise - due.amountSettledPaise) };
}

export async function getRentSummary(user, query) {
  let filter = { ...(query.hostelId ? { hostelId: query.hostelId } : {}), ...(query.month ? { billingPeriod: new RegExp(`^${query.month}`) } : {}) };
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isBlocked: { $ne: true }, ...(query.hostelId ? { _id: query.hostelId } : {}) }).select('_id').lean();
    if (query.hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = { $in: hostels.map((item) => item._id) };
  }
  filter.stayId = { $in: await Stay.distinct('_id', { status: 'ACTIVE', ...(filter.hostelId ? { hostelId: filter.hostelId } : {}) }) };
  const rows = await RentDue.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, amountDuePaise: { $sum: '$amountDuePaise' }, amountSettledPaise: { $sum: '$amountSettledPaise' } } }]);
  return rows.reduce((summary, row) => { summary[row._id] = { count: row.count, amountDuePaise: row.amountDuePaise, amountSettledPaise: row.amountSettledPaise, outstandingPaise: row.amountDuePaise - row.amountSettledPaise }; return summary; }, {});
}

async function transaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 11000) throw new AppError(409, 'This payment conflicts with an existing record. Refresh and retry.', 'PAYMENT_CONFLICT');
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This workflow requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}

export async function recordPayment(user, input) {
  if (!['OWNER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'Only an owner or admin can record rent payments.', 'FORBIDDEN');
  const idempotencyKey = input.idempotencyKey || randomUUID();
  const paymentDay = dayInKolkata(input.paidOn, { field: 'paidOn', statusCode: 422 });
  if (paymentDay > dayInKolkata(new Date())) throw new AppError(422, 'Payment date cannot be in the future.', 'INVALID_PAYMENT_DATE');
  return transaction(async (session) => {
    const due = await RentDue.findById(input.rentDueId).session(session);
    if (!due) throw new AppError(404, 'Rent due not found.', 'RENT_DUE_NOT_FOUND');
    const hostel = await Hostel.findOne({ _id: due.hostelId, ...ownerScope(user) }).session(session);
    if (!hostel) throw new AppError(404, 'Rent due not found.', 'RENT_DUE_NOT_FOUND');
    if (hostel.isBlocked) throw new AppError(423, 'This hostel is blocked. Payments cannot be recorded.', 'HOSTEL_BLOCKED');
    let dueDay;
    try {
      dueDay = dayInKolkata(due.dueDate, { field: 'RentDue.dueDate' });
      dayInKolkata(due.periodStart, { field: 'RentDue.periodStart' });
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(due.billingPeriod)) throw new AppError(500, 'The rent due has an invalid billing period; no payment was recorded.', 'INVALID_STORED_DATE', { field: 'RentDue.billingPeriod' });
    } catch (error) {
      logger.error({ event: 'rent_payment_date_integrity_error', operation: 'recordPayment', requestId: input.requestId || '', rentDueId: String(due._id), field: error.details?.field || 'RentDue.date', errorName: error.name, errorMessage: error.message, dueDateValue: due.dueDate instanceof Date ? (Number.isFinite(due.dueDate.getTime()) ? due.dueDate.toISOString() : 'Invalid Date') : due.dueDate ?? null, periodStartValue: due.periodStart instanceof Date ? (Number.isFinite(due.periodStart.getTime()) ? due.periodStart.toISOString() : 'Invalid Date') : due.periodStart ?? null, billingPeriod: due.billingPeriod ?? null });
      throw error;
    }
    const persistedStay = await Stay.findOne({ _id: due.stayId, tenantId: due.tenantId, hostelId: due.hostelId }).session(session).select('_id');
    if (!persistedStay) throw new AppError(409, 'The rent due is not linked to a valid tenant stay. No payment was recorded.', 'RENT_DUE_STAY_MISMATCH');
    const paymentDate = parseLocalDate(paymentDay);
    const priorPayment = await Payment.findOne({ idempotencyKey }).session(session);
    if (priorPayment) {
      const sameRequest = String(priorPayment.rentDueId) === String(due._id)
        && priorPayment.amountPaise === input.amountPaise
        && priorPayment.paidOn?.getTime() === paymentDate.getTime()
        && priorPayment.method === input.method
        && priorPayment.transactionReference === (input.transactionReference || '');
      if (!sameRequest) throw new AppError(409, 'This payment request key was already used for different payment details.', 'IDEMPOTENCY_KEY_REUSED');
      return priorPayment;
    }
    const locked = await RentDue.updateOne({ _id: due._id, __v: due.__v }, { $inc: { __v: 1 } }, { session });
    if (!locked.modifiedCount) throw new AppError(409, 'The rent balance changed. Refresh and retry.', 'CONCURRENT_UPDATE');
    const outstanding = due.amountDuePaise - due.amountSettledPaise;
    if (outstanding <= 0) throw new AppError(409, 'This rent period is already paid.', 'RENT_DUE_SETTLED');
    if (input.amountPaise > outstanding) throw new AppError(422, 'Payment cannot exceed the outstanding balance.', 'PAYMENT_EXCEEDS_BALANCE');
    const now = new Date();
    const [payment] = await Payment.create([{
      tenantId: due.tenantId, stayId: due.stayId, rentDueId: due._id, hostelId: due.hostelId,
      amountPaise: input.amountPaise, paidOn: paymentDate, method: input.method, idempotencyKey,
      transactionReference: input.transactionReference || '', status: 'APPROVED', decisionMakerId: user._id, decidedAt: now,
      events: [{ fromStatus: null, toStatus: 'APPROVED', actorId: user._id, note: 'Payment recorded by management' }],
    }], { session });
    const settled = due.amountSettledPaise + input.amountPaise;
    const remaining = due.amountDuePaise - settled;
    const late = paymentDay > dueDay;
    const status = remaining <= 0 ? (late ? 'PAID_LATE' : 'PAID') : settled > 0 ? 'PARTIALLY_PAID' : 'UPCOMING';
    await RentDue.updateOne({ _id: due._id }, { $set: { amountSettledPaise: settled, lastPaymentPaidOn: paymentDate, status } }, { session });
    await AuditLog.create([{ actorId: user._id, action: 'PAYMENT_RECORDED', entityType: 'PAYMENT', entityId: payment._id, reason: 'Payment recorded by management', before: { amountSettledPaise: due.amountSettledPaise }, after: { amountSettledPaise: settled, amountPaise: input.amountPaise, rentStatus: status }, requestId: input.requestId || '' }], { session });
    return payment;
  });
}

export async function listPayments(user, query) {
  let filter = { ...(query.status ? { status: query.status } : {}), ...(query.rentDueId ? { rentDueId: query.rentDueId } : {}) };
  if (user.role === 'OWNER') {
    const hostels = await Hostel.find({ ...ownerScope(user), isDeleted: false, isBlocked: { $ne: true }, ...(query.hostelId ? { _id: query.hostelId } : {}) }).select('_id').lean();
    if (query.hostelId && !hostels.length) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = { $in: hostels.map((item) => item._id) };
  } else if (user.role === 'ADMIN' && query.hostelId) {
    if (!await Hostel.exists({ _id: query.hostelId })) throw new AppError(404, 'Hostel not found.', 'HOSTEL_NOT_FOUND');
    filter.hostelId = query.hostelId;
  }
  filter.stayId = { $in: await Stay.distinct('_id', { status: 'ACTIVE', ...(filter.hostelId ? { hostelId: filter.hostelId } : {}) }) };
  if (query.month) {
    const dueFilter = { billingPeriod: new RegExp(`^${query.month}`), stayId: filter.stayId, ...(filter.hostelId ? { hostelId: filter.hostelId } : {}) };
    filter.rentDueId = { $in: await RentDue.distinct('_id', dueFilter) };
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const paymentTenantIds = await Payment.distinct('tenantId', filter);
    const matchingTenants = await User.find({ _id: { $in: paymentTenantIds }, role: 'TENANT', name: { $regex: escaped, $options: 'i' } }).distinct('_id');
    filter.tenantId = { $in: matchingTenants };
  }
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ submittedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('tenantId', 'name email').populate('rentDueId', 'billingPeriod dueDate amountDuePaise amountSettledPaise').populate('stayId', 'agreedMonthlyRentPaise').populate('hostelId', 'name city').lean(),
    Payment.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getPayment(user, paymentId) {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
  if (user.role === 'OWNER' && !await Hostel.exists({ _id: payment.hostelId, ownerId: user._id })) throw new AppError(404, 'Payment request not found.', 'PAYMENT_NOT_FOUND');
  if (user.role !== 'ADMIN' && await Hostel.exists({ _id: payment.hostelId, isBlocked: true })) throw new AppError(423, 'This hostel is blocked. Payment records are temporarily unavailable.', 'HOSTEL_BLOCKED');
  return payment;
}
