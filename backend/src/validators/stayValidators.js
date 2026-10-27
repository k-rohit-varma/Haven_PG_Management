import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a valid calendar date.');

export const createApplicationSchema = z.object({ hostelId: objectId }).strict();
export const applicationParamsSchema = z.object({ applicationId: objectId }).strict();
export const hostelParamsSchema = z.object({ hostelId: objectId }).strict();
export const tenantParamsSchema = z.object({ tenantId: objectId }).strict();
export const stayParamsSchema = z.object({ stayId: objectId }).strict();

export const rejectApplicationSchema = z.object({
  decision: z.literal('REJECTED'),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const assignStaySchema = z.object({
  roomId: objectId,
  moveInDate: dateOnly,
  agreedMonthlyRentPaise: z.number().int().min(1).max(100000000),
  securityDepositPaise: z.number().int().min(0).max(100000000),
}).strict();

export const markLeftSchema = z.object({
  leavingDate: dateOnly,
  reason: z.string().trim().max(500).default(''),
}).strict();

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const applicationPaginationSchema = z.object({ ...paginationFields, status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() }).strict();
export const stayPaginationSchema = z.object({ ...paginationFields, status: z.enum(['ACTIVE', 'LEFT', 'CANCELLED']).optional() }).strict();

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}

export function parseLocalDate(dateOnlyValue) {
  return new Date(`${dateOnlyValue}T00:00:00+05:30`);
}
