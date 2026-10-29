import { randomBytes, timingSafeEqual } from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sessionCookieOptions } from '../utils/cookies.js';
import { env } from '../config/environment.js';
import { AppError } from '../errors/AppError.js';
import * as authService from '../services/authService.js';
import { logger } from '../utils/logger.js';

const allowedClientOrigin = new URL(env.CLIENT_URL).origin || 'https://haven-pg-management-frontend.onrender.com';

function rejectOrigin(req, next) {
  const origin = req.get('origin');
  if (!origin || origin === allowedClientOrigin) return false;
  logger.warn({ event: 'csrf_validation_failed', reason: 'origin_rejected', requestId: req.id, method: req.method, route: req.path, origin: origin.slice(0, 200), fetchSite: req.get('sec-fetch-site') });
  next(new AppError(403, 'This request origin is not allowed.', 'CSRF_ORIGIN_REJECTED'));
  return true;
}

function logCsrfFailure(req, reason) {
  const origin = req.get('origin');
  logger.warn({ event: 'csrf_validation_failed', reason, requestId: req.id, method: req.method, route: req.path, ...(origin ? { origin: origin.slice(0, 200) } : {}), fetchSite: req.get('sec-fetch-site') });
}

export const csrfToken = (req, res, next) => {
  if (rejectOrigin(req, next)) return;
  const token = randomBytes(32).toString('hex');
  res.cookie('csrf', token, { ...sessionCookieOptions, httpOnly: true, signed: true });
  res.json({ success: true, data: { csrfToken: token } });
};

export function csrfProtection(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (rejectOrigin(req, next)) return;
  const cookie = req.signedCookies?.csrf;
  const header = req.get('x-csrf-token');
  let failureReason;
  if (typeof header !== 'string' || !header) failureReason = 'missing_header';
  else if (cookie === false) failureReason = 'invalid_signed_cookie';
  else if (typeof cookie !== 'string') failureReason = 'missing_cookie';
  else if (cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) failureReason = 'token_mismatch';
  if (failureReason) {
    logCsrfFailure(req, failureReason);
    return next(new AppError(403, 'Refresh the page and try again.', 'CSRF_VALIDATION_FAILED'));
  }
  next();
}

export const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.cookie('session', token, sessionCookieOptions);
  res.json({ success: true, data: { user } });
});

export const logout = (_req, res) => {
  res.clearCookie('session', { ...sessionCookieOptions, maxAge: undefined });
  res.json({ success: true, data: { message: 'Signed out.' } });
};

export const me = (req, res) => res.json({ success: true, data: { user: req.user } });
