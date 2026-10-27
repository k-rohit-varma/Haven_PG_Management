import test from 'node:test';
import assert from 'node:assert/strict';
import { createRentChangeSchema, decideRentChangeSchema } from '../src/validators/rentChangeValidators.js';
import { createDepositSchema } from '../src/validators/depositValidators.js';

test('rent change requests accept only a stay, paise amount, and a reason', () => {
  const input = { stayId: '507f1f77bcf86cd799439011', requestedRentPaise: 150001, reason: 'Comparable rents have changed' };
  assert.equal(createRentChangeSchema.parse(input).requestedRentPaise, 150001);
  assert.equal(createRentChangeSchema.safeParse({ ...input, requestedRentPaise: 1500.5 }).success, false);
  assert.equal(createRentChangeSchema.safeParse({ ...input, effectiveDate: '2026-12-01' }).success, false);
  assert.equal(decideRentChangeSchema.safeParse({ decision: 'REJECTED', reason: 'Please clarify the requested terms' }).success, true);
  assert.equal(decideRentChangeSchema.safeParse({ decision: 'REJECTED' }).success, false);
});

test('deposit transactions require explicit type, integer paise, a valid date, and a reason', () => {
  const input = { type: 'RECEIVED', amountPaise: 100000, transactionDate: '2026-10-26', reason: 'Deposit receipt recorded' };
  assert.equal(createDepositSchema.parse(input).type, 'RECEIVED');
  assert.equal(createDepositSchema.safeParse({ ...input, amountPaise: -1 }).success, false);
  assert.equal(createDepositSchema.safeParse({ ...input, transactionDate: '2026-02-30' }).success, false);
  assert.equal(createDepositSchema.safeParse({ ...input, type: 'RENT_CREDIT' }).success, false);
});
