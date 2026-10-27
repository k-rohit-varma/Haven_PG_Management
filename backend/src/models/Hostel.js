import mongoose from 'mongoose';

const hostelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  address: { type: String, required: true, trim: true, maxlength: 300 },
  city: { type: String, required: true, trim: true, maxlength: 100, index: true },
  facilities: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
  images: { type: [{ type: String, trim: true, maxlength: 500 }], default: [] },
  accommodationPolicy: { type: String, enum: ['MIXED', 'MALE_ONLY', 'FEMALE_ONLY'], required: true },
  contactPhone: { type: String, trim: true, maxlength: 30, default: '' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  isBlocked: { type: Boolean, default: false, index: true },
  blockedAt: { type: Date, default: null },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  blockReason: { type: String, trim: true, maxlength: 300, default: '' },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deletionReason: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: true });

hostelSchema.index({ isActive: 1, city: 1, name: 1 });
hostelSchema.index({ ownerId: 1, isDeleted: 1, createdAt: -1 });

export const Hostel = mongoose.model('Hostel', hostelSchema);
