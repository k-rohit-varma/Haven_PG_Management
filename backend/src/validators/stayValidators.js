import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
export { parseLocalDate } from '../utils/dateOnly.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a valid calendar date.');

export const hostelParamsSchema = z.object({ hostelId: objectId }).strict();
export const tenantParamsSchema = z.object({ tenantId: objectId }).strict();
export const stayParamsSchema = z.object({ stayId: objectId }).strict();

export const markLeftSchema = z.object({
  leavingDate: dateOnly,
  reason: z.string().trim().max(500).default(''),
}).strict();

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const stayPaginationSchema = z.object({
  ...paginationFields,
  status: z.enum(['ACTIVE', 'LEFT', 'CANCELLED']).optional(),
  search: z.string().trim().max(100).optional(),
  hostelId: objectId.optional(),
  roomId: objectId.optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
}).strict();

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.join('.') || 'request';
      return next(new AppError(422, `Invalid ${field}: ${issue?.message || 'check the submitted value.'}`, 'VALIDATION_ERROR', parsed.error.flatten()));
    }
    req[source] = parsed.data;
    next();
  };
}
