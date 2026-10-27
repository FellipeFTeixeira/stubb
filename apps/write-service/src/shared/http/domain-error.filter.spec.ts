import type { ArgumentsHost } from '@nestjs/common';
import { DomainErrorResponseSchema } from '@stubb/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  AggregateNotFoundError,
  BusinessRuleViolationError,
  ConcurrencyConflictError,
  EntityNotFoundError,
  IdempotencyKeyMismatchError,
} from '../errors.js';
import { DomainErrorFilter } from './domain-error.filter.js';

function run(error: Error) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new DomainErrorFilter().catch(error, host);
  const [responseBody] = json.mock.calls[0] as [unknown];
  return { status, body: DomainErrorResponseSchema.parse(responseBody) };
}

describe('DomainErrorFilter', () => {
  it('ConcurrencyConflictError -> 409 CONCURRENCY_CONFLICT', () => {
    const { status, body } = run(new ConcurrencyConflictError('x'));
    expect(status).toHaveBeenCalledWith(409);
    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'CONCURRENCY_CONFLICT',
    });
  });

  it('AggregateNotFoundError -> 404 AGGREGATE_NOT_FOUND', () => {
    const { status, body } = run(new AggregateNotFoundError('Ping not found'));
    expect(status).toHaveBeenCalledWith(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Ping not found',
      code: 'AGGREGATE_NOT_FOUND',
    });
  });

  it('EntityNotFoundError -> 404 ENTITY_NOT_FOUND', () => {
    const { status, body } = run(new EntityNotFoundError('Session not found'));
    expect(status).toHaveBeenCalledWith(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Session not found',
      code: 'ENTITY_NOT_FOUND',
    });
  });

  it('IdempotencyKeyMismatchError -> 422 IDEMPOTENCY_KEY_MISMATCH', () => {
    const { status, body } = run(new IdempotencyKeyMismatchError());
    expect(status).toHaveBeenCalledWith(422);
    expect(body).toMatchObject({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: 'IDEMPOTENCY_KEY_MISMATCH',
    });
  });

  it('BusinessRuleViolationError -> 422 com o code recebido', () => {
    const { status, body } = run(new BusinessRuleViolationError('SESSION_NOT_DRAFT', 'published'));
    expect(status).toHaveBeenCalledWith(422);
    expect(body).toEqual({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'published',
      code: 'SESSION_NOT_DRAFT',
    });
  });

  it('BusinessRuleViolationError sem mensagem usa o code como mensagem', () => {
    const { body } = run(new BusinessRuleViolationError('BATCH_ENDED'));
    expect(body.message).toBe('BATCH_ENDED');
  });
});
