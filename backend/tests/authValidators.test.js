import test from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema } from '../src/validators/authValidators.js';

test('login normalizes phone input and preserves email login for existing accounts', () => {
  assert.equal(loginSchema.safeParse({ phone: '123', password: 'x' }).success, false);
  assert.deepEqual(loginSchema.parse({ phone: '9876543210', password: 'x' }), { login: { phone: '+919876543210' }, password: 'x' });
  assert.deepEqual(loginSchema.parse({ email: 'ADITI@example.com', password: 'x' }), { login: { email: 'aditi@example.com' }, password: 'x' });
});
