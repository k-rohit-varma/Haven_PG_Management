export class AppError extends Error {
  constructor(statusCode, message, code = 'REQUEST_FAILED', details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
