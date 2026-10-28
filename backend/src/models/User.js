import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, lowercase: true, trim: true, default: undefined, maxlength: 254 },
  phone: { type: String, trim: true, default: undefined, match: /^\+91[6-9]\d{9}$/ },
  emergencyContact: { type: String, trim: true, maxlength: 100, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['ADMIN', 'OWNER', 'TENANT'], default: 'TENANT', immutable: true },
  isSystemAdmin: { type: Boolean, default: false, select: false },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'], default: 'PREFER_NOT_TO_SAY' },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false, index: true },
  activeStayLockVersion: { type: Number, default: 0, select: false },
}, { timestamps: true, versionKey: false });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.isDeleted;
    delete ret.activeStayLockVersion;
    delete ret.isSystemAdmin;
    return ret;
  },
});

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

export const User = mongoose.model('User', userSchema);
