import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { extractIdempotencyKey } from './idempotency-key.decorator.js';

function contextWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function catchError(headers: Record<string, string>): BadRequestException {
  try {
    extractIdempotencyKey(undefined, contextWith(headers));
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('expected extractIdempotencyKey to throw');
}

describe('extractIdempotencyKey', () => {
  it('lança 400 IDEMPOTENCY_KEY_INVALID quando o header está ausente', () => {
    const error = catchError({});
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Idempotency-Key header is required and must be a UUID',
      code: 'IDEMPOTENCY_KEY_INVALID',
    });
  });

  it('lança 400 quando não é UUID', () => {
    expect(catchError({ 'idempotency-key': 'abc' })).toBeInstanceOf(BadRequestException);
  });

  it('devolve a chave quando é UUID', () => {
    const key = '0190f1a2-0000-7000-8000-000000000001';
    expect(extractIdempotencyKey(undefined, contextWith({ 'idempotency-key': key }))).toBe(key);
  });
});
