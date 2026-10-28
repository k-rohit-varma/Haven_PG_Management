import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a valid calendar date.');
const phone = z.string().trim().transform((value, ctx) => {
  const normalized = normalizeIndianPhone(value);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'Enter a valid Indian mobile number.' });
  return normalized;
});
const email = z.union([z.literal(''), z.string().trim().email().max(254)]).optional().transform((value) => value ? value.toLowerCase() : undefined);
const pageFields = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(24) };

export const tenantListQuery = z.object({
  ...pageFields, search: z.string().trim().max(100).optional(), hostelId: objectId.optional(), roomId: objectId.optional(),
  status: z.enum(['ACTIVE', 'LEFT', 'NO_STAY']).optional(),
}).strict();
export const tenantParams = z.object({ tenantId: objectId }).strict();
export const stayParams = z.object({ stayId: objectId }).strict();
export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(100), phone, email,
  emergencyContact: z.string().trim().max(100).optional().default(''), notes: z.string().trim().max(2000).optional().default(''),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
  hostelId: objectId, roomId: objectId, moveInDate: dateOnly,
  agreedMonthlyRentPaise: z.number().int().min(1).max(100000000), securityDepositPaise: z.number().int().min(0).max(100000000),
}).strict();
export const rejoinTenantSchema = z.object({
  hostelId: objectId, roomId: objectId, moveInDate: dateOnly,
  agreedMonthlyRentPaise: z.number().int().min(1).max(100000000), securityDepositPaise: z.number().int().min(0).max(100000000),
}).strict();
export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(), phone: phone.optional(), email,
  emergencyContact: z.string().trim().max(100).optional(), notes: z.string().trim().max(2000).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field.');
export const updateRentSchema = z.object({
  monthlyRentPaise: z.number().int().min(1).max(100000000), effectiveDate: dateOnly,
  reason: z.string().trim().max(500).optional().default(''),
}).strict();

export function validateTenant(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return next(new AppError(422, `Invalid ${issue?.path?.join('.') || 'request'}: ${issue?.message || 'check the submitted value.'}`, 'VALIDATION_ERROR', parsed.error.flatten()));
    }
    req[source] = parsed.data;
    next();
  };
}
