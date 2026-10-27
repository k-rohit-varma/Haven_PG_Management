import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

export function notFound(_req, _res, next) {
  next(new AppError(404, 'The requested resource was not found.', 'NOT_FOUND'));
}

export function errorHandler(error, req, res, _next) {
  const known = error instanceof AppError;
  const validation = error.name === 'ValidationError' || error.name === 'CastError' || error instanceof SyntaxError;
  const status = known ? error.statusCode : error.code === 11000 ? 409 : validation ? 422 : 500;
  const message = known ? error.message : error.code === 11000 ? 'A record with these details already exists.' : validation ? 'Please check the submitted information.' : 'An unexpected error occurred.';
  const requestId = req.id;
  const level = status >= 500 ? 'error' : status === 403 || status === 401 ? 'warn' : 'info';
  const route = `${req.baseUrl || ''}${req.route?.path || req.path}`;
  logger[level]({ event: 'request_error', operation: 'express_error_handler', requestId, method: req.method, route, statusCode: status, userId: req.user?._id?.toString(), role: req.user?.role, errorName: error.name, errorMessage: error.message, ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }) });
  res.status(status).json({ success: false, error: { code: known ? error.code : error.code === 11000 ? 'DUPLICATE_RECORD' : validation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message, ...(known && error.details ? { details: error.details } : {}) }, requestId });
}
