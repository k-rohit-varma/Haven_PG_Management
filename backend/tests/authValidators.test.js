import test from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema, registerSchema } from '../src/validators/authValidators.js';

test('tenant registration normalizes Indian phone numbers and applies safe defaults', () => {
  const result = registerSchema.parse({ name: 'Aditi Sharma', phone: '098765 43210', password: 'SecurePass123' });
  assert.equal(result.gender, 'PREFER_NOT_TO_SAY');
  assert.equal(result.phone, '+919876543210');
});

test('tenant registration rejects invalid phones, weak passwords, confirmation fields, and role fields', () => {
  assert.equal(registerSchema.safeParse({ name: 'Aditi', phone: '12345', password: 'weak' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'Aditi', phone: '9876543210', password: 'SecurePass123', role: 'ADMIN' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'Aditi', phone: '9876543210', password: 'SecurePass123', confirmPassword: 'SecurePass123' }).success, false);
});

test('login normalizes phone input and preserves email login for existing accounts', () => {
  assert.equal(loginSchema.safeParse({ phone: '123', password: 'x' }).success, false);
  assert.deepEqual(loginSchema.parse({ phone: '9876543210', password: 'x' }), { login: { phone: '+919876543210' }, password: 'x' });
  assert.deepEqual(loginSchema.parse({ email: 'ADITI@example.com', password: 'x' }), { login: { email: 'aditi@example.com' }, password: 'x' });
});
