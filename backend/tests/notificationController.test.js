import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Notification } from '../src/models/Notification.js';
import * as controller from '../src/controllers/notificationController.js';

test('notification list controller returns the recipient-scoped service response for OWNER and ADMIN', async () => {
  const originalFind = Notification.find;
  const originalCountDocuments = Notification.countDocuments;
  Notification.find = () => ({ sort() { return this; }, limit() { return this; }, async lean() { return []; } });
  Notification.countDocuments = async () => 0;
  try {
    for (const role of ['OWNER', 'ADMIN']) {
      let response;
      let failure;
      await controller.list({ user: { _id: new mongoose.Types.ObjectId(), role } }, { json(body) { response = body; } }, (error) => { failure = error; });
      assert.equal(failure, undefined);
      assert.deepEqual(response, { success: true, data: { items: [], unreadCount: 0 } });
    }
  } finally {
    Notification.find = originalFind;
    Notification.countDocuments = originalCountDocuments;
  }
});
