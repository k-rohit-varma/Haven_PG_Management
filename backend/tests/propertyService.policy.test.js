import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostel } from '../src/services/propertyService.js';

const details = { name: 'Policy House', address: '12 Park Street', city: 'Pune', accommodationPolicy: 'MIXED' };

test('only ADMIN can create properties and ADMIN must select an owner', async () => {
  await assert.rejects(() => createHostel({ _id: 'owner-id', role: 'OWNER' }, { ...details, ownerId: 'owner-id' }), { code: 'FORBIDDEN', statusCode: 403 });
  await assert.rejects(() => createHostel({ _id: 'tenant-id', role: 'TENANT' }, details), { code: 'FORBIDDEN', statusCode: 403 });
  await assert.rejects(() => createHostel({ _id: 'admin-id', role: 'ADMIN' }, details), { code: 'OWNER_REQUIRED', statusCode: 422 });
});
