import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { AuditLog } from '../models/AuditLog.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { Hostel } from '../models/Hostel.js';
import { Payment } from '../models/Payment.js';
import { RentDue } from '../models/RentDue.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';
import { currentRentPaise, dayInKolkata } from '../utils/rentTerms.js';
import { ACTIVE_STAY_STATUS, getRoomOccupancy } from '../utils/roomOccupancy.js';
import { parseLocalDate } from '../validators/stayValidators.js';
import { logger } from '../utils/logger.js';

const ownerScope = (user) => user.role === 'OWNER' ? { ownerId: user._id } : {};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

function duplicateIndexName(error) {
  return error.message?.match(/index:\s+(.+?)\s+dup key:/)?.[1] || null;
}

function inferModelFromIndex(indexName) {
  if (!indexName) return null;
  if (/applicationId|tenantId_1_status_1/.test(indexName)) return 'Stay';
  if (/phone_1|email_1/.test(indexName)) return 'User';
  return null;
}

function setDatabaseOperation(context, model, operation) {
  context.failingModel = model;
  context.databaseOperation = `${model}.${operation}`;
}

async function transaction(work, context = {}) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    const indexName = error.code === 11000 ? duplicateIndexName(error) : null;
    const safeMessage = error.code === 11000 ? error.message.replace(/dup key:\s*\{.*\}\s*$/, 'dup key: [redacted]') : error.message;
    const indexedModel = inferModelFromIndex(indexName);
    const indexedOperation = indexName === 'applicationId_1' ? 'Stay.create'
      : /phone_1|email_1/.test(indexName || '') ? 'User.create' : null;
    logger.warn({
      event: 'tenant_transaction_failed', service: 'tenantService', operation: context.operation || 'transaction',
      databaseOperation: indexedOperation || context.databaseOperation || null, model: indexedModel || context.failingModel || null,
      requestId: context.requestId || '', userId: context.userId || '', role: context.role || '',
      tenantId: context.tenantId || '', hostelId: context.hostelId || '', roomId: context.roomId || '', stayId: context.stayId || '',
      errorName: error.name, errorMessage: safeMessage, mongoCode: error.code || null, mongoCodeName: error.codeName || null,
      duplicateIndex: indexName, keyPattern: error.code === 11000 ? error.keyPattern || null : null,
      transactionAborted: !session.inTransaction(),
    });
    if (error instanceof AppError) throw error;
    if (error.code === 11000) {
      const keys = Object.keys(error.keyPattern || {});
      if (keys.includes('phone') || /phone_1/.test(indexName || '')) throw new AppError(409, 'An account with this phone number already exists.', 'PHONE_IN_USE', undefined, error);
      if (keys.includes('email') || /email_1/.test(indexName || '')) throw new AppError(409, 'An account with this email already exists.', 'EMAIL_IN_USE', undefined, error);
      if ((keys.includes('tenantId') && keys.includes('status')) || /tenantId_1_status_1/.test(indexName || '')) throw new AppError(409, 'This tenant already has an active stay.', 'TENANT_ALREADY_ASSIGNED', undefined, error);
      if (indexName === 'applicationId_1' || (keys.length === 1 && keys[0] === 'applicationId' && !/applicationId_1_partial/.test(indexName || ''))) {
        throw new AppError(503, 'Tenant assignment is temporarily unavailable due to a database configuration issue. Contact an administrator.', 'ASSIGNMENT_DATABASE_MISCONFIGURED', undefined, error);
      }
      throw new AppError(409, 'An existing record conflicts with these tenant details or assignment.', 'ASSIGNMENT_CONFLICT', undefined, error);
    }
    if (error.code === 20 || error.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set/i.test(error.message)) throw new AppError(503, 'This operation requires MongoDB transaction support.', 'TRANSACTIONS_UNAVAILABLE', undefined, error);
    if (error.code === 112 || error.codeName === 'WriteConflict' || error.hasErrorLabel?.('TransientTransactionError')) throw new AppError(409, 'Room availability changed during assignment. Refresh the room list and retry.', 'ROOM_CHANGED', undefined, error);
    throw error;
  } finally { await session.endSession(); }
}

async function assignedHostels(user) {
  const hostels = await Hostel.find({ ...ownerScope(user), isDeleted: false, isBlocked: { $ne: true } }).select('_id').lean();
  return hostels.map(({ _id }) => _id);
}

async function requireTenant(user, tenantId, session) {
  const tenant = await User.findOne({ _id: tenantId, role: 'TENANT', isDeleted: false }).session(session || null);
  if (!tenant) throw new AppError(404, 'Tenant not found.', 'TENANT_NOT_FOUND');
  if (user.role === 'OWNER') {
    const hostels = await assignedHostels(user);
    if (!await Stay.exists({ tenantId, hostelId: { $in: hostels } }).session(session || null)) throw new AppError(404, 'Tenant not found.', 'TENANT_NOT_FOUND');
  }
  return tenant;
}

async function requireStay(user, stayId, session) {
  const stay = await Stay.findById(stayId).session(session || null);
  if (!stay) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  const hostel = await Hostel.findOne({ _id: stay.hostelId, ...ownerScope(user) }).session(session || null);
  if (!hostel) throw new AppError(404, 'Stay not found.', 'STAY_NOT_FOUND');
  if (hostel.isBlocked) throw new AppError(423, 'This hostel is blocked. Tenant changes are unavailable.', 'HOSTEL_BLOCKED');
  return { stay, hostel };
}

function assertTenantEligible(gender, hostel, room) {
  if (!['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'].includes(gender)) throw new AppError(422, 'Choose a valid tenant gender profile before assigning a room.', 'INVALID_GENDER');
  if (!['ANY', 'MALE', 'FEMALE'].includes(room.genderEligibility)) throw new AppError(422, 'This room has no valid eligibility configuration. Update the room before assignment.', 'ROOM_ELIGIBILITY_UNCONFIGURED');
  if (hostel.accommodationPolicy === 'MALE_ONLY' && gender !== 'MALE') throw new AppError(422, 'This hostel accepts only Male tenant profiles.', 'HOSTEL_POLICY_MISMATCH');
  if (hostel.accommodationPolicy === 'FEMALE_ONLY' && gender !== 'FEMALE') throw new AppError(422, 'This hostel accepts only Female tenant profiles.', 'HOSTEL_POLICY_MISMATCH');
  if (room.genderEligibility !== 'ANY' && gender !== room.genderEligibility) {
    const genderLabel = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other', PREFER_NOT_TO_SAY: 'Not provided' }[gender] || 'Unknown';
    const eligibilityLabel = room.genderEligibility === 'MALE' ? 'Male' : 'Female';
    throw new AppError(422, `This room is configured for ${eligibilityLabel} tenants, but the submitted gender profile is ${genderLabel}.`, 'ROOM_ELIGIBILITY_MISMATCH');
  }
}

function cycleDate(anchor, offset) {
  const [year, month, day] = anchor.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, end)).padStart(2, '0')}`;
}

export async function createTenant(user, input, requestId = '') {
  if (!['ADMIN', 'OWNER'].includes(user.role)) throw new AppError(403, 'Only an owner or admin can create tenant records.', 'FORBIDDEN');
  const passwordHash = await bcrypt.hash(randomBytes(48).toString('base64url'), 12);
  const transactionContext = { operation: 'createTenant', requestId, userId: String(user._id), role: user.role, hostelId: String(input.hostelId), roomId: String(input.roomId) };
  try {
    return await transaction(async (session) => {
      setDatabaseOperation(transactionContext, 'Hostel', 'findOne');
      const hostel = await Hostel.findOne({ _id: input.hostelId, ...ownerScope(user), isActive: true, isBlocked: { $ne: true }, isDeleted: false }).session(session);
      if (!hostel) throw new AppError(404, 'The selected property is unavailable or not assigned to you.', 'HOSTEL_NOT_FOUND');
      setDatabaseOperation(transactionContext, 'Room', 'findOne');
      const room = await Room.findOne({ _id: input.roomId, hostelId: hostel._id, isActive: true, isDeleted: false }).session(session);
      if (!room) throw new AppError(404, 'Choose an active room in this property.', 'ROOM_NOT_FOUND');
      assertTenantEligible(input.gender, hostel, room);
      const phone = normalizeIndianPhone(input.phone);
      if (!phone) throw new AppError(422, 'Enter a valid Indian mobile number.', 'INVALID_PHONE');
      setDatabaseOperation(transactionContext, 'User', 'findOne');
      const existingAccount = await User.findOne({ phone }).select('_id role').session(session);
      if (existingAccount) {
        if (existingAccount.role === 'TENANT' && await Stay.exists({ tenantId: existingAccount._id, status: ACTIVE_STAY_STATUS }).session(session)) {
          throw new AppError(409, 'This tenant already has an active stay.', 'TENANT_ALREADY_ASSIGNED');
        }
        throw new AppError(409, 'An account with this phone number already exists.', 'PHONE_IN_USE');
      }
      setDatabaseOperation(transactionContext, 'User', 'exists');
      if (input.email && await User.exists({ email: input.email.toLowerCase() }).session(session)) throw new AppError(409, 'An account with this email already exists.', 'EMAIL_IN_USE');
      setDatabaseOperation(transactionContext, 'Room', 'updateOne');
      const roomLock = await Room.updateOne({ _id: room._id, __v: room.__v, isActive: true, isDeleted: false }, { $inc: { __v: 1 } }, { session });
      if (!roomLock.modifiedCount) throw new AppError(409, 'The room configuration changed. Refresh the room list and try again.', 'ROOM_CHANGED');
      setDatabaseOperation(transactionContext, 'Room', 'occupancyAggregate');
      const occupancy = await getRoomOccupancy(room._id, session);
      if (!occupancy || occupancy.availableBeds < 1) throw new AppError(409, 'This room has no available beds. Refresh the room list and choose another room.', 'ROOM_FULL', { roomId: String(room._id), capacity: room.maxCapacity, occupancy: occupancy?.occupancy ?? null, availableBeds: occupancy?.availableBeds ?? 0 });
      setDatabaseOperation(transactionContext, 'User', 'create');
      const [tenant] = await User.create([{
        name: input.name, phone, ...(input.email ? { email: input.email } : {}), emergencyContact: input.emergencyContact,
        notes: input.notes, gender: input.gender, role: 'TENANT', isActive: true, passwordHash,
      }], { session });
      transactionContext.tenantId = String(tenant._id);
      const moveInDate = parseLocalDate(input.moveInDate);
      const effectiveFrom = parseLocalDate(cycleDate(input.moveInDate, 1));
      const now = new Date();
      setDatabaseOperation(transactionContext, 'Stay', 'create');
      const [stay] = await Stay.create([{
        tenantId: tenant._id, hostelId: hostel._id, roomId: room._id, moveInDate,
        agreedMonthlyRentPaise: input.agreedMonthlyRentPaise,
        rentTerms: [{ monthlyRentPaise: input.agreedMonthlyRentPaise, effectiveFrom, actorId: user._id, reason: 'Initial agreed rent' }],
        securityDepositPaise: input.securityDepositPaise, rentCycleAnchorDay: Number(input.moveInDate.slice(-2)), status: ACTIVE_STAY_STATUS,
        financialTermsLocked: true, termsConfirmedAt: now,
        events: [{ fromStatus: null, toStatus: ACTIVE_STAY_STATUS, actorId: user._id, at: now, reason: 'Tenant created and assigned by management' }],
      }], { session });
      transactionContext.stayId = String(stay._id);
      setDatabaseOperation(transactionContext, 'AuditLog', 'create');
      await AuditLog.create([
        { actorId: user._id, action: 'TENANT_CREATED', entityType: 'USER', entityId: tenant._id, reason: 'Tenant created and assigned', after: { name: tenant.name, phone: tenant.phone, stayId: stay._id, requestId } },
        { actorId: user._id, action: 'TENANT_ASSIGNED', entityType: 'STAY', entityId: stay._id, reason: 'Tenant created and assigned', after: { tenantId: tenant._id, hostelId: hostel._id, roomId: room._id, moveInDate, agreedMonthlyRentPaise: input.agreedMonthlyRentPaise, securityDepositPaise: input.securityDepositPaise }, requestId },
      ], { session, ordered: true });
      return { tenant, stay };
    }, transactionContext);
  } catch (error) {
    logger.warn({ event: 'tenant_assignment_failed', operation: 'POST /api/v1/tenants', requestId, userId: String(user._id), role: user.role, hostelId: String(input.hostelId), roomId: String(input.roomId), errorCode: error.code || 'UNEXPECTED_ERROR', statusCode: error.statusCode || 500, ...(error.details ? { details: error.details } : {}) });
    throw error;
  }
}

export async function listTenants(user, query) {
  const hostels = await assignedHostels(user);
  let stayFilter = { hostelId: { $in: hostels } };
  if (query.hostelId) stayFilter.hostelId = hostels.some((id) => String(id) === query.hostelId) ? query.hostelId : { $in: [] };
  if (query.roomId) stayFilter.roomId = query.roomId;
  if (query.status && query.status !== 'NO_STAY') stayFilter.status = query.status;
  let stayTenantIds = null;
  if (query.hostelId || query.roomId || (query.status && query.status !== 'NO_STAY')) {
    stayTenantIds = (await Stay.find(stayFilter).distinct('tenantId'));
  }
  const tenantFilter = { role: 'TENANT', isDeleted: false };
  if (stayTenantIds) tenantFilter._id = { $in: stayTenantIds };
  if (query.status === 'NO_STAY') {
    const baseIds = await Stay.distinct('tenantId', stayFilter);
    const activeTenantIds = await Stay.distinct('tenantId', { hostelId: { $in: query.hostelId ? [query.hostelId] : hostels }, status: 'ACTIVE' });
    tenantFilter._id = { $in: baseIds, $nin: activeTenantIds };
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    tenantFilter.$or = [{ name: pattern }, { phone: pattern }, { email: pattern }];
  }
  const [items, total] = await Promise.all([
    User.find(tenantFilter).select('name phone email emergencyContact notes gender isActive createdAt').sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    User.countDocuments(tenantFilter),
  ]);
  const stays = await Stay.find({ tenantId: { $in: items.map(({ _id }) => _id) }, hostelId: { $in: hostels } }).sort({ status: 1, moveInDate: -1 }).populate('hostelId', 'name city').populate('roomId', 'identifier').lean();
  const depositRows = await DepositTransaction.aggregate([
    { $match: { stayId: { $in: stays.map(({ _id }) => _id) } } },
    { $group: { _id: '$stayId', balancePaise: { $sum: { $cond: [{ $in: ['$type', ['RECEIVED', 'ADJUSTMENT_CREDIT']] }, '$amountPaise', { $multiply: ['$amountPaise', -1] }] } } } },
  ]);
  const depositByStay = new Map(depositRows.map((row) => [String(row._id), row.balancePaise]));
  const stayByTenant = new Map();
  for (const stay of stays) if (!stayByTenant.has(String(stay.tenantId)) || stay.status === 'ACTIVE') stayByTenant.set(String(stay.tenantId), stay);
  const rows = items.map((tenant) => {
    const stay = stayByTenant.get(String(tenant._id));
    return { ...tenant, stay: stay ? { ...stay, currentRentPaise: currentRentPaise(stay), currentDepositPaise: depositByStay.get(String(stay._id)) || 0 } : null };
  });
  return { items: rows, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getTenant(user, tenantId) {
  const tenant = await requireTenant(user, tenantId);
  const hostels = await assignedHostels(user);
  const stays = await Stay.find({ tenantId, hostelId: { $in: hostels } }).sort({ moveInDate: -1 }).populate('hostelId', 'name city address').populate('roomId', 'identifier sharingType maxCapacity').lean();
  const stayIds = stays.map(({ _id }) => _id);
  const [payments, deposits, audit] = await Promise.all([
    Payment.find({ tenantId, stayId: { $in: stayIds } }).sort({ paidOn: -1 }).populate('hostelId', 'name').lean(),
    DepositTransaction.find({ tenantId, stayId: { $in: stayIds } }).sort({ transactionDate: -1 }).populate('actorId', 'name').lean(),
    AuditLog.find({ entityType: 'USER', entityId: tenantId }).sort({ occurredAt: -1 }).limit(100).populate('actorId', 'name').lean(),
  ]);
  const depositBalances = new Map();
  for (const item of deposits) {
    const key = String(item.stayId);
    const sign = ['RECEIVED', 'ADJUSTMENT_CREDIT'].includes(item.type) ? 1 : -1;
    depositBalances.set(key, (depositBalances.get(key) || 0) + sign * item.amountPaise);
  }
  return { tenant, stays: stays.map((stay) => ({ ...stay, currentRentPaise: currentRentPaise(stay), currentDepositPaise: depositBalances.get(String(stay._id)) || 0 })), payments, deposits, audit };
}

export async function updateTenant(user, tenantId, input, requestId = '') {
  return transaction(async (session) => {
    const tenant = await requireTenant(user, tenantId, session);
    const before = Object.fromEntries(Object.keys(input).map((key) => [key, tenant[key]]));
    const updated = await User.findOneAndUpdate({ _id: tenant._id, role: 'TENANT', isDeleted: false }, { $set: input }, { new: true, runValidators: true, session }).select('name phone email emergencyContact notes gender isActive').lean();
    await AuditLog.create([{ actorId: user._id, action: 'TENANT_PROFILE_UPDATED', entityType: 'USER', entityId: tenant._id, reason: 'Tenant profile updated', before, after: input, requestId }], { session });
    return updated;
  });
}

export async function updateRent(user, stayId, input, requestId = '') {
  return transaction(async (session) => {
    const { stay } = await requireStay(user, stayId, session);
    if (stay.status !== 'ACTIVE') throw new AppError(409, 'Rent can only be updated for an active stay.', 'STAY_NOT_ACTIVE');
    const today = dayInKolkata(new Date());
    if (input.effectiveDate < today) throw new AppError(422, 'Backdated rent changes are disabled so existing dues and payment history are not altered.', 'BACKDATED_RENT_CHANGE');
    if (!Array.from({ length: 120 }, (_, index) => cycleDate(dayInKolkata(stay.moveInDate), index)).includes(input.effectiveDate)) throw new AppError(422, 'Choose a monthly rent-cycle date based on the tenant’s joining day.', 'INVALID_RENT_EFFECTIVE_DATE');
    if (stay.rentTerms.some((term) => dayInKolkata(term.effectiveFrom) === input.effectiveDate)) throw new AppError(409, 'A rent term already exists for that effective date.', 'RENT_TERM_EXISTS');
    if (await RentDue.exists({ stayId: stay._id, dueDate: { $gte: parseLocalDate(input.effectiveDate) } }).session(session)) throw new AppError(409, 'Rent dues already exist on or after this date. Choose a later cycle; existing dues are preserved.', 'RENT_DUE_ALREADY_GENERATED');
    const previousRentPaise = currentRentPaise(stay, parseLocalDate(input.effectiveDate));
    const locked = await Stay.updateOne({ _id: stay._id, __v: stay.__v, status: 'ACTIVE' }, { $push: { rentTerms: { monthlyRentPaise: input.monthlyRentPaise, effectiveFrom: parseLocalDate(input.effectiveDate), actorId: user._id, reason: input.reason || 'Rent updated by management' } }, $inc: { __v: 1 } }, { session });
    if (!locked.modifiedCount) throw new AppError(409, 'The stay changed. Refresh and retry.', 'CONCURRENT_UPDATE');
    await AuditLog.create([{ actorId: user._id, action: 'RENT_UPDATED', entityType: 'STAY', entityId: stay._id, reason: input.reason || 'Rent updated by management', before: { rentPaise: previousRentPaise }, after: { rentPaise: input.monthlyRentPaise, effectiveDate: input.effectiveDate }, requestId }], { session });
    return Stay.findById(stay._id).session(session);
  });
}
