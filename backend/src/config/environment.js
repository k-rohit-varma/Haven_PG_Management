import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.string().url().refine((value) => new URL(value).origin === value, 'CLIENT_URL must be an origin without a path or trailing slash.'),
  COOKIE_SECRET: z.string().min(32),
  JOB_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.string().default('info'),
  ADMIN_NAME: z.string().trim().min(2).max(100).optional(),
  ADMIN_PHONE: z.string().trim().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;

const hasAdminConfig = Boolean(env.ADMIN_NAME || env.ADMIN_PHONE || env.ADMIN_PASSWORD);
if (env.NODE_ENV === 'production' && (!env.ADMIN_NAME || !env.ADMIN_PHONE || !env.ADMIN_PASSWORD)) {
  throw new Error('Production requires ADMIN_NAME, ADMIN_PHONE, and ADMIN_PASSWORD to be configured.');
}
if (hasAdminConfig) {
  const { normalizeIndianPhone } = await import('../utils/phoneNumbers.js');
  if (!env.ADMIN_NAME || !normalizeIndianPhone(env.ADMIN_PHONE || '') || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,72}$/.test(env.ADMIN_PASSWORD || '')) {
    throw new Error('Admin configuration is invalid. Set ADMIN_NAME, a valid Indian ADMIN_PHONE, and a strong ADMIN_PASSWORD (10–72 characters, upper/lowercase and a number).');
  }
  if (env.NODE_ENV === 'production' && env.ADMIN_PASSWORD === 'ChangeThisAdminPassword123!') {
    throw new Error('Replace the example ADMIN_PASSWORD before starting in production.');
  }
}
