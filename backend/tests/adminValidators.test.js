import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRoomQuerySchema, adminUserQuerySchema, createOwnerSchema, financialCorrectionSchema, restoreParamsSchema, userRoleSchema } from '../src/validators/adminValidators.js';

test('owner onboarding requires strong credentials and an audited reason', () => {
  const valid = { name: 'Asha Owner', identifier: 'asha@example.com', temporaryPassword: 'TemporaryPass123', reason: 'Verified onboarding request' };
  assert.deepEqual(createOwnerSchema.parse(valid), { name: 'Asha Owner', email: 'asha@example.com', temporaryPassword: 'TemporaryPass123', reason: 'Verified onboarding request' });
  assert.deepEqual(createOwnerSchema.parse({ ...valid, identifier: '09876543210' }).phone, '+919876543210');
  assert.equal(createOwnerSchema.safeParse({ ...valid, identifier: '12345' }).success, false);
  assert.equal(createOwnerSchema.safeParse({ ...valid, temporaryPassword: 'short' }).success, false);
  assert.equal(createOwnerSchema.safeParse({ ...valid, role: 'ADMIN' }).success, false);
});

test('role changes accept only known roles and an optional note', () => {
  assert.deepEqual(userRoleSchema.parse({ role: 'OWNER' }), { role: 'OWNER', reason: '' });
  assert.equal(userRoleSchema.safeParse({ role: 'ROOT' }).success, false);
  assert.equal(userRoleSchema.safeParse({ role: 'ADMIN', self: true }).success, false);
});

test('admin user filters validate role, status, and pagination parameters', () => {
  const query = adminUserQuerySchema.parse({ page: '2', limit: '20', role: 'OWNER', isActive: 'true', isDeleted: 'false', search: 'Asha' });
  assert.equal(query.page, 2);
  assert.equal(query.isActive, true);
  assert.equal(query.isDeleted, false);
  assert.equal(adminUserQuerySchema.safeParse({ role: 'ROOT' }).success, false);
  assert.equal(adminUserQuerySchema.safeParse({ isDeleted: 'yes' }).success, false);
});

test('system-wide admin room filters support combined values and validate ranges', () => {
  const query = adminRoomQuerySchema.parse({ page: '2', limit: '24', hostelId: '507f1f77bcf86cd799439011', genderEligibility: 'MALE', sharingType: '2', minCapacity: '2', maxCapacity: '4', minRentPaise: '500000', maxRentPaise: '900000', minAvailableBeds: '1', availability: 'PARTIAL', search: 'room 2' });
  assert.equal(query.page, 2);
  assert.equal(query.sortBy, 'identifier_asc');
  assert.equal(query.availability, 'PARTIAL');
  assert.equal(adminRoomQuerySchema.safeParse({ minRentPaise: '900000', maxRentPaise: '100000' }).success, false);
  assert.equal(adminRoomQuerySchema.safeParse({ sortBy: 'random' }).success, false);
});

test('financial corrections require a value and reject unknown restoration types', () => {
  assert.equal(financialCorrectionSchema.safeParse({ reason: 'No correction value supplied' }).success, false);
  assert.equal(financialCorrectionSchema.safeParse({ moveInDate: '2026-02-30', reason: 'Correct date from signed agreement' }).success, false);
  assert.equal(financialCorrectionSchema.safeParse({ depositAdjustmentPaise: 0, reason: 'Adjustment must not be zero' }).success, false);
  assert.equal(restoreParamsSchema.safeParse({ entityType: 'ROOM', entityId: '507f1f77bcf86cd799439011' }).success, true);
  assert.equal(restoreParamsSchema.safeParse({ entityType: 'PAYMENT', entityId: '507f1f77bcf86cd799439011' }).success, false);
});
