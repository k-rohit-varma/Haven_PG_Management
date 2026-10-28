import test from 'node:test';
import assert from 'node:assert/strict';
import { currentRentPaise } from '../src/utils/rentTerms.js';

test('current rent follows the latest effective term and ignores future terms', () => {
  const stay = {
    agreedMonthlyRentPaise: 120000,
    rentTerms: [
      { monthlyRentPaise: 120000, effectiveFrom: new Date('2026-10-01T00:00:00+05:30') },
      { monthlyRentPaise: 150000, effectiveFrom: new Date('2026-12-01T00:00:00+05:30') },
      { monthlyRentPaise: 140000, effectiveFrom: new Date('2026-11-01T00:00:00+05:30') },
    ],
  };
  assert.equal(currentRentPaise(stay, new Date('2026-10-31T12:00:00+05:30')), 120000);
  assert.equal(currentRentPaise(stay, new Date('2026-11-15T12:00:00+05:30')), 140000);
  assert.equal(currentRentPaise(stay, new Date('2026-12-01T00:00:00+05:30')), 150000);
});

test('legacy stays without rent history use their original agreed amount', () => {
  assert.equal(currentRentPaise({ agreedMonthlyRentPaise: 100000, rentTerms: [] }), 100000);
});
