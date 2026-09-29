import type { ZodError } from 'zod';

/** Thrown when a request body or query fails shared zod validation. Mapped to HTTP 400. */
export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(public readonly zodError: ZodError, message = 'validation_failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Mapped to HTTP 404. */
export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(what = 'resource') {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

/** Mapped to HTTP 400 for semantic (non-schema) problems, e.g. a video kind that does not match the route. */
export class BadRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}
