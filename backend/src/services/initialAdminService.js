import bcrypt from 'bcryptjs';
import { env } from '../config/environment.js';
import { User } from '../models/User.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';
import { logger } from '../utils/logger.js';

export async function ensureInitialAdmin() {
  if (!env.ADMIN_NAME || !env.ADMIN_PHONE || !env.ADMIN_PASSWORD) {
    if (env.NODE_ENV === 'production') throw new Error('ADMIN_NAME, ADMIN_PHONE, and ADMIN_PASSWORD are required in production.');
    logger.warn({ event: 'initial_admin_not_configured' });
    return null;
  }
  const phone = normalizeIndianPhone(env.ADMIN_PHONE);
  const existing = await User.findOne({ phone }).select('+isSystemAdmin');
  if (existing) {
    if (existing.role !== 'ADMIN') throw new Error('Configured ADMIN_PHONE belongs to a non-admin account; no account was changed.');
    if (!existing.isSystemAdmin) await User.collection.updateOne({ _id: existing._id }, { $set: { isSystemAdmin: true } });
    return existing;
  }
  try {
    return await User.create({ name: env.ADMIN_NAME, phone, isSystemAdmin: true, passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12), role: 'ADMIN', gender: 'PREFER_NOT_TO_SAY' });
  } catch (error) {
    if (error.code === 11000) {
      const conflict = await User.findOne({ phone });
      if (conflict && conflict.role !== 'ADMIN') throw new Error('Configured ADMIN_PHONE belongs to a non-admin account; no account was changed.');
      if (conflict) {
        await User.collection.updateOne({ _id: conflict._id }, { $set: { isSystemAdmin: true } });
        return conflict;
      }
    }
    throw error;
  }
}
