import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { AppError } from '../errors/AppError.js';
import { User } from '../models/User.js';

export async function authenticate(req, _res, next) {
  try {
    const token = req.cookies?.session;
    if (!token) throw new AppError(401, 'Sign in to continue.', 'UNAUTHENTICATED');
    let payload;
    try { payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'pg-management' }); }
    catch { throw new AppError(401, 'Your session has expired. Please sign in again.', 'INVALID_SESSION'); }
    const user = await User.findOne({ _id: payload.sub, isActive: true, isDeleted: false });
    if (!user) throw new AppError(401, 'Your account is unavailable.', 'ACCOUNT_UNAVAILABLE');
    if (!['ADMIN', 'OWNER'].includes(user.role)) throw new AppError(401, 'Tenant records cannot sign in. Contact an owner or administrator for account support.', 'AUTHENTICATION_DISABLED');
    req.user = user;
    next();
  } catch (error) { next(error); }
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new AppError(403, 'You do not have access to this resource.', 'FORBIDDEN'));
    next();
  };
}
