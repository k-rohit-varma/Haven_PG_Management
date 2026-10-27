import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Hostel } from '../src/models/Hostel.js';
import { Room } from '../src/models/Room.js';
import { RoomConfigurationHistory } from '../src/models/RoomConfigurationHistory.js';
import * as propertyService from '../src/services/propertyService.js';

const uri = process.env.TEST_MONGODB_URI;

test('hostel and room operations enforce ownership, inventory policy, and history', { skip: !uri && 'Set TEST_MONGODB_URI to a MongoDB replica set URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User.init(), Hostel.init(), Room.init(), RoomConfigurationHistory.init()]);

  const accounts = await User.create([
    { name: 'System Admin', email: 'admin-property@example.com', passwordHash: 'test-hash', role: 'ADMIN' },
    { name: 'Owner One', email: 'owner-one@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    { name: 'Owner Two', email: 'owner-two@example.com', passwordHash: 'test-hash', role: 'OWNER' },
    ...Array.from({ length: 4 }, (_, index) => ({ name: `Tenant ${index + 1}`, email: `tenant-${index + 1}@example.com`, passwordHash: 'test-hash', role: 'TENANT', gender: 'FEMALE' })),
  ]);
  const [admin, owner, otherOwner, ...tenants] = accounts;
  await assert.rejects(() => propertyService.createHostel(tenants[0], { name: 'Unauthorized House', address: '12 Park Street', city: 'Pune', accommodationPolicy: 'MIXED' }), { code: 'FORBIDDEN' });
  await assert.rejects(() => propertyService.createHostel(owner, { name: 'Unauthorized Owner House', address: '12 Park Street', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id }), { code: 'FORBIDDEN' });
  const hostel = await propertyService.createHostel(admin, { name: 'Maple House', address: '12 Park Street', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: owner._id });
  const emptyHostel = await propertyService.createHostel(admin, { name: 'Pine House', address: '14 Park Street', city: 'Pune', accommodationPolicy: 'MIXED', ownerId: otherOwner._id });
  assert.equal(await Hostel.countDocuments({ _id: hostel._id, ownerId: owner._id }), 1);
  const room = await propertyService.createRoom(owner, String(hostel._id), { identifier: '101', sharingType: 2, maxCapacity: 4, genderEligibility: 'ANY', defaultRentPaise: 850000 });
  await propertyService.createRoom(owner, String(hostel._id), { identifier: '2', sharingType: 1, maxCapacity: 2, genderEligibility: 'MALE', defaultRentPaise: 600000 });

  const combinedRooms = await propertyService.listRooms(owner, String(hostel._id), { page: 1, limit: 10, genderEligibility: 'ANY', minCapacity: 4, minRentPaise: 800000, minAvailableBeds: 4, availability: 'AVAILABLE', sortBy: 'identifier_asc' });
  assert.equal(combinedRooms.pagination.total, 1);
  assert.equal(String(combinedRooms.items[0]._id), String(room._id));
  const naturallySortedRooms = await propertyService.listRooms(owner, String(hostel._id), { page: 1, limit: 1, sortBy: 'identifier_asc' });
  assert.equal(naturallySortedRooms.items[0].identifier, '2');
  assert.equal(naturallySortedRooms.pagination.pages, 2);
  await assert.rejects(() => propertyService.listRooms(otherOwner, String(hostel._id), { page: 1, limit: 10, sortBy: 'identifier_asc' }), { code: 'HOSTEL_NOT_FOUND' });

  await assert.rejects(() => propertyService.getHostel(otherOwner, String(hostel._id)), { code: 'HOSTEL_NOT_FOUND' });
  const ownerInventory = await propertyService.listHostels(owner, { page: 1, limit: 20 });
  assert.equal(ownerInventory.items.length, 1);
  const publicInventory = await propertyService.listHostels(tenants[0], { page: 1, limit: 20 });
  assert.equal(publicInventory.items.length, 2);
  assert.equal(publicInventory.items.find((item) => String(item._id) === String(hostel._id)).availableBeds, 4);
  assert.equal(publicInventory.items.find((item) => String(item._id) === String(emptyHostel._id)).availableBeds, 0);
  assert.equal('ownerId' in publicInventory.items[0], false);
  const publicDetail = await propertyService.getHostel(tenants[0], String(hostel._id));
  assert.equal('ownerId' in publicDetail.hostel, false);
  assert.equal(publicDetail.roomSummary.available, 6);
  assert.equal((await propertyService.listRooms(tenants[0], String(hostel._id), { page: 1, limit: 20, sortBy: 'identifier_asc' })).items[0].availableBeds, 4);
  assert.equal((await propertyService.validateAssignmentEligibility(String(hostel._id), String(room._id), String(tenants[0]._id))).currentOccupancy, 0);

  await assert.rejects(() => propertyService.updateHostel(owner, String(hostel._id), { accommodationPolicy: 'MALE_ONLY' }), { code: 'ROOM_POLICY_CONFLICT' });
  await mongoose.connection.collection('stays').insertMany(tenants.slice(0, 4).map((tenant) => ({ tenantId: tenant._id, hostelId: hostel._id, roomId: room._id, status: 'ACTIVE' })));
  const ownerRoomDetails = await propertyService.getRoomDetails(owner, String(room._id));
  assert.equal(ownerRoomDetails.occupants.length, 4);
  assert.equal(typeof ownerRoomDetails.occupants[0].phone, 'string');
  const tenantRoomDetails = await propertyService.getRoomDetails(tenants[0], String(room._id));
  assert.equal(Object.keys(tenantRoomDetails.occupants[0]).join(','), 'name');
  await assert.rejects(() => propertyService.updateRoom(owner, String(room._id), { maxCapacity: 2 }), { code: 'CAPACITY_BELOW_OCCUPANCY' });
  await assert.rejects(() => propertyService.updateRoom(owner, String(room._id), { genderEligibility: 'MALE' }), { code: 'ROOM_HAS_INCOMPATIBLE_OCCUPANTS' });
  await assert.rejects(() => propertyService.validateAssignmentEligibility(String(hostel._id), String(room._id), String(tenants[0]._id)), { code: 'ROOM_FULL' });
  await assert.rejects(() => propertyService.softDeleteRoom(owner, String(room._id), 'cleanup'), { code: 'ROOM_HAS_ACTIVE_OCCUPANTS' });
  await assert.rejects(() => propertyService.softDeleteHostel(owner, String(hostel._id), 'cleanup'), { code: 'HOSTEL_HAS_ACTIVE_STAYS' });

  const results = await Promise.allSettled([
    propertyService.updateRoom(owner, String(room._id), { defaultRentPaise: 860000, reason: 'Rate review' }),
    propertyService.updateRoom(owner, String(room._id), { defaultRentPaise: 870000, reason: 'Second rate review' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await RoomConfigurationHistory.countDocuments({ roomId: room._id }), 2);
  const tenantInventoryWhenFull = await propertyService.listHostels(tenants[0], { page: 1, limit: 20 });
  assert.equal(tenantInventoryWhenFull.items.length, 2);
  assert.equal(tenantInventoryWhenFull.items.find((item) => String(item._id) === String(hostel._id)).availableBeds, 0);
  await assert.rejects(() => propertyService.setHostelBlocked(otherOwner, String(hostel._id), true), { code: 'FORBIDDEN' });
  const blockedHostel = await propertyService.setHostelBlocked(admin, String(hostel._id), true, 'Safety review');
  assert.equal(blockedHostel.isBlocked, true);
  assert.equal((await propertyService.listHostels(tenants[0], { page: 1, limit: 20 })).items.length, 0);
  await assert.rejects(() => propertyService.getHostel(owner, String(hostel._id)), { code: 'HOSTEL_BLOCKED' });
  assert.equal((await propertyService.setHostelBlocked(admin, String(hostel._id), false)).isBlocked, false);
});
