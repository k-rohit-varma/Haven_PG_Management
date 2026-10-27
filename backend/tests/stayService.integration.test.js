import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Stay } from '../src/models/Stay.js';
import { TenantApplication } from '../src/models/TenantApplication.js';
import { Hostel } from '../src/models/Hostel.js';
import { Room } from '../src/models/Room.js';
import { RentDue } from '../src/models/RentDue.js';
import { RoomChangeRequest } from '../src/models/RoomChangeRequest.js';
import * as propertyService from '../src/services/propertyService.js';
import * as stayService from '../src/services/stayService.js';
import * as rentPaymentService from '../src/services/rentPaymentService.js';
import * as roomChangeService from '../src/services/roomChangeService.js';

const uri = process.env.TEST_STAY_MONGODB_URI;
const pagination = { page: 1, limit: 20 };

test('application decisions create immutable new stays and serialize room capacity', { skip: !uri && 'Set TEST_STAY_MONGODB_URI to a MongoDB replica set URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_STAY_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User.init(), Hostel.init(), Room.init(), Stay.init(), RentDue.init(), TenantApplication.init(), RoomChangeRequest.init()]);

  const [admin, owner, otherOwner, tenantA, tenantB, tenantC, tenantD] = await User.create([
    { name: 'System Admin', email: 'stay-system-admin@example.com', passwordHash: 'test-hash', role: 'ADMIN' },
    { name: 'Owner One', email: 'stay-owner-one@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Owner Two', email: 'stay-owner-two@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Tenant A', email: 'stay-tenant-a@example.com', passwordHash: 'test-hash', role: 'TENANT', gender: 'FEMALE' },
    { name: 'Tenant B', email: 'stay-tenant-b@example.com', passwordHash: 'test-hash', role: 'TENANT', gender: 'FEMALE' },
    { name: 'Tenant C', email: 'stay-tenant-c@example.com', passwordHash: 'test-hash', role: 'TENANT', gender: 'MALE' },
    { name: 'Tenant D', email: 'stay-tenant-d@example.com', passwordHash: 'test-hash', role: 'TENANT', gender: 'FEMALE' },
  ]);
  const hostel = await propertyService.createHostel(admin, { name: 'Stay House', address: '4 North Road', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id });
  const secondHostel = await propertyService.createHostel(admin, { name: 'Second Stay House', address: '5 South Road', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: otherOwner._id });
  const femaleRoom = await propertyService.createRoom(owner, String(hostel._id), { identifier: 'F1', sharingType: 2, maxCapacity: 2, genderEligibility: 'FEMALE', defaultRentPaise: 800000 });
  const maleRoom = await propertyService.createRoom(owner, String(hostel._id), { identifier: 'M1', sharingType: 1, maxCapacity: 1, genderEligibility: 'MALE', defaultRentPaise: 900000 });
  const alternateFemaleRoom = await propertyService.createRoom(owner, String(hostel._id), { identifier: 'F2', sharingType: 1, maxCapacity: 2, genderEligibility: 'FEMALE', defaultRentPaise: 800000 });
  const secondHostelRoom = await propertyService.createRoom(otherOwner, String(secondHostel._id), { identifier: '201', sharingType: 1, maxCapacity: 1, genderEligibility: 'MALE', defaultRentPaise: 700000 });

  const application = await stayService.createApplication(tenantA, String(hostel._id));
  await assert.rejects(() => stayService.createApplication(tenantA, String(hostel._id)), { code: 'PENDING_APPLICATION_EXISTS' });
  const secondApplication = await stayService.createApplication(tenantA, String(secondHostel._id));
  assert.equal((await stayService.listOwnerApplications(owner, pagination)).items.length, 1);
  assert.equal((await stayService.listOwnerApplications(otherOwner, pagination)).items[0]._id.toString(), secondApplication._id.toString());
  await stayService.cancelApplication(tenantA, String(secondApplication._id));
  const noStayApplication = await stayService.createApplication(tenantC, String(secondHostel._id));
  await stayService.approveApplication(otherOwner, String(noStayApplication._id));
  assert.equal(await Stay.exists({ tenantId: tenantC._id, status: 'ACTIVE' }), null);
  const tenantCStay = await stayService.approveAndAssign(otherOwner, String(noStayApplication._id), { roomId: String(secondHostelRoom._id), moveInDate: '2024-08-31', agreedMonthlyRentPaise: 700000, securityDepositPaise: 0 });
  assert.equal(String(tenantCStay.tenantId), String(tenantC._id));
  const ownerApplications = await stayService.listOwnerApplications(owner, pagination);
  assert.equal(ownerApplications.items.length, 1);
  await assert.rejects(() => stayService.rejectApplication(otherOwner, String(application._id), 'Not our resident'), { code: 'APPLICATION_NOT_FOUND' });
  await assert.rejects(() => stayService.approveAndAssign(owner, String(application._id), { roomId: String(maleRoom._id), moveInDate: '2024-08-31', agreedMonthlyRentPaise: 900000, securityDepositPaise: 900000 }), { code: 'TENANT_NOT_ELIGIBLE' });

  const firstStay = await stayService.approveAndAssign(owner, String(application._id), { roomId: String(femaleRoom._id), moveInDate: '2024-08-31', agreedMonthlyRentPaise: 850000, securityDepositPaise: 1000000 });
  assert.equal(firstStay.rentCycleAnchorDay, 31);
  assert.equal(firstStay.financialTermsLocked, true);
  assert.equal((await TenantApplication.findById(application._id)).status, 'APPROVED');
  const applicationD = await stayService.createApplication(tenantD, String(hostel._id));
  const tenantDStay = await stayService.approveAndAssign(owner, String(applicationD._id), { roomId: String(femaleRoom._id), moveInDate: '2024-08-31', agreedMonthlyRentPaise: 775000, securityDepositPaise: 500000 });
  assert.equal(firstStay.agreedMonthlyRentPaise, 850000);
  assert.equal(tenantDStay.agreedMonthlyRentPaise, 775000);
  await rentPaymentService.generateRentDues(new Date('2024-10-01T12:00:00Z'));
  const firstStayDue = await RentDue.findOne({ stayId: firstStay._id, billingPeriod: '2024-09' });
  const secondStayDue = await RentDue.findOne({ stayId: tenantDStay._id, billingPeriod: '2024-09' });
  assert.equal(firstStayDue.amountDuePaise, 850000);
  assert.equal(secondStayDue.amountDuePaise, 775000);
  assert.equal(String(firstStayDue.stayId), String(firstStay._id));
  assert.equal(String(secondStayDue.stayId), String(tenantDStay._id));
  await propertyService.updateRoom(owner, String(femaleRoom._id), { defaultRentPaise: 700000, reason: 'Future pricing update' });
  assert.equal((await Stay.findById(firstStay._id)).agreedMonthlyRentPaise, 850000);
  assert.equal((await Stay.findById(tenantDStay._id)).agreedMonthlyRentPaise, 775000);
  assert.equal((await RentDue.findById(firstStayDue._id)).amountDuePaise, 850000);
  assert.equal((await RentDue.findById(secondStayDue._id)).amountDuePaise, 775000);
  const roomChange = await roomChangeService.createRequest(tenantD, { stayId: String(tenantDStay._id), requestedRoomId: String(alternateFemaleRoom._id), reason: 'Closer to the common area' });
  await assert.rejects(() => roomChangeService.createRequest(tenantD, { stayId: String(tenantDStay._id), requestedRoomId: String(femaleRoom._id), reason: 'Second pending request' }), { code: 'PENDING_ROOM_CHANGE_EXISTS' });
  await assert.rejects(() => roomChangeService.decideRequest(otherOwner, String(roomChange._id), { decision: 'APPROVED' }), { code: 'ROOM_CHANGE_NOT_FOUND' });
  await roomChangeService.decideRequest(owner, String(roomChange._id), { decision: 'APPROVED' });
  const transferredStay = await Stay.findById(tenantDStay._id);
  assert.equal(String(transferredStay.roomId), String(alternateFemaleRoom._id));
  assert.equal(transferredStay.roomTransfers.length, 1);
  assert.equal((await RentDue.findById(secondStayDue._id)).amountDuePaise, 775000);
  await Stay.updateOne({ _id: firstStay._id }, { $set: { moveInDate: new Date('2025-01-01T00:00:00Z') } });
  assert.equal((await Stay.findById(firstStay._id)).moveInDate.valueOf(), firstStay.moveInDate.valueOf());
  await assert.rejects(() => stayService.createApplication(tenantA, String(hostel._id)), { code: 'ACTIVE_STAY_EXISTS' });
  await assert.rejects(() => stayService.getStay(otherOwner, String(firstStay._id)), { code: 'STAY_NOT_FOUND' });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const closed = await stayService.markStayLeft(owner, String(firstStay._id), { leavingDate: today, reason: 'Handover complete' });
  assert.equal(closed.status, 'LEFT');
  assert.equal(closed.leavingDate.toISOString().slice(0, 10) <= today, true);
  assert.equal((await propertyService.listRooms(tenantA, String(hostel._id), pagination)).items.find((room) => String(room._id) === String(femaleRoom._id)).availableBeds, 1);

  const returningApplication = await stayService.createApplication(tenantA, String(hostel._id));
  const returningStay = await stayService.approveAndAssign(owner, String(returningApplication._id), { roomId: String(femaleRoom._id), moveInDate: '2026-10-26', agreedMonthlyRentPaise: 870000, securityDepositPaise: 500000 });
  assert.notEqual(String(returningStay._id), String(firstStay._id));
  assert.equal((await stayService.listMyStays(tenantA, pagination)).items.length, 2);

  const capacityOneRoom = await propertyService.createRoom(owner, String(hostel._id), { identifier: 'F2', sharingType: 1, maxCapacity: 1, genderEligibility: 'ANY', defaultRentPaise: 810000 });
  const appB = await stayService.createApplication(tenantB, String(hostel._id));
  await assert.rejects(() => stayService.approveAndAssign(owner, String(appB._id), { roomId: String(femaleRoom._id), moveInDate: '2026-10-26', agreedMonthlyRentPaise: 700000, securityDepositPaise: 0 }), { code: 'ROOM_FULL' });
  const cancelledAttempt = await stayService.createApplication(tenantC, String(hostel._id));
  assert.equal((await stayService.cancelApplication(tenantC, String(cancelledAttempt._id))).status, 'CANCELLED');
  const rejectedAttempt = await stayService.createApplication(tenantC, String(hostel._id));
  assert.equal((await stayService.rejectApplication(owner, String(rejectedAttempt._id), 'Please choose an available move-in window.')).status, 'REJECTED');
  const appC = await stayService.createApplication(tenantC, String(hostel._id));
  const assignments = await Promise.allSettled([
    stayService.approveAndAssign(owner, String(appB._id), { roomId: String(capacityOneRoom._id), moveInDate: '2026-10-26', agreedMonthlyRentPaise: 810000, securityDepositPaise: 0 }),
    stayService.approveAndAssign(owner, String(appC._id), { roomId: String(capacityOneRoom._id), moveInDate: '2026-10-26', agreedMonthlyRentPaise: 810000, securityDepositPaise: 0 }),
  ]);
  assert.equal(assignments.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await Stay.countDocuments({ roomId: capacityOneRoom._id, status: 'ACTIVE' }), 1);
  assert.equal((await stayService.listOwnerStays(otherOwner, pagination)).items.length, 0);
});
