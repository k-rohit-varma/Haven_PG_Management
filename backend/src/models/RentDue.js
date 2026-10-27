import mongoose from 'mongoose';

const rentDueSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay', required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  billingPeriod: { type: String, required: true },
  periodStart: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  amountDuePaise: { type: Number, required: true, min: 1 },
  amountSettledPaise: { type: Number, required: true, min: 0, default: 0 },
  lastPaymentPaidOn: { type: Date, default: null },
  status: { type: String, enum: ['UPCOMING', 'PAYMENT_PENDING', 'PAID', 'PAID_LATE', 'OVERDUE', 'PARTIALLY_PAID'], required: true, default: 'UPCOMING' },
}, { timestamps: true });

rentDueSchema.index({ stayId: 1, billingPeriod: 1 }, { unique: true });
rentDueSchema.index({ tenantId: 1, dueDate: -1 });
rentDueSchema.index({ hostelId: 1, dueDate: 1, status: 1 });
rentDueSchema.index({ hostelId: 1, billingPeriod: 1, status: 1 });
export const RentDue = mongoose.model('RentDue', rentDueSchema);
