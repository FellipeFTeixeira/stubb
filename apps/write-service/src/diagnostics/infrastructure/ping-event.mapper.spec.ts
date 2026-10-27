import { PingCreatedV1Schema, PingIncrementedV1Schema } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { PingCreatedEvent, PingIncrementedEvent } from '../domain/ping.events.js';
import { toPingEnvelopes } from './ping-event.mapper.js';

const PING_ID = '0190f1a2-0000-7000-8000-000000000001';
const AT = new Date('2026-10-26T12:00:00.000Z');

describe('toPingEnvelopes', () => {
  it('PingCreated vira envelope V1 válido', () => {
    const [envelope] = toPingEnvelopes([new PingCreatedEvent(PING_ID, 'abc', 1, AT)]);
    const parsed = PingCreatedV1Schema.parse(envelope);
    expect(parsed.aggregateId).toBe(PING_ID);
    expect(parsed.aggregateVersion).toBe(1);
    expect(parsed.occurredAt).toBe(AT.toISOString());
    expect(parsed.payload).toEqual({ label: 'abc' });
  });

  it('PingIncremented vira envelope V1 válido', () => {
    const [envelope] = toPingEnvelopes([new PingIncrementedEvent(PING_ID, 3, 4, AT)]);
    const parsed = PingIncrementedV1Schema.parse(envelope);
    expect(parsed.aggregateVersion).toBe(4);
    expect(parsed.payload).toEqual({ count: 3 });
  });

  it('evento desconhecido lança', () => {
    expect(() =>
      toPingEnvelopes([
        { pingId: PING_ID, aggregateVersion: 1, occurredAt: AT } as unknown as PingCreatedEvent,
      ]),
    ).toThrow('Unsupported domain event');
  });
});
