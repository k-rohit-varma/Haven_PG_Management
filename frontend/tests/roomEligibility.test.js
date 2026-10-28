import test from 'node:test';
import assert from 'node:assert/strict';
import { roomAcceptsGender } from '../src/lib/roomEligibility.js';

test('room eligibility follows the selected tenant profile and property policy', () => {
  assert.equal(roomAcceptsGender({ genderEligibility: 'MALE' }, 'MALE', 'MIXED'), true);
  assert.equal(roomAcceptsGender({ genderEligibility: 'FEMALE' }, 'FEMALE', 'MIXED'), true);
  assert.equal(roomAcceptsGender({ genderEligibility: 'ANY' }, 'OTHER', 'MIXED'), true);
  assert.equal(roomAcceptsGender({ genderEligibility: 'MALE' }, 'FEMALE', 'MIXED'), false);
  assert.equal(roomAcceptsGender({ genderEligibility: 'ANY' }, 'MALE', 'FEMALE_ONLY'), false);
  assert.equal(roomAcceptsGender({ genderEligibility: 'ANY' }, '', 'MIXED'), false);
});
