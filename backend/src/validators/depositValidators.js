import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a valid calendar date.');
export const depositParamsSchema = z.object({ stayId: objectId }).strict();
export const depositQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export const createDepositSchema = z.object({
  type: z.enum(['RECEIVED', 'REFUND', 'DEDUCTION', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT']),
  amountPaise: z.number().int().min(1).max(100000000), transactionDate: dateOnly,
  reference: z.string().trim().max(100).optional(), reason: z.string().trim().min(3).max(500),
}).strict();

export function validateDeposit(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}
