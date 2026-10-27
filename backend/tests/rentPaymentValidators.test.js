import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentDecisionSchema, rentQuerySchema, submitPaymentSchema } from '../src/validators/rentPaymentValidators.js';

test('rent query validates status, month, pagination, and resource IDs', () => {
  assert.equal(rentQuerySchema.parse({ month: '2026-10', status: 'OVERDUE' }).page, 1);
  assert.equal(rentQuerySchema.safeParse({ month: '2026-13' }).success, false);
  assert.equal(rentQuerySchema.safeParse({ status: 'PENDING' }).success, false);
  assert.equal(rentQuerySchema.parse({ search: 'Room 1' }).search, 'Room 1');
  assert.equal(rentQuerySchema.safeParse({ search: 'x' }).success, false);
});

test('payment submissions require integer paise and valid payment details', () => {
  const valid = { rentDueId: '507f1f77bcf86cd799439011', amountPaise: 10001, paidOn: '2026-10-26', method: 'UPI' };
  assert.equal(submitPaymentSchema.parse(valid).amountPaise, 10001);
  assert.equal(submitPaymentSchema.safeParse({ ...valid, amountPaise: 1.5 }).success, false);
  assert.equal(submitPaymentSchema.safeParse({ ...valid, paidOn: '2026-02-30' }).success, false);
  assert.equal(submitPaymentSchema.safeParse({ ...valid, transactionReference: 'x'.repeat(101) }).success, false);
});

test('payment decisions require a reason when rejecting', () => {
  assert.equal(paymentDecisionSchema.safeParse({ decision: 'APPROVED' }).success, true);
  assert.equal(paymentDecisionSchema.safeParse({ decision: 'REJECTED', reason: 'Insufficient reference' }).success, true);
  assert.equal(paymentDecisionSchema.safeParse({ decision: 'REJECTED' }).success, false);
});
