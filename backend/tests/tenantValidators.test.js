import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantSchema, tenantListQuery, updateRentSchema, updateTenantSchema } from '../src/validators/tenantValidators.js';

const ids = { hostelId: '64b000000000000000000001', roomId: '64b000000000000000000002' };

test('direct tenant assignment validates profile, property, room, date, rent, and deposit together', () => {
  const input = createTenantSchema.parse({ name: 'Aditi Sharma', phone: '9876543210', gender: 'FEMALE', ...ids, moveInDate: '2026-10-28', agreedMonthlyRentPaise: 550000, securityDepositPaise: 1000000 });
  assert.equal(input.phone, '+919876543210');
  assert.equal(input.gender, 'FEMALE');
  assert.equal(createTenantSchema.safeParse({ name: 'Aditi Sharma', phone: '9876543210', ...ids, moveInDate: '2026-10-28', agreedMonthlyRentPaise: 550000, securityDepositPaise: 1000000 }).success, false);
  assert.equal(createTenantSchema.safeParse({ name: 'Aditi Sharma', phone: '9876543210', gender: 'FEMALE', hostelId: ids.hostelId, moveInDate: '2026-10-28', agreedMonthlyRentPaise: 550000, securityDepositPaise: 1000000 }).success, false);
  assert.equal(createTenantSchema.safeParse({ name: 'Aditi Sharma', phone: '9876543210', gender: 'female', ...ids, moveInDate: '2026-10-28', agreedMonthlyRentPaise: 550000, securityDepositPaise: 1000000 }).success, false);
  assert.equal(createTenantSchema.safeParse({ ...input, agreedMonthlyRentPaise: '550000' }).success, false);
  assert.equal(createTenantSchema.safeParse({ ...input, moveInDate: '2026-02-30' }).success, false);
});

test('tenant edits reject protected stay/financial fields and require an allowed change', () => {
  assert.equal(updateTenantSchema.safeParse({}).success, false);
  assert.equal(updateTenantSchema.safeParse({ moveInDate: '2026-10-28' }).success, false);
  assert.equal(updateTenantSchema.safeParse({ name: 'Aditi Sharma' }).success, true);
});

test('tenant listing supports validated server filters and rent changes use paise and explicit dates', () => {
  assert.equal(tenantListQuery.safeParse({ page: '2', limit: '50', status: 'ACTIVE' }).success, true);
  assert.equal(tenantListQuery.safeParse({ status: 'PENDING' }).success, false);
  assert.equal(updateRentSchema.safeParse({ monthlyRentPaise: 600000, effectiveDate: '2026-11-01' }).success, true);
  assert.equal(updateRentSchema.safeParse({ monthlyRentPaise: 6000, effectiveDate: '2026-11-31' }).success, false);
});
