import test from 'node:test';
import assert from 'node:assert/strict';
import { createDepositSchema } from '../src/validators/depositValidators.js';

test('deposit transactions require explicit type, integer paise, a valid date, and a reason', () => {
  const input = { type: 'RECEIVED', amountPaise: 100000, transactionDate: '2026-10-26', reason: 'Deposit receipt recorded' };
  assert.equal(createDepositSchema.parse(input).type, 'RECEIVED');
  assert.equal(createDepositSchema.safeParse({ ...input, amountPaise: -1 }).success, false);
  assert.equal(createDepositSchema.safeParse({ ...input, transactionDate: '2026-02-30' }).success, false);
  assert.equal(createDepositSchema.safeParse({ ...input, type: 'RENT_CREDIT' }).success, false);
});
