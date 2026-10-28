import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  fromStatus: { type: String, enum: ['ACTIVE', 'LEFT', 'CANCELLED'], default: null },
  toStatus: { type: String, enum: ['ACTIVE', 'LEFT', 'CANCELLED'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true, default: Date.now },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const rentTermSchema = new mongoose.Schema({
  monthlyRentPaise: { type: Number, required: true, min: 1, max: 100000000 },
  effectiveFrom: { type: Date, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentChangeRequest', default: null },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  recordedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const staySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantApplication', default: null },
  moveInDate: { type: Date, required: true, immutable: true },
  leavingDate: { type: Date, default: null },
  agreedMonthlyRentPaise: { type: Number, required: true, min: 1, max: 100000000 },
  rentTerms: { type: [rentTermSchema], default: [] },
  roomTransfers: [{ fromRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true }, toRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true }, effectiveAt: { type: Date, required: true }, requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomChangeRequest', required: true }, actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, reason: { type: String, trim: true, maxlength: 1000, default: '' } }],
  securityDepositPaise: { type: Number, required: true, min: 0, max: 100000000 },
  rentCycleAnchorDay: { type: Number, required: true, min: 1, max: 31, immutable: true },
  status: { type: String, enum: ['ACTIVE', 'LEFT', 'CANCELLED'], required: true, default: 'ACTIVE', index: true },
  events: { type: [eventSchema], default: [] },
  financialTermsLocked: { type: Boolean, default: true, required: true },
  termsConfirmedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

staySchema.index({ tenantId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
staySchema.index({ hostelId: 1, status: 1, moveInDate: -1 });
staySchema.index({ roomId: 1, status: 1 });
staySchema.index({ tenantId: 1, moveInDate: -1 });
staySchema.index({ applicationId: 1 }, { name: 'applicationId_1_partial', unique: true, partialFilterExpression: { applicationId: { $type: 'objectId' } } });

export const Stay = mongoose.model('Stay', staySchema);
