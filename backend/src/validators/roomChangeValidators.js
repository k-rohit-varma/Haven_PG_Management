import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const pagination = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() };
export const roomChangeParams = z.object({ requestId: objectId }).strict();
export const createRoomChangeSchema = z.object({ stayId: objectId, requestedRoomId: objectId, reason: z.string().trim().min(3).max(1000) }).strict();
export const roomChangeQuery = z.object(pagination).strict();
export const roomChangeDecision = z.discriminatedUnion('decision', [z.object({ decision: z.literal('APPROVED') }).strict(), z.object({ decision: z.literal('REJECTED'), reason: z.string().trim().min(3).max(500) }).strict()]);
export function validateRoomChange(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}
