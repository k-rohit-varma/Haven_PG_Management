import { env } from '../config/environment.js';

const sharedCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function getCookieOptions(options = {}) {
  return { ...sharedCookieOptions, ...options };
}

export function getClearCookieOptions(options = {}) {
  const { maxAge: _maxAge, ...clearOptions } = getCookieOptions(options);
  return clearOptions;
}
