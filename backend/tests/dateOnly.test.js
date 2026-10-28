import test from 'node:test';
import assert from 'node:assert/strict';
import { dayInKolkata, isValidDateOnly, parseLocalDate } from '../src/utils/dateOnly.js';

test('date-only values preserve their entered calendar day without timezone shifts', () => {
  assert.equal(dayInKolkata('2026-10-15'), '2026-10-15');
  assert.equal(dayInKolkata(parseLocalDate('2026-10-15')), '2026-10-15');
  assert.equal(dayInKolkata(new Date('2026-10-14T18:30:00.000Z')), '2026-10-15');
});

test('ISO timestamps and date objects use the Asia/Kolkata calendar day', () => {
  assert.equal(dayInKolkata('2026-12-31T18:45:00.000Z'), '2027-01-01');
  assert.equal(dayInKolkata(new Date('2026-12-31T18:45:00.000Z')), '2027-01-01');
});

test('invalid and missing dates are rejected with a clear error', () => {
  assert.equal(isValidDateOnly('2026-02-29'), false);
  assert.throws(() => parseLocalDate('2026-02-29'), { code: 'INVALID_DATE', statusCode: 422 });
  assert.throws(() => dayInKolkata('not-a-date'), { code: 'INVALID_STORED_DATE', statusCode: 500 });
  assert.throws(() => dayInKolkata(null), { code: 'INVALID_STORED_DATE', statusCode: 500 });
});
