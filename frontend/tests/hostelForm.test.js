import test from 'node:test';
import assert from 'node:assert/strict';
import { zodResolver } from '@hookform/resolvers/zod';
import { createHostelFormDefaults, hostelFormSchema, toCreateHostelPayload } from '../src/features/properties/hostelForm.js';

const resolver = zodResolver(hostelFormSchema);
const options = { criteriaMode: 'firstError', shouldUseNativeValidation: false, fields: {} };

test('invalid property form data returns field errors without throwing', async () => {
  const result = await resolver(createHostelFormDefaults(), {}, options);
  assert.equal(result.errors.name.message, 'Enter a property name.');
  assert.equal(result.errors.address.message, 'Enter the street address.');
  assert.equal(result.errors.city.message, 'Enter a city.');
  assert.deepEqual(result.values, {});
});

test('valid property form data maps to the backend create-hostel payload', async () => {
  const values = { ...createHostelFormDefaults(), ownerId: '507f1f77bcf86cd799439011', name: 'Maple Residency', address: '12 Park Street', city: 'Pune', contactPhone: '+919876543210', description: 'Quiet centrally located hostel.', facilities: 'Wi-Fi, laundry, meals' };
  const result = await resolver(values, {}, options);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(toCreateHostelPayload(result.values), {
    name: 'Maple Residency', address: '12 Park Street', city: 'Pune', accommodationPolicy: 'MIXED',
    ownerId: '507f1f77bcf86cd799439011',
    contactPhone: '+919876543210', description: 'Quiet centrally located hostel.', facilities: ['Wi-Fi', 'laundry', 'meals'], images: [],
  });
});
