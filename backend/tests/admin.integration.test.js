import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { AuditLog } from '../src/models/AuditLog.js';
import { DepositTransaction } from '../src/models/DepositTransaction.js';
import { Hostel } from '../src/models/Hostel.js';
import { Payment } from '../src/models/Payment.js';
import { RentDue } from '../src/models/RentDue.js';
import { Room } from '../src/models/Room.js';
import { RoomConfigurationHistory } from '../src/models/RoomConfigurationHistory.js';
import { Stay } from '../src/models/Stay.js';
import { TenantApplication } from '../src/models/TenantApplication.js';
import { User } from '../src/models/User.js';
import * as admin from '../src/services/adminService.js';
import * as property from '../src/services/propertyService.js';
import * as stays from '../src/services/stayService.js';

const uri = process.env.TEST_ADMIN_MONGODB_URI;

test('admin status changes, audited corrections, and allowlisted record restoration', { skip: !uri && 'Set TEST_ADMIN_MONGODB_URI to a MongoDB replica set URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_ADMIN_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([AuditLog.init(), DepositTransaction.init(), Hostel.init(), Payment.init(), RentDue.init(), Room.init(), RoomConfigurationHistory.init(), Stay.init(), TenantApplication.init(), User.init()]);
  const [administrator, owner, tenant] = await User.create([
    { name: 'System Admin', email: 'admin-system@example.com', passwordHash: 'test-hash', role: 'ADMIN' },
    { name: 'Admin Owner', email: 'admin-owner@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Admin Tenant', email: 'admin-tenant@example.com', passwordHash: 'test-hash', role: 'TENANT', gender: 'FEMALE' },
  ]);
  const onboardedOwner = await admin.createOwner(administrator, { name: 'New Owner', email: 'new-owner@example.com', temporaryPassword: 'TemporaryPass123', reason: 'Onboarded through support verification' }, 'req-create-owner');
  assert.equal(onboardedOwner.role, 'OWNER');
  assert.equal(onboardedOwner.toJSON().passwordHash, undefined);
  await assert.rejects(() => admin.createOwner(administrator, { name: 'Duplicate Owner', email: 'new-owner@example.com', temporaryPassword: 'TemporaryPass123', reason: 'Duplicate email check' }), { code: 'EMAIL_IN_USE' });
  const hostel = await property.createHostel(administrator, { name: 'Admin House', address: '1 West Lane', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id });
  const room = await property.createRoom(owner, String(hostel._id), { identifier: 'R1', sharingType: 1, maxCapacity: 1, genderEligibility: 'ANY', defaultRentPaise: 120000 });

  await property.softDeleteRoom(owner, String(room._id), 'Retired during admin restore test');
  await property.softDeleteHostel(owner, String(hostel._id), 'Retired during admin restore test');
  await admin.restoreRecord(administrator, 'HOSTEL', String(hostel._id), 'Restore parent property for operations', 'req-restore-hostel');
  await admin.restoreRecord(administrator, 'ROOM', String(room._id), 'Restore room after parent property', 'req-restore-room');
  assert.equal((await Room.findById(room._id)).isDeleted, false);
  assert.equal(await RoomConfigurationHistory.countDocuments({ roomId: room._id }), 3);
  await property.updateHostel(owner, String(hostel._id), { isActive: true });
  await property.updateRoom(owner, String(room._id), { isActive: true, reason: 'Reactivate restored test room' });

  const application = await stays.createApplication(tenant, String(hostel._id));
  const stay = await stays.approveAndAssign(owner, String(application._id), { roomId: String(room._id), moveInDate: '2024-01-31', agreedMonthlyRentPaise: 120000, securityDepositPaise: 0 });
  const correction = await admin.correctStayFinancials(administrator, String(stay._id), { agreedMonthlyRentPaise: 130000, depositAdjustmentPaise: 50000, reason: 'Corrected agreed amount and reconciled deposit receipt' }, 'req-financial-correction');
  assert.equal(correction.before.agreedMonthlyRentPaise, 120000);
  assert.equal(correction.after.nextMonthlyRentPaise, 130000);
  assert.equal(correction.after.depositBalancePaise, 50000);
  const beforeMoveIn = await Stay.findById(stay._id).lean();
  const moveInCorrection = await admin.correctStayFinancials(administrator, String(stay._id), { moveInDate: '2024-02-01', reason: 'Original document had an incorrect move-in date' }, 'req-move-in-correction');
  assert.equal(moveInCorrection.before.moveInDate.valueOf(), beforeMoveIn.moveInDate.valueOf());
  assert.equal((await Stay.findById(stay._id)).moveInDate.toISOString(), '2024-01-31T18:30:00.000Z');
  assert.equal((await Stay.findById(stay._id)).rentCycleAnchorDay, 1);

  await admin.setUserStatus(administrator, String(tenant._id), { isActive: false, reason: 'Account review requested by support' }, 'req-account-status');
  assert.equal((await User.findById(tenant._id)).isActive, false);
  await assert.rejects(() => admin.setUserStatus(administrator, String(administrator._id), { isActive: false, reason: 'Self deactivation attempt' }), { code: 'SELF_DEACTIVATION' });
  await User.updateOne({ _id: tenant._id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: administrator._id, deletionReason: 'Administrative test soft delete' } });
  const restoredUser = await admin.restoreRecord(administrator, 'USER', String(tenant._id), 'Restore account after review', 'req-restore-user');
  assert.equal(restoredUser.isDeleted, false);
  assert.equal(restoredUser.passwordHash, undefined);
  await assert.rejects(() => admin.restoreRecord(administrator, 'PAYMENT', String(stay._id), 'Not allowed'), { code: 'RESTORE_TYPE_NOT_ALLOWED' });

  const logs = await admin.listAuditLogs({ page: 1, limit: 100 });
  assert.ok(logs.items.some((log) => log.action === 'STAY_FINANCIAL_TERMS_CORRECTED' && log.requestId === 'req-financial-correction'));
  assert.ok(logs.items.some((log) => log.action === 'ROOM_RESTORED'));
  assert.equal(logs.items.length, 13);
  const users = await admin.listUsers({ page: 1, limit: 100 });
  assert.ok(users.items.every((userItem) => userItem.passwordHash === undefined));
  assert.equal((await admin.getSystemSummary()).activeStays, 1);
});
