import mongoose from 'mongoose';

const historySchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true, default: Date.now },
  reason: { type: String, trim: true, maxlength: 300, default: '' },
  previous: { type: mongoose.Schema.Types.Mixed, required: true },
  next: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: false, versionKey: false });

historySchema.index({ roomId: 1, changedAt: -1 });
export const RoomConfigurationHistory = mongoose.model('RoomConfigurationHistory', historySchema);
