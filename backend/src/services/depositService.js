import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { Hostel } from '../models/Hostel.js';
import { Stay } from '../models/Stay.js';
import { parseLocalDate } from '../validators/stayValidators.js';

const ownerScope = (user) => user.role === 'OWNER' ? { ownerId: user._id } : {};
const inKolkata = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const incoming = new Set(['RECEIVED', 'ADJUSTMENT_CREDIT']);

async function transaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This workflow requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}

async function authorizedStay(user, stayId, session) {
  const stay = await Stay.findById(stayId).session(session || null);
  if (!stay) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  if (await Hostel.exists({ _id: stay.hostelId, isBlocked: true }) && user.role !== 'ADMIN') throw new AppError(423, 'This hostel is blocked. Deposit access is temporarily unavailable.', 'HOSTEL_BLOCKED');
  if (user.role === 'TENANT' && String(stay.tenantId) !== String(user._id)) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  if (user.role !== 'TENANT' && !await Hostel.exists({ _id: stay.hostelId, ...ownerScope(user) }).session(session || null)) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  return stay;
}

async function balanceFor(stayId, session) {
  const rows = await DepositTransaction.aggregate([
    { $match: { stayId: new mongoose.Types.ObjectId(String(stayId)) } },
    { $group: { _id: null, total: { $sum: { $cond: [{ $in: ['$type', [...incoming]] }, '$amountPaise', { $multiply: ['$amountPaise', -1] }] } }, received: { $sum: { $cond: [{ $eq: ['$type', 'RECEIVED'] }, '$amountPaise', 0] } } } },
  ]).session(session || null);
  return { balancePaise: rows[0]?.total || 0, receivedPaise: rows[0]?.received || 0 };
}

export async function getDeposit(user, stayId) {
  const stay = await authorizedStay(user, stayId);
  const { balancePaise, receivedPaise } = await balanceFor(stay._id);
  const transactions = await DepositTransaction.find({ stayId: stay._id }).sort({ transactionDate: -1, createdAt: -1 }).populate('actorId', 'name').lean();
  return { stayId: stay._id, initialDepositPaise: stay.securityDepositPaise, receivedPaise, balancePaise, transactions };
}

export async function listDepositTransactions(user, stayId, query) {
  const stay = await authorizedStay(user, stayId);
  const [items, total] = await Promise.all([
    DepositTransaction.find({ stayId: stay._id }).sort({ transactionDate: -1, createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('actorId', 'name').lean(),
    DepositTransaction.countDocuments({ stayId: stay._id }),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function createDepositTransaction(user, stayId, input) {
  if (!['OWNER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'Only the owner can record deposit transactions.', 'FORBIDDEN');
  if (input.transactionDate > inKolkata(new Date())) throw new AppError(422, 'Deposit transaction date cannot be in the future.', 'INVALID_DEPOSIT_DATE');
  return transaction(async (session) => {
    const stay = await authorizedStay(user, stayId, session);
    const locked = await Stay.updateOne({ _id: stay._id, __v: stay.__v }, { $inc: { __v: 1 } }, { session });
    if (!locked.modifiedCount) throw new AppError(409, 'The stay changed. Refresh and try again.', 'CONCURRENT_UPDATE');
    const { balancePaise, receivedPaise } = await balanceFor(stay._id, session);
    const increases = incoming.has(input.type);
    if (!increases && input.amountPaise > balancePaise) throw new AppError(409, 'The transaction exceeds the available deposit balance.', 'DEPOSIT_BALANCE_TOO_LOW');
    if (input.type === 'RECEIVED' && receivedPaise + input.amountPaise > stay.securityDepositPaise) throw new AppError(409, 'Recorded receipts cannot exceed the agreed initial deposit. Use an explicit adjustment if needed.', 'DEPOSIT_RECEIPTS_EXCEED_AGREEMENT');
    const [record] = await DepositTransaction.create([{
      stayId: stay._id, tenantId: stay.tenantId, hostelId: stay.hostelId, type: input.type,
      amountPaise: input.amountPaise, transactionDate: parseLocalDate(input.transactionDate), reference: input.reference || '',
      reason: input.reason, actorId: user._id,
    }], { session });
    const nextBalance = balancePaise + (increases ? input.amountPaise : -input.amountPaise);
    await AuditLog.create([{
      actorId: user._id, action: `DEPOSIT_${input.type}`, entityType: 'DEPOSIT_TRANSACTION', entityId: record._id,
      reason: input.reason, before: { balancePaise }, after: { balancePaise: nextBalance, type: input.type, amountPaise: input.amountPaise, stayId: stay._id },
    }], { session });
    return record;
  });
}
