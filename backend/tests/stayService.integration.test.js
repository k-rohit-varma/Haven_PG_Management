import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Hostel } from '../src/models/Hostel.js';
import { DepositTransaction } from '../src/models/DepositTransaction.js';
import { Payment } from '../src/models/Payment.js';
import { RentDue } from '../src/models/RentDue.js';
import { Room } from '../src/models/Room.js';
import { Stay } from '../src/models/Stay.js';
import { User } from '../src/models/User.js';
import * as property from '../src/services/propertyService.js';
import * as finance from '../src/services/rentPaymentService.js';
import * as tenants from '../src/services/tenantService.js';
import * as stays from '../src/services/stayService.js';

const uri = process.env.TEST_STAY_MONGODB_URI;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('tenant creation enforces room eligibility, active occupancy, ownership, and releases capacity after a historical stay', { skip: !uri && 'Set TEST_STAY_MONGODB_URI to a MongoDB replica set URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_STAY_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User.init(), Hostel.init(), Room.init(), Stay.init(), RentDue.init(), Payment.init(), DepositTransaction.init()]);
  const [admin, owner, otherOwner] = await User.create([
    { name: 'Stay Admin', email: 'stay-admin-new@example.com', passwordHash: 'test-hash', role: 'ADMIN' },
    { name: 'Stay Owner', email: 'stay-owner-new@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Other Owner', email: 'stay-other-owner-new@example.com', passwordHash: 'test-hash', role: 'OWNER' },
  ]);
  const hostel = await property.createHostel(admin, { name: 'Stay House', address: '1 South Road', city: 'Pune', accommodationPolicy: 'FEMALE_ONLY', ownerId: owner._id });
  const room = await property.createRoom(owner, String(hostel._id), { identifier: 'F1', sharingType: 1, maxCapacity: 1, genderEligibility: 'FEMALE', defaultRentPaise: 100000 });
  const base = { hostelId: String(hostel._id), roomId: String(room._id), moveInDate: today(), agreedMonthlyRentPaise: 100000, securityDepositPaise: 0 };
  const unknownRoom = new mongoose.Types.ObjectId();
  await assert.rejects(() => tenants.createTenant(owner, { ...base, roomId: String(unknownRoom), name: 'Missing Room Tenant', phone: '9876543219', gender: 'FEMALE' }), { code: 'ROOM_NOT_FOUND' });
  await assert.rejects(() => tenants.createTenant(owner, { ...base, name: 'Male Tenant', phone: '9876543215', gender: 'MALE' }), { code: 'HOSTEL_POLICY_MISMATCH' });
  const assignment = await tenants.createTenant(owner, { ...base, name: 'Eligible Tenant', phone: '9876543216', gender: 'FEMALE' });
  const oldDue = await RentDue.create({ tenantId: assignment.tenant._id, stayId: assignment.stay._id, hostelId: hostel._id, roomId: room._id, billingPeriod: today().slice(0, 7), periodStart: new Date(`${today()}T00:00:00+05:30`), dueDate: new Date(`${today()}T00:00:00+05:30`), amountDuePaise: 100000, amountSettledPaise: 50000, status: 'PARTIALLY_PAID' });
  const oldPayment = await Payment.create({ tenantId: assignment.tenant._id, stayId: assignment.stay._id, rentDueId: oldDue._id, hostelId: hostel._id, amountPaise: 50000, paidOn: new Date(`${today()}T00:00:00+05:30`), method: 'CASH', status: 'APPROVED', decisionMakerId: owner._id, decidedAt: new Date() });
  const oldDeposit = await DepositTransaction.create({ tenantId: assignment.tenant._id, stayId: assignment.stay._id, hostelId: hostel._id, type: 'RECEIVED', amountPaise: 250000, transactionDate: new Date(`${today()}T00:00:00+05:30`), reason: 'Old stay deposit', actorId: owner._id });
  await assert.rejects(() => tenants.createTenant(owner, { ...base, name: 'Duplicate Tenant', phone: '9876543216', gender: 'FEMALE' }), { code: 'TENANT_ALREADY_ASSIGNED' });
  assert.equal(await User.countDocuments({ phone: '+919876543216' }), 1);
  await assert.rejects(() => tenants.createTenant(owner, { ...base, name: 'Second Tenant', phone: '9876543217', gender: 'FEMALE' }), { code: 'ROOM_FULL' });
  await assert.rejects(() => tenants.createTenant(otherOwner, { ...base, name: 'Cross Owner Tenant', phone: '9876543218', gender: 'FEMALE' }), { code: 'HOSTEL_NOT_FOUND' });
  await stays.markStayLeft(owner, String(assignment.stay._id), { leavingDate: today(), reason: 'Tenant moved out' });
  assert.equal((await stays.listOwnerStays(owner, { page: 1, limit: 20 })).items[0].status, 'LEFT');
  const previousStaySnapshot = await Stay.findById(assignment.stay._id).lean();
  const rejoinRoom = await property.createRoom(owner, String(hostel._id), { identifier: 'F2', sharingType: 1, maxCapacity: 1, genderEligibility: 'FEMALE', defaultRentPaise: 90000 });
  const originalRejoinStayCreate = Stay.create;
  Stay.create = async () => { throw new Error('Injected rejoin stay write failure'); };
  try {
    await assert.rejects(() => tenants.rejoinTenant(owner, String(assignment.tenant._id), { hostelId: String(hostel._id), roomId: String(rejoinRoom._id), moveInDate: today(), agreedMonthlyRentPaise: 125000, securityDepositPaise: 300000 }), /Injected rejoin stay write failure/);
  } finally {
    Stay.create = originalRejoinStayCreate;
  }
  assert.equal(await Stay.countDocuments({ tenantId: assignment.tenant._id, status: 'ACTIVE' }), 0, 'failed rejoin leaves no partial active stay');
  const rejoined = await tenants.rejoinTenant(owner, String(assignment.tenant._id), { hostelId: String(hostel._id), roomId: String(rejoinRoom._id), moveInDate: today(), agreedMonthlyRentPaise: 125000, securityDepositPaise: 300000 }, 'owner-rejoin-test');
  assert.equal(String(rejoined.tenant._id), String(assignment.tenant._id), 'rejoin reuses the existing tenant profile');
  assert.notEqual(String(rejoined.stay._id), String(assignment.stay._id));
  assert.equal(rejoined.stay.agreedMonthlyRentPaise, 125000, 'new agreed rent is independent of room default rent');
  assert.equal(rejoined.stay.securityDepositPaise, 300000, 'new stay records its own deposit requirement');
  assert.equal((await Stay.findById(assignment.stay._id)).leavingDate.getTime(), previousStaySnapshot.leavingDate.getTime());
  assert.equal((await Stay.findById(assignment.stay._id)).agreedMonthlyRentPaise, previousStaySnapshot.agreedMonthlyRentPaise);
  assert.equal((await RentDue.findById(oldDue._id)).amountSettledPaise, 50000);
  assert.equal(String((await Payment.findById(oldPayment._id)).stayId), String(assignment.stay._id));
  assert.equal(String((await DepositTransaction.findById(oldDeposit._id)).stayId), String(assignment.stay._id));
  const simulatedFuture = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
  const newStayReconciliation = await finance.generateRentDues(simulatedFuture);
  assert.ok(newStayReconciliation.created > 0, 'rent reconciliation generates periods for the new stay');
  assert.equal((await RentDue.findById(oldDue._id)).amountSettledPaise, 50000, 'reconciliation preserves old stay allocation');
  assert.equal(String((await Payment.findById(oldPayment._id)).stayId), String(assignment.stay._id));
  assert.equal((await finance.generateRentDues(simulatedFuture)).created, 0, 'rent reconciliation remains idempotent after rejoining');
  assert.equal(await User.countDocuments({ _id: assignment.tenant._id }), 1);
  await assert.rejects(() => tenants.rejoinTenant(owner, String(assignment.tenant._id), { hostelId: String(hostel._id), roomId: String(room._id), moveInDate: today(), agreedMonthlyRentPaise: 125000, securityDepositPaise: 0 }), { code: 'TENANT_ALREADY_ASSIGNED' });
  await assert.rejects(() => tenants.rejoinTenant(otherOwner, String(assignment.tenant._id), { hostelId: String(hostel._id), roomId: String(rejoinRoom._id), moveInDate: today(), agreedMonthlyRentPaise: 125000, securityDepositPaise: 0 }), { code: 'TENANT_NOT_FOUND' });
  const replacement = await tenants.createTenant(owner, { ...base, name: 'Replacement Tenant', phone: '9876543220', gender: 'FEMALE' });
  assert.equal(await Stay.countDocuments({ roomId: room._id, status: 'ACTIVE' }), 1);
  assert.equal((await Stay.findById(assignment.stay._id)).status, 'LEFT');
  assert.equal((await User.findById(assignment.tenant._id)).isDeleted, false);
  assert.equal((await Stay.findById(replacement.stay._id)).status, 'ACTIVE');

  const mixedHostel = await property.createHostel(admin, { name: 'Mixed Stay House', address: '2 North Road', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id });
  const maleRoom = await property.createRoom(owner, String(mixedHostel._id), { identifier: 'M1', sharingType: 1, maxCapacity: 5, genderEligibility: 'MALE', defaultRentPaise: 100000 });
  const mixedBase = { ...base, hostelId: String(mixedHostel._id), roomId: String(maleRoom._id) };
  const formerMaleTenant = await tenants.createTenant(owner, { ...mixedBase, name: 'Former Male Tenant', phone: '9876543231', gender: 'MALE' });
  await stays.markStayLeft(owner, String(formerMaleTenant.stay._id), { leavingDate: today(), reason: 'Temporary move' });
  const femaleRoom = await property.createRoom(owner, String(mixedHostel._id), { identifier: 'F2', sharingType: 1, maxCapacity: 1, genderEligibility: 'FEMALE', defaultRentPaise: 100000 });
  const singleMaleRoom = await property.createRoom(owner, String(mixedHostel._id), { identifier: 'M2', sharingType: 1, maxCapacity: 1, genderEligibility: 'MALE', defaultRentPaise: 100000 });
  const roomTerms = { hostelId: String(mixedHostel._id), moveInDate: today(), agreedMonthlyRentPaise: 110000, securityDepositPaise: 50000 };
  await assert.rejects(() => tenants.rejoinTenant(owner, String(formerMaleTenant.tenant._id), { ...roomTerms, roomId: String(femaleRoom._id) }), { code: 'ROOM_ELIGIBILITY_MISMATCH' });
  await tenants.createTenant(owner, { ...mixedBase, roomId: String(singleMaleRoom._id), name: 'Room Occupant', phone: '9876543232', gender: 'MALE' });
  await assert.rejects(() => tenants.rejoinTenant(owner, String(formerMaleTenant.tenant._id), { ...roomTerms, roomId: String(singleMaleRoom._id) }), { code: 'ROOM_FULL' });
  const adminRoom = await property.createRoom(owner, String(mixedHostel._id), { identifier: 'M3', sharingType: 1, maxCapacity: 1, genderEligibility: 'MALE', defaultRentPaise: 100000 });
  const adminRejoined = await tenants.rejoinTenant(admin, String(formerMaleTenant.tenant._id), { ...roomTerms, roomId: String(adminRoom._id) }, 'admin-rejoin-test');
  assert.equal(String(adminRejoined.tenant._id), String(formerMaleTenant.tenant._id));
  assert.equal(adminRejoined.stay.status, 'ACTIVE');
  const originalStayCreate = Stay.create;
  Stay.create = async () => { throw new Error('Injected stay write failure'); };
  try {
    await assert.rejects(() => tenants.createTenant(owner, { ...mixedBase, name: 'Rolled Back Tenant', phone: '9876543230', gender: 'MALE' }), /Injected stay write failure/);
  } finally {
    Stay.create = originalStayCreate;
  }
  assert.equal(await User.exists({ phone: '+919876543230' }), null);
  assert.equal(await Stay.countDocuments({ roomId: maleRoom._id, status: 'ACTIVE' }), 0);
  await assert.rejects(() => tenants.createTenant(owner, { ...mixedBase, name: 'Unspecified Tenant', phone: '9876543221', gender: 'PREFER_NOT_TO_SAY' }), { code: 'ROOM_ELIGIBILITY_MISMATCH' });
  assert.equal(await User.exists({ phone: '+919876543221' }), null);
  assert.equal(await Stay.countDocuments({ roomId: maleRoom._id, status: 'ACTIVE' }), 0);
  const matchingAssignment = await tenants.createTenant(owner, { ...mixedBase, name: 'Matching Tenant', phone: '9876543222', gender: 'MALE' });
  await assert.rejects(() => Stay.create({
    tenantId: matchingAssignment.tenant._id, hostelId: mixedHostel._id, roomId: maleRoom._id,
    moveInDate: new Date(`${today()}T00:00:00.000Z`), agreedMonthlyRentPaise: 100000,
    rentTerms: [{ monthlyRentPaise: 100000, effectiveFrom: new Date(`${today()}T00:00:00.000Z`), actorId: owner._id, reason: 'Duplicate active stay test' }],
    securityDepositPaise: 0, rentCycleAnchorDay: Number(today().slice(-2)), status: 'ACTIVE', financialTermsLocked: true, termsConfirmedAt: new Date(),
    events: [{ fromStatus: null, toStatus: 'ACTIVE', actorId: owner._id, at: new Date() }],
  }), { code: 11000 });
  const secondOccupant = await tenants.createTenant(owner, { ...mixedBase, name: 'Second Occupant', phone: '9876543223', gender: 'MALE' });
  const thirdOccupant = await tenants.createTenant(owner, { ...mixedBase, name: 'Third Occupant', phone: '9876543224', gender: 'MALE' });
  assert.equal((await property.listRooms(owner, String(mixedHostel._id), { page: 1, limit: 10, active: 'true' })).items.find((item) => String(item._id) === String(maleRoom._id)).availableBeds, 2);
  const fourthOccupant = await tenants.createTenant(owner, { ...mixedBase, name: 'Fourth Occupant', phone: '9876543225', gender: 'MALE' });
  assert.equal((await property.listRooms(owner, String(mixedHostel._id), { page: 1, limit: 10, active: 'true' })).items.find((item) => String(item._id) === String(maleRoom._id)).availableBeds, 1);
  const fifthOccupant = await tenants.createTenant(owner, { ...mixedBase, name: 'Fifth Occupant', phone: '9876543226', gender: 'MALE' });
  await assert.rejects(() => tenants.createTenant(owner, { ...mixedBase, name: 'Over Capacity', phone: '9876543227', gender: 'MALE' }), { code: 'ROOM_FULL' });
  assert.equal(await Stay.countDocuments({ roomId: maleRoom._id, status: 'ACTIVE' }), 5);
  assert.equal((await User.findById(matchingAssignment.tenant._id)).gender, 'MALE');
  assert.equal((await User.findById(secondOccupant.tenant._id)).gender, 'MALE');
  assert.equal((await User.findById(thirdOccupant.tenant._id)).gender, 'MALE');
  assert.equal((await User.findById(fourthOccupant.tenant._id)).gender, 'MALE');
  assert.equal((await User.findById(fifthOccupant.tenant._id)).gender, 'MALE');

  const singleRoom = await property.createRoom(owner, String(mixedHostel._id), { identifier: 'S1', sharingType: 1, maxCapacity: 1, genderEligibility: 'ANY', defaultRentPaise: 100000 });
  const singleBase = { ...mixedBase, roomId: String(singleRoom._id) };
  const concurrent = await Promise.allSettled([
    tenants.createTenant(owner, { ...singleBase, name: 'Concurrent One', phone: '9876543228', gender: 'FEMALE' }),
    tenants.createTenant(owner, { ...singleBase, name: 'Concurrent Two', phone: '9876543229', gender: 'FEMALE' }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  const rejectedAssignment = concurrent.find((result) => result.status === 'rejected');
  assert.ok(['ROOM_FULL', 'ROOM_CHANGED'].includes(rejectedAssignment.reason.code));
  assert.equal(await Stay.countDocuments({ roomId: singleRoom._id, status: 'ACTIVE' }), 1);
});
