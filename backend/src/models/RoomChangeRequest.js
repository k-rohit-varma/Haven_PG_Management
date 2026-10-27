import mongoose from 'mongoose';

const roomChangeRequestSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay', required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  currentRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  requestedRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  reason: { type: String, trim: true, required: true, minlength: 3, maxlength: 1000 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', required: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  events: [{ fromStatus: { type: String, default: null }, toStatus: { type: String, required: true }, actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, at: { type: Date, default: Date.now }, reason: { type: String, default: '' } }],
}, { timestamps: true });

roomChangeRequestSchema.index({ stayId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
roomChangeRequestSchema.index({ hostelId: 1, status: 1, createdAt: -1 });
export const RoomChangeRequest = mongoose.model('RoomChangeRequest', roomChangeRequestSchema);
