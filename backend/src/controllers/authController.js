import { randomBytes, timingSafeEqual } from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sessionCookieOptions } from '../utils/cookies.js';
import { env } from '../config/environment.js';
import { AppError } from '../errors/AppError.js';
import * as authService from '../services/authService.js';

export const csrfToken = (_req, res) => {
  const token = randomBytes(32).toString('hex');
  res.cookie('csrf', token, { secure: env.NODE_ENV === 'production', sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', httpOnly: false, signed: true, path: '/', maxAge: sessionCookieOptions.maxAge });
  res.json({ success: true, data: { csrfToken: token } });
};

export function csrfProtection(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.signedCookies?.csrf;
  const header = req.get('x-csrf-token');
  if (typeof cookie !== 'string' || typeof header !== 'string' || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) return next(new AppError(403, 'Refresh the page and try again.', 'CSRF_VALIDATION_FAILED'));
  next();
}

export const register = asyncHandler(async (req, res) => {
  const user = await authService.registerTenant(req.body);
  const { token } = await authService.login({ phone: req.body.phone, password: req.body.password });
  res.cookie('session', token, { ...sessionCookieOptions, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax' });
  res.status(201).json({ success: true, data: { user } });
});

export const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.cookie('session', token, { ...sessionCookieOptions, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax' });
  res.json({ success: true, data: { user } });
});

export const logout = (_req, res) => {
  res.clearCookie('session', { ...sessionCookieOptions, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: undefined });
  res.json({ success: true, data: { message: 'Signed out.' } });
};

export const me = (req, res) => res.json({ success: true, data: { user: req.user } });
