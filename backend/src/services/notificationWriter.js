import { Notification } from '../models/Notification.js';

export async function notifyOnce(notification, session) {
  const { eventKey, ...fields } = notification;
  await Notification.updateOne(
    { eventKey },
    { $setOnInsert: { ...fields, eventKey } },
    { upsert: true, ...(session ? { session } : {}) },
  );
}
