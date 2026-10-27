import type { AnyEventEnvelope } from '@stubb/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionContext } from '../transaction/transaction-context.js';
import { OutboxEntity } from './outbox.entity.js';
import { OutboxWriter } from './outbox-writer.js';

describe('OutboxWriter', () => {
  it('grava cada envelope inteiro como payload, com occurred_at e contexto', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const context = { manager: () => ({ insert }) } as unknown as TransactionContext;
    const envelope: AnyEventEnvelope = {
      eventId: '0190f1a2-0000-7000-8000-000000000010',
      eventType: 'Anything',
      schemaVersion: 1,
      aggregateType: 'Thing',
      aggregateId: '0190f1a2-0000-7000-8000-000000000011',
      aggregateVersion: 3,
      occurredAt: '2026-10-26T12:00:00.000Z',
      correlationId: null,
      causationId: null,
      payload: { a: 1 },
    };

    await new OutboxWriter(context).append('some-context', [envelope]);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(OutboxEntity, {
      id: envelope.eventId,
      boundedContext: 'some-context',
      aggregateType: 'Thing',
      aggregateId: envelope.aggregateId,
      aggregateVersion: 3,
      eventType: 'Anything',
      schemaVersion: 1,
      occurredAt: new Date('2026-10-26T12:00:00.000Z'),
      payload: envelope,
    });
  });
});
