import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { CommandErrorCode } from '@stubb/contracts';
import type { Response } from 'express';
import {
  AggregateNotFoundError,
  BusinessRuleViolationError,
  ConcurrencyConflictError,
  EntityNotFoundError,
  IdempotencyKeyMismatchError,
} from '../errors.js';

type DomainError =
  | BusinessRuleViolationError
  | EntityNotFoundError
  | AggregateNotFoundError
  | ConcurrencyConflictError
  | IdempotencyKeyMismatchError;

interface Mapped {
  statusCode: 404 | 409 | 422;
  error: 'Not Found' | 'Conflict' | 'Unprocessable Entity';
  code: CommandErrorCode;
}

function map(error: DomainError): Mapped {
  if (error instanceof BusinessRuleViolationError) {
    return { statusCode: 422, error: 'Unprocessable Entity', code: error.code };
  }
  if (error instanceof EntityNotFoundError) {
    return { statusCode: 404, error: 'Not Found', code: 'ENTITY_NOT_FOUND' };
  }
  if (error instanceof AggregateNotFoundError) {
    return { statusCode: 404, error: 'Not Found', code: 'AGGREGATE_NOT_FOUND' };
  }
  if (error instanceof ConcurrencyConflictError) {
    return { statusCode: 409, error: 'Conflict', code: 'CONCURRENCY_CONFLICT' };
  }
  return { statusCode: 422, error: 'Unprocessable Entity', code: 'IDEMPOTENCY_KEY_MISMATCH' };
}

@Catch(
  BusinessRuleViolationError,
  EntityNotFoundError,
  AggregateNotFoundError,
  ConcurrencyConflictError,
  IdempotencyKeyMismatchError,
)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const { statusCode, error: name, code } = map(error);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, error: name, message: error.message, code });
  }
}
