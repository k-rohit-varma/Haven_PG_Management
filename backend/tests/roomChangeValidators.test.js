import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomChangeSchema, roomChangeDecision } from '../src/validators/roomChangeValidators.js';

const id = '0123456789abcdef01234567';

test('room-change requests require a stay, target room, and reason', () => {
  assert.equal(createRoomChangeSchema.safeParse({ stayId: id, requestedRoomId: id, reason: 'Need a quieter room' }).success, true);
  assert.equal(createRoomChangeSchema.safeParse({ stayId: id, requestedRoomId: id, reason: 'ok' }).success, false);
  assert.equal(createRoomChangeSchema.safeParse({ stayId: id, requestedRoomId: id, reason: 'Need a quieter room', tenantId: id }).success, false);
});

test('room-change rejection requires a reason and decisions reject unknown fields', () => {
  assert.equal(roomChangeDecision.safeParse({ decision: 'APPROVED' }).success, true);
  assert.equal(roomChangeDecision.safeParse({ decision: 'REJECTED', reason: 'No suitable vacancy' }).success, true);
  assert.equal(roomChangeDecision.safeParse({ decision: 'REJECTED', reason: 'No' }).success, false);
  assert.equal(roomChangeDecision.safeParse({ decision: 'APPROVED', tenantId: id }).success, false);
});
