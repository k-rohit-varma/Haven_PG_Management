import { AppError } from '../errors/AppError.js';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function dayInKolkata(value, { field = 'date', statusCode = 500 } = {}) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (isValidDateOnly(value)) return value;
    throw new AppError(statusCode, `Invalid ${field}; enter a valid calendar date.`, statusCode === 422 ? 'INVALID_DATE' : 'INVALID_STORED_DATE', { field });
  }
  const date = value instanceof Date ? value : (typeof value === 'string' || typeof value === 'number') ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new AppError(statusCode, `Invalid ${field}; a valid date is required.`, statusCode === 422 ? 'INVALID_DATE' : 'INVALID_STORED_DATE', { field });
  }
  return formatter.format(date);
}

export function parseLocalDate(value) {
  if (!isValidDateOnly(value)) throw new AppError(422, 'Enter a valid calendar date.', 'INVALID_DATE');
  return new Date(`${value}T00:00:00+05:30`);
}
