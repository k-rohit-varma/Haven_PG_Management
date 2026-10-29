import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a valid calendar date.');
const monthOnly = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const boolQuery = z.enum(['true', 'false']).transform((value) => value === 'true').optional();

export const rentQuerySchema = z.object({ ...pagination, status: z.enum(['UPCOMING', 'PAYMENT_PENDING', 'PAID', 'PAID_LATE', 'OVERDUE', 'PARTIALLY_PAID']).optional(), overdueOnly: boolQuery, hostelId: objectId.optional(), month: monthOnly.optional(), search: z.string().trim().min(2).max(80).optional() }).strict();
export const dashboardQuerySchema = z.object({ month: monthOnly.optional() }).strict();
export const paymentQuerySchema = z.object({ ...pagination, status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), hostelId: objectId.optional(), rentDueId: objectId.optional(), month: monthOnly.optional(), search: z.string().trim().min(2).max(80).optional() }).strict();
export const rentDueParamsSchema = z.object({ rentDueId: objectId }).strict();
export const paymentParamsSchema = z.object({ paymentId: objectId }).strict();
export const recordPaymentSchema = z.object({
  rentDueId: objectId,
  idempotencyKey: z.string().uuid(),
  amountPaise: z.number().int().min(1).max(100000000),
  paidOn: dateOnly,
  method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  transactionReference: z.string().trim().max(100).optional(),
}).strict();
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}
