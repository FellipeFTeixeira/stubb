import { describe, expect, it } from 'vitest';
import { DiagnosticsEventSchema, PingCreatedV1Schema, PingIncrementedV1Schema } from '../index.js';

const base = {
  eventId: '018f4c1e-7b3a-7c2d-9e1f-0a1b2c3d4e5f',
  schemaVersion: 1,
  aggregateType: 'Ping',
  aggregateId: '018f4c1e-7b3a-7c2d-9e1f-0a1b2c3d4e60',
  occurredAt: '2026-10-24T12:00:00.000Z',
  correlationId: null,
  causationId: null,
};
const created = { ...base, eventType: 'PingCreated', aggregateVersion: 1, payload: { label: 'x' } };
const incremented = {
  ...base,
  eventType: 'PingIncremented',
  aggregateVersion: 2,
  payload: { count: 1 },
};
const without = (key: keyof typeof created) =>
  Object.fromEntries(Object.entries(created).filter(([k]) => k !== key));

describe('eventos de diagnostics', () => {
  it('aceita eventos completos', () => {
    expect(PingCreatedV1Schema.safeParse(created).success).toBe(true);
    expect(PingIncrementedV1Schema.safeParse(incremented).success).toBe(true);
  });

  it('discrimina por eventType', () => {
    expect(DiagnosticsEventSchema.parse(created).eventType).toBe('PingCreated');
    expect(DiagnosticsEventSchema.parse(incremented).eventType).toBe('PingIncremented');
  });

  it.each([
    ['sem eventId', without('eventId')],
    ['eventType desconhecido', { ...created, eventType: 'Other' }],
    ['schemaVersion 2', { ...created, schemaVersion: 2 }],
    ['aggregateVersion 0', { ...created, aggregateVersion: 0 }],
    ['PingCreated com aggregateVersion 2', { ...created, aggregateVersion: 2 }],
    ['occurredAt inválido', { ...created, occurredAt: 'ontem' }],
    ['sem correlationId', without('correlationId')],
    ['count 0', { ...incremented, payload: { count: 0 } }],
  ])('DiagnosticsEventSchema rejeita %s', (_name, input) => {
    expect(DiagnosticsEventSchema.safeParse(input).success).toBe(false);
  });
});
