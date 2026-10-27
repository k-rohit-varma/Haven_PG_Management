import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  fromStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: null },
  toStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true, default: Date.now },
  note: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay', required: true },
  rentDueId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentDue', required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1 },
  paidOn: { type: Date, required: true },
  method: { type: String, enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER'], required: true },
  transactionReference: { type: String, trim: true, maxlength: 100, default: '' },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true, default: 'PENDING' },
  submittedAt: { type: Date, required: true, default: Date.now },
  decisionMakerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  events: { type: [eventSchema], default: [] },
}, { timestamps: true });

paymentSchema.index({ rentDueId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
paymentSchema.index({ hostelId: 1, status: 1, submittedAt: -1 });
paymentSchema.index({ tenantId: 1, submittedAt: -1 });
export const Payment = mongoose.model('Payment', paymentSchema);
