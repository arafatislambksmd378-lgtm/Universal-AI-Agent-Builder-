/** Typed application errors. Messages are safe to return to the client. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'bad_request', message, details);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'unauthorized', message);
}

export function forbidden(message = 'Not allowed'): AppError {
  return new AppError(403, 'forbidden', message);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, 'not_found', message);
}

export function conflict(message: string): AppError {
  return new AppError(409, 'conflict', message);
}

export function tooManyRequests(message = 'Too many requests', retryAfterSeconds = 60): AppError {
  return new AppError(429, 'rate_limited', message, { retryAfterSeconds });
}

export function unavailable(message = 'Service unavailable'): AppError {
  return new AppError(503, 'unavailable', message);
}

export function internal(message = 'Unexpected server error'): AppError {
  return new AppError(500, 'internal_error', message);
}
