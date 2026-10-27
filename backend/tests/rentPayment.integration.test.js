import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Hostel } from '../src/models/Hostel.js';
import { Payment } from '../src/models/Payment.js';
import { DepositTransaction } from '../src/models/DepositTransaction.js';
import { RentChangeRequest } from '../src/models/RentChangeRequest.js';
import { RentDue } from '../src/models/RentDue.js';
import { Room } from '../src/models/Room.js';
import { Stay } from '../src/models/Stay.js';
import { TenantApplication } from '../src/models/TenantApplication.js';
import { User } from '../src/models/User.js';
import * as propertyService from '../src/services/propertyService.js';
import * as stayService from '../src/services/stayService.js';
import * as finance from '../src/services/rentPaymentService.js';
import * as rentChanges from '../src/services/rentChangeService.js';
import * as deposits from '../src/services/depositService.js';
import * as dashboard from '../src/services/dashboardService.js';

const uri = process.env.TEST_PAYMENT_MONGODB_URI;

test('rent cycles anchor to move-in, generate idempotently, and settle only verified partial payments', { skip: !uri && 'Set TEST_PAYMENT_MONGODB_URI to a MongoDB replica set URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_PAYMENT_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User.init(), Hostel.init(), Room.init(), Stay.init(), TenantApplication.init(), RentDue.init(), Payment.init(), RentChangeRequest.init(), DepositTransaction.init()]);
  const [admin, owner, otherOwner, tenant] = await User.create([
    { name: 'System Admin', email: 'rent-system-admin@example.com', passwordHash: 'test-hash', role: 'ADMIN' },
    { name: 'Rent Owner', email: 'rent-owner@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Other Owner', email: 'rent-other-owner@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Rent Tenant', email: 'rent-tenant@example.com', passwordHash: 'test-hash', role: 'TENANT', gender: 'FEMALE' },
  ]);
  const hostel = await propertyService.createHostel(admin, { name: 'Rent House', address: '12 East Road', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id });
  const room = await propertyService.createRoom(owner, String(hostel._id), { identifier: 'A1', sharingType: 1, maxCapacity: 1, genderEligibility: 'ANY', defaultRentPaise: 120000 });
  const application = await stayService.createApplication(tenant, String(hostel._id));
  const stay = await stayService.approveAndAssign(owner, String(application._id), { roomId: String(room._id), moveInDate: '2024-08-31', agreedMonthlyRentPaise: 120000, securityDepositPaise: 200000 });

  const firstRun = await finance.generateRentDues(new Date('2024-10-01T12:00:00Z'));
  const repeatRuns = await Promise.all([finance.generateRentDues(new Date('2024-10-01T12:00:00Z')), finance.generateRentDues(new Date('2024-10-01T12:00:00Z'))]);
  assert.equal(firstRun.created, 2);
  assert.deepEqual(repeatRuns.map((run) => run.created), [0, 0]);
  const dues = await RentDue.find({ stayId: stay._id }).sort({ dueDate: 1 });
  assert.deepEqual(dues.map((due) => due.billingPeriod), ['2024-09', '2024-10']);
  assert.equal(dues[0].dueDate.toISOString(), '2024-09-29T18:30:00.000Z');

  const due = dues[0];
  const initial = await finance.submitPayment(tenant, { rentDueId: String(due._id), amountPaise: 50000, paidOn: '2024-10-01', method: 'UPI' });
  assert.equal((await RentDue.findById(due._id)).amountSettledPaise, 0, 'request alone cannot settle rent');
  await assert.rejects(() => finance.submitPayment(tenant, { rentDueId: String(due._id), amountPaise: 1000, paidOn: '2024-10-01', method: 'CASH' }), { code: 'PENDING_PAYMENT_EXISTS' });
  await assert.rejects(() => finance.decidePayment(otherOwner, String(initial._id), { decision: 'APPROVED' }), { code: 'PAYMENT_NOT_FOUND' });
  await finance.decidePayment(owner, String(initial._id), { decision: 'APPROVED' });
  assert.equal((await RentDue.findById(due._id)).amountSettledPaise, 50000);
  assert.equal((await RentDue.findById(due._id)).status, 'PARTIALLY_PAID');
  const closingPart = await finance.submitPayment(tenant, { rentDueId: String(due._id), amountPaise: 70000, paidOn: '2024-10-01', method: 'UPI' });
  await finance.decidePayment(owner, String(closingPart._id), { decision: 'APPROVED' });
  assert.equal((await RentDue.findById(due._id)).status, 'PAID_LATE');
  await assert.rejects(() => finance.submitPayment(tenant, { rentDueId: String(due._id), amountPaise: 1, paidOn: '2024-09-01', method: 'UPI' }), { code: 'RENT_DUE_SETTLED' });

  const septemberDue = dues[1];
  const rejected = await finance.submitPayment(tenant, { rentDueId: String(septemberDue._id), amountPaise: 30000, paidOn: '2024-10-31', method: 'BANK_TRANSFER' });
  await finance.decidePayment(owner, String(rejected._id), { decision: 'REJECTED', reason: 'Reference could not be confirmed' });
  assert.equal((await RentDue.findById(septemberDue._id)).amountSettledPaise, 0);
  const resubmitted = await finance.submitPayment(tenant, { rentDueId: String(septemberDue._id), amountPaise: 120000, paidOn: '2024-10-31', method: 'UPI' });
  assert.equal(resubmitted.status, 'PENDING');
  assert.equal((await finance.listPayments(tenant, { page: 1, limit: 20 })).items.length, 4);
  assert.equal((await finance.listRentDues(otherOwner, { page: 1, limit: 20 })).items.length, 0);
  assert.equal((await finance.listRentDues(owner, { page: 1, limit: 20 })).items.length, 2);
  assert.equal((await finance.listRentDues(owner, { page: 1, limit: 20, search: 'Rent Tenant' })).items.length, 2);
  assert.equal((await finance.listRentDues(owner, { page: 1, limit: 20, search: 'A1' })).items.length, 2);
  assert.equal((await finance.listRentDues(owner, { page: 1, limit: 20, month: '2024-09' })).items.length, 1);
  const ownerDashboard = await dashboard.ownerDashboard(owner);
  const octoberDashboard = await dashboard.ownerDashboard(owner, { month: '2024-10' });
  const tenantDashboard = await dashboard.tenantDashboard(tenant);
  assert.equal(ownerDashboard.totalRooms, 1);
  assert.equal(ownerDashboard.occupiedBeds, 1);
  assert.equal(ownerDashboard.pendingPayments, 1);
  assert.equal(octoberDashboard.selectedMonth, '2024-10');
  assert.equal(octoberDashboard.rentDuePaise, 120000);
  assert.equal(tenantDashboard.currentStay._id.toString(), stay._id.toString());
  assert.equal(tenantDashboard.pendingPayments, 1);

  const oldAmounts = await RentDue.find({ stayId: stay._id }).sort({ dueDate: 1 }).distinct('amountDuePaise');
  const rejectedChange = await rentChanges.createRequest(tenant, { stayId: String(stay._id), requestedRentPaise: 150000, reason: 'Requesting adjustment based on current market rates' });
  assert.equal(rejectedChange.status, 'PENDING');
  assert.ok(rejectedChange.effectiveDate > new Date());
  await assert.rejects(() => rentChanges.createRequest(tenant, { stayId: String(stay._id), requestedRentPaise: 145000, reason: 'Second request' }), { code: 'PENDING_RENT_CHANGE_EXISTS' });
  await rentChanges.decideRequest(owner, String(rejectedChange._id), { decision: 'REJECTED', reason: 'Please provide comparable listings' });
  const approvedChange = await rentChanges.createRequest(tenant, { stayId: String(stay._id), requestedRentPaise: 150000, reason: 'Requesting adjustment based on current market rates' });
  await rentChanges.decideRequest(owner, String(approvedChange._id), { decision: 'APPROVED' });
  assert.equal((await Stay.findById(stay._id)).agreedMonthlyRentPaise, 120000, 'the original agreed rent remains unchanged as historical data');
  assert.equal((await Stay.findById(stay._id)).rentTerms.at(-1).monthlyRentPaise, 150000);
  assert.equal((await RentChangeRequest.findById(approvedChange._id)).status, 'APPROVED');
  assert.deepEqual(await RentDue.find({ stayId: stay._id }).sort({ dueDate: 1 }).distinct('amountDuePaise'), oldAmounts, 'previously generated dues retain their original rent');
  await finance.generateRentDues(new Date(approvedChange.effectiveDate.valueOf() + 30 * 86400000));
  const changedCycle = await RentDue.findOne({ stayId: stay._id, dueDate: approvedChange.effectiveDate });
  assert.equal(changedCycle.amountDuePaise, 150000);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await deposits.createDepositTransaction(owner, String(stay._id), { type: 'RECEIVED', amountPaise: 150000, transactionDate: today, reason: 'Initial deposit part-payment' });
  await assert.rejects(() => deposits.createDepositTransaction(otherOwner, String(stay._id), { type: 'REFUND', amountPaise: 1000, transactionDate: today, reason: 'Incorrect owner attempt' }), { code: 'STAY_NOT_FOUND' });
  await deposits.createDepositTransaction(owner, String(stay._id), { type: 'REFUND', amountPaise: 25000, transactionDate: today, reason: 'Approved deposit refund' });
  await assert.rejects(() => deposits.createDepositTransaction(owner, String(stay._id), { type: 'DEDUCTION', amountPaise: 130000, transactionDate: today, reason: 'Exceeds deposit balance' }), { code: 'DEPOSIT_BALANCE_TOO_LOW' });
  const deposit = await deposits.getDeposit(tenant, String(stay._id));
  assert.equal(deposit.initialDepositPaise, 200000);
  assert.equal(deposit.receivedPaise, 150000);
  assert.equal(deposit.balancePaise, 125000);

  const paymentRace = await Promise.allSettled([
    finance.submitPayment(tenant, { rentDueId: String(changedCycle._id), amountPaise: 10000, paidOn: today, method: 'UPI' }),
    finance.submitPayment(tenant, { rentDueId: String(changedCycle._id), amountPaise: 20000, paidOn: today, method: 'BANK_TRANSFER' }),
  ]);
  const pending = paymentRace.filter((result) => result.status === 'fulfilled');
  assert.equal(pending.length, 1);
  const decisionRace = await Promise.allSettled([
    finance.decidePayment(owner, String(pending[0].value._id), { decision: 'APPROVED' }),
    finance.decidePayment(owner, String(pending[0].value._id), { decision: 'APPROVED' }),
  ]);
  assert.equal(decisionRace.filter((result) => result.status === 'fulfilled').length, 1);
  const settledAfterRace = await RentDue.findById(changedCycle._id);
  assert.equal(settledAfterRace.amountSettledPaise, pending[0].value.amountPaise);
});
