import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  AggregateNotFoundError,
  ConcurrencyConflictError,
  IdempotencyKeyMismatchError,
} from '../errors.js';

@Catch(ConcurrencyConflictError, AggregateNotFoundError, IdempotencyKeyMismatchError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost): void {
    const [statusCode, name] =
      error instanceof ConcurrencyConflictError
        ? ([409, 'Conflict'] as const)
        : error instanceof AggregateNotFoundError
          ? ([404, 'Not Found'] as const)
          : ([422, 'Unprocessable Entity'] as const);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: error.message, error: name });
  }
}
