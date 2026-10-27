import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['APPLICATION_DECISION', 'PAYMENT_DECISION', 'RENT_CHANGE_DECISION', 'ROOM_CHANGE_DECISION', 'HOSTEL_OWNERSHIP'], required: true },
  title: { type: String, required: true, maxlength: 120 },
  message: { type: String, required: true, maxlength: 300 },
  destination: { type: String, enum: ['/applications', '/payments', '/rent-changes', '/hostels'], default: '' },
  relatedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  eventKey: { type: String, default: undefined, maxlength: 180 },
  readAt: { type: Date, default: null },
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } });
export const Notification = mongoose.model('Notification', notificationSchema);
