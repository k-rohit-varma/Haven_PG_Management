import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const textList = z.array(z.string().trim().min(1).max(60)).max(30);
const hostelFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  facilities: textList.default([]),
  images: z.array(z.string().url().max(500)).max(12).default([]),
  accommodationPolicy: z.enum(['MIXED', 'MALE_ONLY', 'FEMALE_ONLY']),
  contactPhone: z.string().trim().max(30).default(''),
};

export const createHostelSchema = z.object({ ...hostelFields, ownerId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict();
export const assignHostelOwnerSchema = z.object({ ownerId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const updateHostelSchema = z.object({
  name: hostelFields.name.optional(), description: z.string().trim().max(2000).optional(),
  address: hostelFields.address.optional(), city: hostelFields.city.optional(),
  facilities: textList.optional(), images: z.array(z.string().url().max(500)).max(12).optional(),
  accommodationPolicy: hostelFields.accommodationPolicy.optional(), contactPhone: z.string().trim().max(30).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

const roomFields = {
  identifier: z.string().trim().min(1).max(30),
  sharingType: z.number().int().min(1).max(20),
  maxCapacity: z.number().int().min(1).max(20),
  genderEligibility: z.enum(['ANY', 'MALE', 'FEMALE']),
  defaultRentPaise: z.number().int().min(0).max(100000000),
  facilities: textList.default([]),
  notes: z.string().trim().max(500).default(''),
};
export const createRoomSchema = z.object(roomFields).strict().refine((value) => value.sharingType <= value.maxCapacity, { path: ['maxCapacity'], message: 'Capacity cannot be below sharing type.' });
export const updateRoomSchema = z.object({
  identifier: roomFields.identifier.optional(), sharingType: roomFields.sharingType.optional(),
  maxCapacity: roomFields.maxCapacity.optional(), genderEligibility: roomFields.genderEligibility.optional(),
  defaultRentPaise: roomFields.defaultRentPaise.optional(), facilities: textList.optional(),
  notes: z.string().trim().max(500).optional(), isActive: z.boolean().optional(), reason: z.string().trim().max(300).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'reason'), 'Provide at least one field to update.');

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
  city: z.string().trim().max(100).optional(), search: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).optional(),
}).strict();

export const roomListQuerySchema = listQuerySchema.extend({
  active: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(30).optional(),
  genderEligibility: z.enum(['ANY', 'MALE', 'FEMALE']).optional(),
  sharingType: z.coerce.number().int().min(1).max(20).optional(),
  minCapacity: z.coerce.number().int().min(1).max(20).optional(),
  maxCapacity: z.coerce.number().int().min(1).max(20).optional(),
  minRentPaise: z.coerce.number().int().min(0).max(100000000).optional(),
  maxRentPaise: z.coerce.number().int().min(0).max(100000000).optional(),
  minAvailableBeds: z.coerce.number().int().min(0).max(20).optional(),
  availability: z.enum(['AVAILABLE', 'PARTIAL', 'FULL', 'INACTIVE']).optional(),
  sortBy: z.enum(['identifier_asc', 'identifier_desc', 'rent_asc', 'rent_desc', 'available_desc', 'occupancy_desc', 'created_desc']).default('identifier_asc'),
}).strict().refine((query) => query.minCapacity === undefined || query.maxCapacity === undefined || query.minCapacity <= query.maxCapacity, { path: ['maxCapacity'], message: 'Maximum capacity must be at least minimum capacity.' }).refine((query) => query.minRentPaise === undefined || query.maxRentPaise === undefined || query.minRentPaise <= query.maxRentPaise, { path: ['maxRentPaise'], message: 'Maximum rent must be at least minimum rent.' });

export const objectIdSchema = z.object({ hostelId: z.string().regex(/^[a-f\d]{24}$/i).optional(), roomId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).passthrough();

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}
