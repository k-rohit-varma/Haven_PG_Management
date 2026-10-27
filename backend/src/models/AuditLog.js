import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, trim: true, maxlength: 100 },
  entityType: { type: String, enum: ['USER', 'HOSTEL', 'ROOM', 'STAY', 'TENANT_APPLICATION', 'RENT_DUE', 'PAYMENT', 'RENT_CHANGE_REQUEST', 'DEPOSIT_TRANSACTION'], required: true, index: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  requestId: { type: String, trim: true, maxlength: 100, default: '' },
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
}, { timestamps: true });

auditLogSchema.index({ entityType: 1, entityId: 1, occurredAt: -1 });
auditLogSchema.index({ actorId: 1, occurredAt: -1 });
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
