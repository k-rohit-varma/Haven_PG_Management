import mongoose from 'mongoose';

const rentChangeRequestSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay', required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  currentRentPaise: { type: Number, required: true, min: 1 },
  requestedRentPaise: { type: Number, required: true, min: 1 },
  reason: { type: String, trim: true, required: true, minlength: 3, maxlength: 1000 },
  effectiveDate: { type: Date, required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true, default: 'PENDING' },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  events: [{
    fromStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: null },
    toStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true, default: Date.now },
    reason: { type: String, trim: true, maxlength: 1000, default: '' },
  }],
}, { timestamps: true });

rentChangeRequestSchema.index({ stayId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
rentChangeRequestSchema.index({ hostelId: 1, status: 1, createdAt: -1 });
rentChangeRequestSchema.index({ tenantId: 1, createdAt: -1 });
export const RentChangeRequest = mongoose.model('RentChangeRequest', rentChangeRequestSchema);
