import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/environment.js';
import { AppError } from '../errors/AppError.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';

const genericAuthError = () => new AppError(401, 'Phone number or password is incorrect.', 'INVALID_CREDENTIALS');

export async function registerTenant(input) {
  const phone = normalizeIndianPhone(input.phone);
  if (!phone) throw new AppError(422, 'Enter a valid 10-digit Indian mobile number.', 'INVALID_PHONE');
  if (await User.exists({ phone })) throw new AppError(409, 'An account with this phone number already exists.', 'PHONE_IN_USE');
  const passwordHash = await bcrypt.hash(input.password, 12);
  try { return await User.create({ name: input.name, phone, passwordHash, gender: input.gender, role: 'TENANT' }); }
  catch (error) {
    if (error.code === 11000 && error.keyPattern?.phone) throw new AppError(409, 'An account with this phone number already exists.', 'PHONE_IN_USE');
    throw error;
  }
}

export async function login(input) {
  const lookup = input.login || (input.phone ? { phone: normalizeIndianPhone(input.phone) } : { email: input.email?.toLowerCase() });
  const user = await User.findOne({ ...lookup, isActive: true, isDeleted: false }).select('+passwordHash');
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : await bcrypt.compare(input.password, '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6ydPK4R5J6GVwO1MybYqQ80jLlYzG');
  if (!user || !valid) throw genericAuthError();
  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '7d', issuer: 'pg-management' });
  return { user, token };
}
