import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Notification } from '../src/models/Notification.js';
import * as notifications from '../src/services/notificationService.js';

const uri = process.env.TEST_NOTIFICATION_MONGODB_URI;

test('notifications are scoped to their recipient for read and list operations', { skip: !uri && 'Set TEST_NOTIFICATION_MONGODB_URI to a test MongoDB URI.' }, async (t) => {
  if (!new URL(uri).pathname.toLowerCase().endsWith('_test')) throw new Error('TEST_NOTIFICATION_MONGODB_URI must name a database ending in _test; this test drops its database.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User.init(), Notification.init()]);
  const [tenantOne, tenantTwo] = await User.create([
    { name: 'Notification Tenant One', phone: '+919876543210', passwordHash: 'hash', role: 'TENANT' },
    { name: 'Notification Tenant Two', phone: '+919876543211', passwordHash: 'hash', role: 'TENANT' },
  ]);
  const [firstNote, secondNote] = await Notification.create([
    { recipientId: tenantOne._id, type: 'PAYMENT_DECISION', title: 'Payment approved', message: 'Your rent payment was verified.', destination: '/payments' },
    { recipientId: tenantTwo._id, type: 'APPLICATION_DECISION', title: 'Application declined', message: 'Your application was declined.', destination: '/applications' },
  ]);
  assert.equal((await notifications.listNotifications(tenantOne)).items.length, 1);
  await assert.rejects(notifications.markRead(tenantOne, String(secondNote._id)), { code: 'NOTIFICATION_NOT_FOUND' });
  await notifications.markRead(tenantOne, String(firstNote._id));
  assert.equal((await notifications.listNotifications(tenantOne)).unreadCount, 0);
});
