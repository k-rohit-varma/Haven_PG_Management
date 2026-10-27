import mongoose from 'mongoose';

const depositTransactionSchema = new mongoose.Schema({
  stayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  type: { type: String, enum: ['RECEIVED', 'REFUND', 'DEDUCTION', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT'], required: true },
  amountPaise: { type: Number, required: true, min: 1, max: 100000000 },
  transactionDate: { type: Date, required: true },
  reference: { type: String, trim: true, maxlength: 100, default: '' },
  reason: { type: String, trim: true, required: true, minlength: 3, maxlength: 500 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

depositTransactionSchema.index({ stayId: 1, transactionDate: 1, createdAt: 1 });
depositTransactionSchema.index({ hostelId: 1, transactionDate: -1 });
export const DepositTransaction = mongoose.model('DepositTransaction', depositTransactionSchema);
