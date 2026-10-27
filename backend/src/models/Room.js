import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  identifier: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  sharingType: { type: Number, required: true, min: 1, max: 12 },
  maxCapacity: { type: Number, required: true, min: 1, max: 12 },
  genderEligibility: { type: String, enum: ['ANY', 'MALE', 'FEMALE'], required: true },
  defaultRentPaise: { type: Number, required: true, min: 0, max: 100000000 },
  facilities: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  isActive: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deletionReason: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: true });

roomSchema.index({ hostelId: 1, identifier: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
roomSchema.index({ hostelId: 1, isActive: 1, isDeleted: 1 });
roomSchema.pre('validate', function validateCapacity(next) {
  if (this.sharingType > this.maxCapacity) this.invalidate('maxCapacity', 'Maximum capacity cannot be below the sharing type.');
  next();
});

export const Room = mongoose.model('Room', roomSchema);
