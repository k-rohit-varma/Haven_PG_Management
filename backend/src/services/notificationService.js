import { Notification } from '../models/Notification.js';
import { AppError } from '../errors/AppError.js';

export async function listNotifications(user) {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ recipientId: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ recipientId: user._id, readAt: null }),
  ]);
  return { items, unreadCount };
}

export async function markRead(user, notificationId) {
  const notification = await Notification.findOneAndUpdate({ _id: notificationId, recipientId: user._id }, { $set: { readAt: new Date() } }, { new: true });
  if (!notification) throw new AppError(404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
  return notification;
}

export async function markAllRead(user) {
  const result = await Notification.updateMany({ recipientId: user._id, readAt: null }, { $set: { readAt: new Date() } });
  return { modifiedCount: result.modifiedCount };
}
