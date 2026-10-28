import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/environment.js';
import { AppError } from '../errors/AppError.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';

const genericAuthError = () => new AppError(401, 'Phone number or password is incorrect.', 'INVALID_CREDENTIALS');

export async function login(input) {
  const lookup = input.login || (input.phone ? { phone: normalizeIndianPhone(input.phone) } : { email: input.email?.toLowerCase() });
  const user = await User.findOne({ ...lookup, isActive: true, isDeleted: false }).select('+passwordHash');
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : await bcrypt.compare(input.password, '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6ydPK4R5J6GVwO1MybYqQ80jLlYzG');
  if (!user || !valid || !['ADMIN', 'OWNER'].includes(user.role)) throw genericAuthError();
  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '7d', issuer: 'pg-management' });
  return { user, token };
}
