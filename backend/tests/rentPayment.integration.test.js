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
  await assert.rejects(() => tenants.createTenant(otherOwner, { name: 'Cross owner', phone: '9876543214', hostelId: String(hostel._id), roomId: String(room._id), moveInDate: today(), agreedMonthlyRentPaise: 120000, securityDepositPaise: 0 }), { code: 'HOSTEL_NOT_FOUND' });
  const periodStart = new Date(`${today()}T00:00:00+05:30`);
  const due = await RentDue.create({ tenantId: assigned.tenant._id, stayId: assigned.stay._id, hostelId: hostel._id, roomId: room._id, billingPeriod: today().slice(0, 7), periodStart, dueDate: periodStart, amountDuePaise: 150000 });
  await assert.rejects(() => finance.recordPayment(otherOwner, { rentDueId: String(due._id), amountPaise: 50000, paidOn: today(), method: 'CASH' }), { code: 'RENT_DUE_NOT_FOUND' });
  await finance.recordPayment(owner, { rentDueId: String(due._id), amountPaise: 50000, paidOn: today(), method: 'CASH' });
  assert.equal((await RentDue.findById(due._id)).amountSettledPaise, 50000);
  await deposits.createDepositTransaction(owner, String(assigned.stay._id), { type: 'RECEIVED', amountPaise: 200000, transactionDate: today(), reason: 'Initial deposit received' });
  await deposits.createDepositTransaction(owner, String(assigned.stay._id), { type: 'REFUND', amountPaise: 25000, transactionDate: today(), reason: 'Approved partial refund' });
  assert.equal((await deposits.getDeposit(owner, String(assigned.stay._id))).balancePaise, 175000);
  assert.equal(await DepositTransaction.countDocuments({ stayId: assigned.stay._id }), 2);
});
