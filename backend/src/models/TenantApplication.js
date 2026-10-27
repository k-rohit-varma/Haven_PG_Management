import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  fromStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: null },
  toStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true, default: Date.now },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const tenantApplicationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING', required: true },
  submittedAt: { type: Date, required: true, default: Date.now },
  decidedAt: { type: Date, default: null },
  decisionMakerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  events: { type: [eventSchema], default: [] },
}, { timestamps: true });

tenantApplicationSchema.index({ tenantId: 1, hostelId: 1 }, { name: 'tenantId_1_hostelId_1_pending_unique', unique: true, partialFilterExpression: { status: 'PENDING' } });
tenantApplicationSchema.index({ hostelId: 1, status: 1, submittedAt: -1 });
tenantApplicationSchema.index({ tenantId: 1, submittedAt: -1 });

export const TenantApplication = mongoose.model('TenantApplication', tenantApplicationSchema);
