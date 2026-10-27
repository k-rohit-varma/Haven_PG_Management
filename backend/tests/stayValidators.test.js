import test from 'node:test';
import assert from 'node:assert/strict';
import { assignStaySchema, createApplicationSchema, markLeftSchema } from '../src/validators/stayValidators.js';

test('application and stay validators accept only explicit resource IDs and integer paise', () => {
  assert.equal(createApplicationSchema.safeParse({ hostelId: '64b000000000000000000001' }).success, true);
  assert.equal(createApplicationSchema.safeParse({ hostelId: '64b000000000000000000001', tenantId: '64b000000000000000000002' }).success, false);
  const assignment = { roomId: '64b000000000000000000003', moveInDate: '2024-08-31', agreedMonthlyRentPaise: 850000, securityDepositPaise: 1700000 };
  assert.equal(assignStaySchema.safeParse(assignment).success, true);
  assert.equal(assignStaySchema.safeParse({ ...assignment, agreedMonthlyRentPaise: 850000.5 }).success, false);
  assert.equal(assignStaySchema.safeParse({ ...assignment, moveInDate: '2024-02-30' }).success, false);
});

test('leaving dates require a valid date and reason is safely optional', () => {
  assert.equal(markLeftSchema.parse({ leavingDate: '2026-10-26' }).reason, '');
  assert.equal(markLeftSchema.safeParse({ leavingDate: '2025-13-01' }).success, false);
  assert.equal(markLeftSchema.safeParse({ leavingDate: '2026-10-26', status: 'LEFT' }).success, false);
});
