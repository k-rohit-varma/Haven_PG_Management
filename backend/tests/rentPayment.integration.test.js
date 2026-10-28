import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { DepositTransaction } from '../src/models/DepositTransaction.js';
import { Hostel } from '../src/models/Hostel.js';
import { Payment } from '../src/models/Payment.js';
import { RentDue } from '../src/models/RentDue.js';
import { Room } from '../src/models/Room.js';
import { Stay } from '../src/models/Stay.js';
import { User } from '../src/models/User.js';
import * as property from '../src/services/propertyService.js';
import * as tenants from '../src/services/tenantService.js';
import * as finance from '../src/services/rentPaymentService.js';
import * as deposits from '../src/services/depositService.js';
import { parseLocalDate } from '../src/utils/dateOnly.js';

const uri = process.env.TEST_PAYMENT_MONGODB_URI;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('management directly assigns tenants, records rent receipts, and preserves deposit ledger history', { skip: !uri && 'Set TEST_PAYMENT_MONGODB_URI to a MongoDB replica set URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_PAYMENT_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User.init(), Hostel.init(), Room.init(), Stay.init(), RentDue.init(), Payment.init(), DepositTransaction.init()]);
  const [admin, owner, otherOwner] = await User.create([
    { name: 'Rent Admin', email: 'rent-admin-new@example.com', passwordHash: 'test-hash', role: 'ADMIN' },
    { name: 'Rent Owner', email: 'rent-owner-new@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Other Owner', email: 'rent-other-owner-new@example.com', passwordHash: 'test-hash', role: 'OWNER' },
  ]);
  const hostel = await property.createHostel(admin, { name: 'Rent House', address: '12 East Road', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id });
  const room = await property.createRoom(owner, String(hostel._id), { identifier: 'A1', sharingType: 1, maxCapacity: 1, genderEligibility: 'ANY', defaultRentPaise: 120000 });
  const assigned = await tenants.createTenant(owner, { name: 'Rent Tenant', phone: '9876543213', gender: 'FEMALE', hostelId: String(hostel._id), roomId: String(room._id), moveInDate: today(), agreedMonthlyRentPaise: 150000, securityDepositPaise: 200000 }, 'rent-test-assignment');
  assert.equal(assigned.stay.agreedMonthlyRentPaise, 150000, 'tenant agreed rent can differ from room default');
  assert.equal(await Stay.countDocuments({ status: 'ACTIVE', roomId: room._id }), 1);
  const reconciliationDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
  const firstReconciliation = await finance.generateRentDues(reconciliationDate);
  assert.equal(firstReconciliation.checked, 1);
  assert.ok(firstReconciliation.created >= 2, 'historical and due-soon cycles are generated from the stay date');
  const dueCountAfterFirstRun = await RentDue.countDocuments({ stayId: assigned.stay._id });
  const secondReconciliation = await finance.generateRentDues(reconciliationDate);
  assert.equal(secondReconciliation.created, 0, 'reconciliation can be rerun without duplicate dues');
  assert.ok(secondReconciliation.skipped >= firstReconciliation.created);
  assert.equal(await RentDue.countDocuments({ stayId: assigned.stay._id }), dueCountAfterFirstRun);
  await assert.rejects(() => tenants.createTenant(otherOwner, { name: 'Cross owner', phone: '9876543214', hostelId: String(hostel._id), roomId: String(room._id), moveInDate: today(), agreedMonthlyRentPaise: 120000, securityDepositPaise: 0 }), { code: 'HOSTEL_NOT_FOUND' });
  const periodStart = new Date(`${today()}T00:00:00+05:30`);
  const due = await RentDue.create({ tenantId: assigned.tenant._id, stayId: assigned.stay._id, hostelId: hostel._id, roomId: room._id, billingPeriod: today().slice(0, 7), periodStart, dueDate: periodStart, amountDuePaise: 150000 });
  await assert.rejects(() => finance.recordPayment(otherOwner, { rentDueId: String(due._id), amountPaise: 50000, paidOn: today(), method: 'CASH' }), { code: 'RENT_DUE_NOT_FOUND' });
  const paymentInput = { rentDueId: String(due._id), idempotencyKey: '8d2a98bb-14eb-4fa9-8c73-0f07d8b6f6b3', amountPaise: 50000, paidOn: '2000-10-15', method: 'CASH' };
  const recordedPayment = await finance.recordPayment(owner, paymentInput);
  assert.equal(recordedPayment.paidOn.getTime(), parseLocalDate(paymentInput.paidOn).getTime(), 'entered historical date is preserved');
  const reloadedPayment = await Payment.findById(recordedPayment._id).lean();
  assert.equal(reloadedPayment.paidOn.getTime(), parseLocalDate(paymentInput.paidOn).getTime());
  const retriedPayment = await finance.recordPayment(owner, paymentInput);
  assert.equal(String(retriedPayment._id), String(recordedPayment._id), 'repeated idempotency key returns the original payment');
  assert.equal((await RentDue.findById(due._id)).amountSettledPaise, 50000);
  assert.equal(await Payment.countDocuments({ rentDueId: due._id, status: 'APPROVED' }), 1);
  const formerStay = await Stay.create({ tenantId: assigned.tenant._id, hostelId: hostel._id, roomId: room._id, moveInDate: new Date('2024-09-10T00:00:00+05:30'), leavingDate: new Date('2024-10-09T00:00:00+05:30'), agreedMonthlyRentPaise: 140000, rentTerms: [], securityDepositPaise: 0, rentCycleAnchorDay: 10, status: 'LEFT', financialTermsLocked: true, termsConfirmedAt: new Date('2024-09-10T00:00:00+05:30'), events: [{ fromStatus: null, toStatus: 'LEFT', actorId: owner._id, at: new Date('2024-10-09T00:00:00+05:30') }] });
  const historicalDue = await RentDue.create({ tenantId: assigned.tenant._id, stayId: formerStay._id, hostelId: hostel._id, roomId: room._id, billingPeriod: '2024-10', periodStart: new Date('2024-09-10T00:00:00+05:30'), dueDate: new Date('2024-10-10T00:00:00+05:30'), amountDuePaise: 140000, amountSettledPaise: 20000, status: 'OVERDUE' });
  const historicalPayment = await Payment.create({ tenantId: assigned.tenant._id, stayId: formerStay._id, rentDueId: historicalDue._id, hostelId: hostel._id, amountPaise: 20000, paidOn: new Date('2024-10-05T00:00:00+05:30'), method: 'CASH', status: 'APPROVED', decisionMakerId: owner._id, decidedAt: new Date('2024-10-05T00:00:00+05:30') });
  const operationalDues = await finance.listRentDues(owner, { page: 1, limit: 100 });
  const operationalPayments = await finance.listPayments(owner, { page: 1, limit: 100 });
  assert.equal(operationalDues.items.some((item) => String(item._id) === String(historicalDue._id)), false);
  assert.equal(operationalPayments.items.some((item) => String(item._id) === String(historicalPayment._id)), false);
  const profileHistory = await tenants.getTenant(owner, String(assigned.tenant._id));
  assert.ok(profileHistory.dues.some((item) => String(item._id) === String(historicalDue._id)), 'former stay dues remain available in tenant history');
  assert.ok(profileHistory.payments.some((item) => String(item._id) === String(historicalPayment._id)), 'former stay payments remain available in tenant history');
  assert.equal((await RentDue.findById(historicalDue._id)).amountSettledPaise, 20000);
  const malformedDueId = new mongoose.Types.ObjectId();
  await RentDue.collection.insertOne({ _id: malformedDueId, tenantId: assigned.tenant._id, stayId: assigned.stay._id, hostelId: hostel._id, roomId: room._id, billingPeriod: today().slice(0, 7), periodStart, dueDate: null, amountDuePaise: 1000, amountSettledPaise: 0, status: 'UPCOMING', createdAt: new Date(), updatedAt: new Date() });
  await assert.rejects(() => finance.recordPayment(owner, { rentDueId: String(malformedDueId), idempotencyKey: 'f4f859db-4b62-4ca7-82c3-035ee87af3af', amountPaise: 1000, paidOn: today(), method: 'CASH' }), { code: 'INVALID_STORED_DATE', statusCode: 500 });
  assert.equal(await Payment.countDocuments({ idempotencyKey: 'f4f859db-4b62-4ca7-82c3-035ee87af3af' }), 0, 'invalid stored due dates do not create partial payments');
  await deposits.createDepositTransaction(owner, String(assigned.stay._id), { type: 'RECEIVED', amountPaise: 200000, transactionDate: today(), reason: 'Initial deposit received' });
  await deposits.createDepositTransaction(owner, String(assigned.stay._id), { type: 'REFUND', amountPaise: 25000, transactionDate: today(), reason: 'Approved partial refund' });
  assert.equal((await deposits.getDeposit(owner, String(assigned.stay._id))).balancePaise, 175000);
  assert.equal(await DepositTransaction.countDocuments({ stayId: assigned.stay._id }), 2);
});
