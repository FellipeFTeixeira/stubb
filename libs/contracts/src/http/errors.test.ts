import { describe, expect, it } from 'vitest';
import {
  COMMAND_ERROR_CODES,
  CommandAcceptedSchema,
  DomainErrorResponseSchema,
  EntityCommandAcceptedSchema,
  ValidationErrorResponseSchema,
  instantSchema,
} from '../index.js';

describe('erros de command', () => {
  it('tem 40 códigos sem repetição', () => {
    expect(COMMAND_ERROR_CODES).toHaveLength(40);
    expect(new Set(COMMAND_ERROR_CODES).size).toBe(40);
  });

  it.each([
    [401, 'Unauthorized', 'UNAUTHENTICATED'],
    [409, 'Conflict', 'ORGANIZER_REQUEST_NOT_PENDING'],
  ])('aceita o corpo %i com o código novo %s', (statusCode, error, code) => {
    const body = { statusCode, error, message: 'x', code };
    expect(DomainErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  it('valida um corpo 400 de validação', () => {
    const body = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'name', message: 'Campo obrigatório' }],
    };
    expect(ValidationErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  it('valida um corpo 422 de domínio e rejeita code desconhecido', () => {
    const body = {
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'x',
      code: 'BATCH_NAME_TAKEN',
    };
    expect(DomainErrorResponseSchema.safeParse(body).success).toBe(true);
    expect(DomainErrorResponseSchema.safeParse({ ...body, code: 'NOPE' }).success).toBe(false);
  });
});

describe('CommandAccepted', () => {
  const id = '018f4c1e-7b3a-7c2d-9e1f-0a1b2c3d4e5f';
  it('aceita com e sem entityId', () => {
    expect(CommandAcceptedSchema.safeParse({ id, version: 1 }).success).toBe(true);
    expect(EntityCommandAcceptedSchema.safeParse({ id, version: 2, entityId: id }).success).toBe(
      true,
    );
    expect(EntityCommandAcceptedSchema.safeParse({ id, version: 2 }).success).toBe(false);
  });
});

describe('instantSchema', () => {
  it.each(['2026-12-10T23:00:00Z', '2026-12-10T20:00:00-03:00', '2026-12-10T23:00:00.000Z'])(
    'aceita %s',
    (v) => {
      expect(instantSchema.safeParse(v).success).toBe(true);
    },
  );
  it('rejeita sem fuso', () => {
    expect(instantSchema.safeParse('2026-12-10T20:00:00').success).toBe(false);
  });
});
