import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { extractIdempotencyKey } from './idempotency-key.decorator.js';

function contextWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('extractIdempotencyKey', () => {
  it('lança 400 quando o header está ausente', () => {
    expect(() => extractIdempotencyKey(undefined, contextWith({}))).toThrow(BadRequestException);
  });

  it('lança 400 quando não é UUID', () => {
    expect(() =>
      extractIdempotencyKey(undefined, contextWith({ 'idempotency-key': 'abc' })),
    ).toThrow(BadRequestException);
  });

  it('devolve a chave quando é UUID', () => {
    const key = '0190f1a2-0000-7000-8000-000000000001';
    expect(extractIdempotencyKey(undefined, contextWith({ 'idempotency-key': key }))).toBe(key);
  });
});
