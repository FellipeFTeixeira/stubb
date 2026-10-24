import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AggregateNotFoundError,
  ConcurrencyConflictError,
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
  return { status, json };
}

describe('DomainErrorFilter', () => {
  it('ConcurrencyConflictError -> 409', () => {
    const { status, json } = run(new ConcurrencyConflictError('x'));
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, error: 'Conflict' }),
    );
  });

  it('AggregateNotFoundError -> 404', () => {
    const { status, json } = run(new AggregateNotFoundError('Ping not found'));
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Ping not found',
      error: 'Not Found',
    });
  });

  it('IdempotencyKeyMismatchError -> 422', () => {
    const { status, json } = run(new IdempotencyKeyMismatchError());
    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });
});
