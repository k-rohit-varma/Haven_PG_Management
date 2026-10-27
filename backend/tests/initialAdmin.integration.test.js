import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';

const uri = process.env.TEST_ADMIN_INIT_MONGODB_URI;

test('admin bootstrap is idempotent and refuses to promote a conflicting account', { skip: !uri && 'Set TEST_ADMIN_INIT_MONGODB_URI to a test MongoDB URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_ADMIN_INIT_MONGODB_URI must name a database ending in _test; this test drops its database.');
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'unit-test-signing-secret-at-least-32-characters';
  process.env.COOKIE_SECRET = 'unit-test-cookie-secret-at-least-32-characters';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.ADMIN_NAME = 'System Administrator';
  process.env.ADMIN_PHONE = '+919000000000';
  process.env.ADMIN_PASSWORD = 'FirstAdminPass123';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await User.init();
  const { ensureInitialAdmin } = await import('../src/services/initialAdminService.js');

  const first = await ensureInitialAdmin();
  const storedFirst = await User.findById(first._id).select('+passwordHash');
  process.env.ADMIN_PASSWORD = 'ChangedAdminPass456';
  const second = await ensureInitialAdmin();
  const storedSecond = await User.findById(second._id).select('+passwordHash');
  assert.equal(first.id, second.id);
  assert.equal(storedFirst.passwordHash, storedSecond.passwordHash);
  assert.equal(await (await import('bcryptjs')).default.compare('FirstAdminPass123', storedSecond.passwordHash), true);

  await User.create({ name: 'Existing Tenant', phone: '+919000000001', passwordHash: 'not-a-real-hash', role: 'TENANT' });
  process.env.ADMIN_PHONE = '+919000000001';
  await assert.rejects(ensureInitialAdmin(), /belongs to a non-admin account/);
  assert.equal((await User.findOne({ phone: '+919000000001' })).role, 'TENANT');
});
