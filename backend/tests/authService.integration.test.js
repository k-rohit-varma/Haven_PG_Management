import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';

const uri = process.env.TEST_AUTH_MONGODB_URI;

test('tenant registration hashes passwords and login failures stay generic', { skip: !uri && 'Set TEST_AUTH_MONGODB_URI to a test MongoDB URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_AUTH_MONGODB_URI must name a database ending in _test; this test drops its database.');
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'unit-test-signing-secret-at-least-32-characters';
  process.env.COOKIE_SECRET = 'unit-test-cookie-secret-at-least-32-characters';
  process.env.CLIENT_URL = 'http://localhost:5173';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await User.init();
  const authService = await import('../src/services/authService.js');

  const user = await authService.registerTenant({ name: 'Aditi Sharma', phone: '09876543210', password: 'SecurePass123', gender: 'FEMALE' });
  assert.equal(user.phone, '+919876543210');
  assert.equal(user.role, 'TENANT');
  assert.equal(JSON.stringify(user).includes('passwordHash'), false);
  const stored = await User.findById(user._id).select('+passwordHash');
  assert.notEqual(stored.passwordHash, 'SecurePass123');

  const login = await authService.login({ phone: '9876543210', password: 'SecurePass123' });
  assert.equal(login.user.id, user.id);
  assert.equal(typeof login.token, 'string');
  await assert.rejects(authService.registerTenant({ name: 'Duplicate', phone: '+91 98765 43210', password: 'SecurePass123' }), { code: 'PHONE_IN_USE' });
  const [unknownPhone, wrongPassword] = await Promise.allSettled([
    authService.login({ phone: '9000000001', password: 'SecurePass123' }),
    authService.login({ phone: '9876543210', password: 'WrongPassword123' }),
  ]);
  assert.equal(unknownPhone.status, 'rejected');
  assert.equal(wrongPassword.status, 'rejected');
  assert.equal(unknownPhone.reason.message, wrongPassword.reason.message);
});
