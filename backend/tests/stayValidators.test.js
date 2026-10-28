import test from 'node:test';
import assert from 'node:assert/strict';
import { markLeftSchema, stayPaginationSchema } from '../src/validators/stayValidators.js';

test('leaving dates require a valid date and reason is safely optional', () => {
  assert.equal(markLeftSchema.parse({ leavingDate: '2026-10-26' }).reason, '');
  assert.equal(markLeftSchema.safeParse({ leavingDate: '2025-13-01' }).success, false);
  assert.equal(markLeftSchema.safeParse({ leavingDate: '2026-10-26', status: 'LEFT' }).success, false);
});

test('resident listing validates server-side search and filter parameters', () => {
  const query = { page: '2', limit: '25', status: 'ACTIVE', search: 'Room 4', hostelId: '64b000000000000000000001', roomId: '64b000000000000000000003', gender: 'FEMALE' };
  assert.deepEqual(stayPaginationSchema.parse(query), { ...query, page: 2, limit: 25 });
  assert.equal(stayPaginationSchema.safeParse({ ...query, gender: 'UNKNOWN' }).success, false);
  assert.equal(stayPaginationSchema.safeParse({ ...query, limit: '101' }).success, false);
});
