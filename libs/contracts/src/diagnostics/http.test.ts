import { describe, expect, it } from 'vitest';
import { CreatePingRequestSchema, idempotencyKeySchema, minVersionSchema } from '../index.js';

describe('CreatePingRequestSchema', () => {
  it('apara espaços', () => {
    expect(CreatePingRequestSchema.parse({ label: '  abc  ' })).toEqual({ label: 'abc' });
  });
  it('aceita 50 caracteres', () => {
    expect(CreatePingRequestSchema.safeParse({ label: 'a'.repeat(50) }).success).toBe(true);
  });
  it('rejeita ausente', () => {
    expect(CreatePingRequestSchema.safeParse({}).success).toBe(false);
  });
  it.each(['', '   '])('rejeita %j com mensagem em PT-BR', (label) => {
    const r = CreatePingRequestSchema.safeParse({ label });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Informe um rótulo');
  });
  it('rejeita 51 caracteres', () => {
    const r = CreatePingRequestSchema.safeParse({ label: 'a'.repeat(51) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Use no máximo 50 caracteres');
  });
});

describe('minVersionSchema', () => {
  it('converte string', () => {
    expect(minVersionSchema.parse('3')).toBe(3);
  });
  it.each(['0', '-1', '1.5', 'x'])('rejeita %j', (v) => {
    expect(minVersionSchema.safeParse(v).success).toBe(false);
  });
});

describe('idempotencyKeySchema', () => {
  it('rejeita não-uuid', () => {
    expect(idempotencyKeySchema.safeParse('abc').success).toBe(false);
  });
  it('aceita uuid v7', () => {
    expect(idempotencyKeySchema.safeParse('018f4c1e-7b3a-7c2d-9e1f-0a1b2c3d4e5f').success).toBe(
      true,
    );
  });
});
