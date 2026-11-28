export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', message, details);
export const validationFailed = (details: unknown, message = 'Validation failed.') =>
  new HttpError(422, 'VALIDATION_FAILED', message, details);
export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHORIZED') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action.', details?: unknown) =>
  new HttpError(403, 'FORBIDDEN', message, details);
export const notFound = (message = 'Resource not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'CONFLICT', message, details);
export const tooMany = (message = 'Too many requests. Please retry later.') =>
  new HttpError(429, 'RATE_LIMITED', message);
