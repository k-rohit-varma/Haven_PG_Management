import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a valid calendar date.');
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const boolQuery = z.enum(['true', 'false']).transform((value) => value === 'true').optional();

export const adminUserQuerySchema = z.object({ ...pagination, role: z.enum(['ADMIN', 'OWNER', 'TENANT']).optional(), isActive: boolQuery, isDeleted: boolQuery, includeDeleted: boolQuery, search: z.string().trim().max(100).optional() }).strict();
export const adminHostelQuerySchema = z.object({ ...pagination, isActive: boolQuery, includeDeleted: boolQuery }).strict();
export const adminRoomQuerySchema = z.object({
  ...pagination, hostelId: objectId.optional(), isActive: boolQuery, includeDeleted: boolQuery,
  search: z.string().trim().max(30).optional(), genderEligibility: z.enum(['ANY', 'MALE', 'FEMALE']).optional(),
  sharingType: z.coerce.number().int().min(1).max(12).optional(),
  minCapacity: z.coerce.number().int().min(1).max(12).optional(), maxCapacity: z.coerce.number().int().min(1).max(12).optional(),
  minRentPaise: z.coerce.number().int().min(0).max(100000000).optional(), maxRentPaise: z.coerce.number().int().min(0).max(100000000).optional(),
  minAvailableBeds: z.coerce.number().int().min(0).max(12).optional(), availability: z.enum(['AVAILABLE', 'PARTIAL', 'FULL', 'INACTIVE']).optional(),
  sortBy: z.enum(['identifier_asc', 'identifier_desc', 'rent_asc', 'rent_desc', 'available_desc', 'occupancy_desc', 'created_desc']).default('identifier_asc'),
}).strict().refine((query) => query.minCapacity === undefined || query.maxCapacity === undefined || query.minCapacity <= query.maxCapacity, { path: ['maxCapacity'], message: 'Maximum capacity must be at least minimum capacity.' }).refine((query) => query.minRentPaise === undefined || query.maxRentPaise === undefined || query.minRentPaise <= query.maxRentPaise, { path: ['maxRentPaise'], message: 'Maximum rent must be at least minimum rent.' });
export const auditQuerySchema = z.object({ ...pagination, entityType: z.enum(['USER', 'HOSTEL', 'ROOM', 'STAY', 'TENANT_APPLICATION', 'RENT_DUE', 'PAYMENT', 'RENT_CHANGE_REQUEST', 'DEPOSIT_TRANSACTION']).optional(), entityId: objectId.optional(), actorId: objectId.optional(), action: z.string().trim().max(100).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).strict().refine(({ from, to }) => !from || !to || from <= to, { path: ['to'], message: 'End date must be after start date.' });
export const adminUserParamsSchema = z.object({ userId: objectId }).strict();
export const adminStayParamsSchema = z.object({ stayId: objectId }).strict();
export const restoreParamsSchema = z.object({ entityType: z.enum(['USER', 'HOSTEL', 'ROOM']), entityId: objectId }).strict();
export const userStatusSchema = z.object({ isActive: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict();
const identifier = z.string().trim().min(3).max(254).transform((value, ctx) => {
  if (value.includes('@')) {
    const parsed = z.string().email().max(254).safeParse(value);
    if (!parsed.success) ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.' });
    return { email: parsed.success ? parsed.data.toLowerCase() : undefined };
  }
  const phone = normalizeIndianPhone(value);
  if (!phone) ctx.addIssue({ code: 'custom', message: 'Enter a valid Indian mobile number or email address.' });
  return { phone };
});
export const createOwnerSchema = z.object({ name: z.string().trim().min(2).max(100), identifier, temporaryPassword: z.string().min(10).max(72).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/), reason: z.string().trim().min(3).max(500) }).strict().transform(({ identifier: contact, ...rest }) => ({ ...rest, ...contact }));
export const restoreSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export const userRoleSchema = z.object({ role: z.enum(['ADMIN', 'OWNER', 'TENANT']), reason: z.string().trim().max(500).default('') }).strict();
export const financialCorrectionSchema = z.object({
  moveInDate: dateOnly.optional(),
  agreedMonthlyRentPaise: z.number().int().min(1).max(100000000).optional(),
  depositAdjustmentPaise: z.number().int().min(-100000000).max(100000000).refine((value) => value !== 0).optional(),
  reason: z.string().trim().min(5).max(1000),
}).strict().refine(({ moveInDate, agreedMonthlyRentPaise, depositAdjustmentPaise }) => moveInDate !== undefined || agreedMonthlyRentPaise !== undefined || depositAdjustmentPaise !== undefined, 'Select at least one financial term to correct.');

export function validateAdmin(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}
