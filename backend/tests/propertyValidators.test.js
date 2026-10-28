import test from 'node:test';
import assert from 'node:assert/strict';
import { assignHostelOwnerSchema, createHostelSchema, createRoomSchema, roomListQuerySchema, updateHostelSchema, updateRoomSchema } from '../src/validators/propertyValidators.js';

test('hostel creation defaults optional collections and accepts only a valid optional owner ID', () => {
  const values = { name: 'Maple Residency', address: '12 Park Street', city: 'Pune', accommodationPolicy: 'MIXED' };
  const parsed = createHostelSchema.parse(values);
  assert.deepEqual(parsed.facilities, []);
  assert.deepEqual(parsed.images, []);
  assert.equal(createHostelSchema.safeParse({ ...values, ownerId: 'attacker' }).success, false);
  assert.equal(createHostelSchema.safeParse({ ...values, ownerId: '507f1f77bcf86cd799439011' }).success, true);
  assert.equal(assignHostelOwnerSchema.safeParse({ ownerId: '507f1f77bcf86cd799439011' }).success, true);
  assert.equal(assignHostelOwnerSchema.safeParse({ ownerId: 'attacker' }).success, false);
  const formPayload = createHostelSchema.safeParse({ ...values, contactPhone: '', description: '', facilities: ['Wi-Fi', 'laundry'], images: [] });
  assert.equal(formPayload.success, true);
  assert.deepEqual(formPayload.data.facilities, ['Wi-Fi', 'laundry']);
  assert.equal(createHostelSchema.safeParse({ ...values, accommodationPolicy: 'FAMILY_ONLY' }).success, false);
});

test('room creation validates whole bed counts, capacity, eligibility, and integer paise', () => {
  const room = { identifier: '101', sharingType: 3, maxCapacity: 3, genderEligibility: 'FEMALE', defaultRentPaise: 750000 };
  assert.equal(createRoomSchema.safeParse(room).success, true);
  assert.equal(createRoomSchema.safeParse({ ...room, maxCapacity: 2 }).success, false);
  assert.equal(createRoomSchema.safeParse({ ...room, defaultRentPaise: 7500.25 }).success, false);
  assert.equal(createRoomSchema.safeParse({ ...room, ownerId: 'attacker' }).success, false);
  assert.equal(createRoomSchema.safeParse({ ...room, sharingType: 20, maxCapacity: 20 }).success, true);
  for (const invalid of [0, -1, 1.5, 21]) {
    assert.equal(createRoomSchema.safeParse({ ...room, sharingType: invalid, maxCapacity: Math.max(1, Math.ceil(invalid)) }).success, false);
    assert.equal(createRoomSchema.safeParse({ ...room, sharingType: 2, maxCapacity: invalid }).success, false);
  }
});

test('updates require an explicit allowed change and reject protected ownership fields', () => {
  assert.equal(updateHostelSchema.safeParse({}).success, false);
  assert.equal(updateHostelSchema.safeParse({ isActive: false }).success, true);
  assert.equal(updateHostelSchema.safeParse({ ownerId: 'attacker' }).success, false);
  assert.equal(updateRoomSchema.safeParse({ reason: 'only a reason' }).success, false);
  assert.equal(updateRoomSchema.safeParse({ maxCapacity: 4, reason: 'increase availability' }).success, true);
  assert.equal(updateRoomSchema.safeParse({ sharingType: 20, maxCapacity: 20 }).success, true);
  assert.equal(updateRoomSchema.safeParse({ maxCapacity: 21 }).success, false);
  assert.equal(updateRoomSchema.safeParse({ sharingType: 1.5 }).success, false);
});

test('room list filters validate combined criteria, ranges, sorting, and pagination', () => {
  const filters = roomListQuerySchema.parse({ page: '2', limit: '24', search: 'room 2', genderEligibility: 'FEMALE', sharingType: '2', minCapacity: '2', maxCapacity: '4', minRentPaise: '500000', maxRentPaise: '900000', minAvailableBeds: '1', availability: 'PARTIAL', sortBy: 'rent_asc', active: 'true' });
  assert.equal(filters.page, 2);
  assert.equal(filters.sharingType, 2);
  assert.equal(filters.availability, 'PARTIAL');
  assert.equal(roomListQuerySchema.parse({ sharingType: '20', minCapacity: '20' }).sharingType, 20);
  assert.equal(roomListQuerySchema.safeParse({ sharingType: '21' }).success, false);
  assert.equal(roomListQuerySchema.safeParse({ page: '0' }).success, false);
  assert.equal(roomListQuerySchema.safeParse({ genderEligibility: 'MIXED' }).success, false);
  assert.equal(roomListQuerySchema.safeParse({ minCapacity: '5', maxCapacity: '2' }).success, false);
  assert.equal(roomListQuerySchema.safeParse({ minRentPaise: '900000', maxRentPaise: '800000' }).success, false);
  assert.equal(roomListQuerySchema.safeParse({ availability: 'EMPTY' }).success, false);
});
