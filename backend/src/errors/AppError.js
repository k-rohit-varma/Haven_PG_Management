export class AppError extends Error {
  constructor(statusCode, message, code = 'REQUEST_FAILED', details, cause) {
    super(message, cause ? { cause } : undefined);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
