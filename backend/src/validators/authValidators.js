import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { normalizeIndianPhone } from '../utils/phoneNumbers.js';

const indianPhone = z.string().trim().transform((value, ctx) => {
  const phone = normalizeIndianPhone(value);
  if (!phone) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number.' });
  return phone;
});
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(10).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100), phone: indianPhone, password,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).default('PREFER_NOT_TO_SAY'),
}).strict();

export const loginSchema = z.object({
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(72),
}).strict().superRefine(({ phone, email: emailValue }, ctx) => {
  if ([phone, emailValue].filter((value) => value !== undefined).length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'Enter one phone number or email address.', path: ['phone'] });
    return;
  }
  if (phone !== undefined && !normalizeIndianPhone(phone)) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number.', path: ['phone'] });
  if (emailValue !== undefined && !email.safeParse(emailValue).success) ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.', path: ['email'] });
}).transform(({ phone, email: emailValue, password: passwordValue }) => ({
  login: phone !== undefined ? { phone: normalizeIndianPhone(phone) } : { email: emailValue.trim().toLowerCase() }, password: passwordValue,
}));

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(new AppError(422, 'Please check the submitted information.', 'VALIDATION_ERROR', parsed.error.flatten()));
    req[source] = parsed.data;
    next();
  };
}
