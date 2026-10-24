import { Injectable } from '@nestjs/common';
import {
  BOUNDED_CONTEXT_DIAGNOSTICS,
  PING_AGGREGATE_TYPE,
  PING_EVENT_TYPES,
  PingCreatedV1Schema,
  PingIncrementedV1Schema,
} from '@stubb/contracts';
import { v7 } from 'uuid';
import {
  PingCreatedEvent,
  PingIncrementedEvent,
  type PingDomainEvent,
} from '../../diagnostics/domain/ping.events.js';
import { TransactionContext } from '../transaction/transaction-context.js';
import { OutboxEntity } from './outbox.entity.js';

@Injectable()
export class OutboxWriter {
  constructor(private readonly transactionContext: TransactionContext) {}

  async append(events: readonly PingDomainEvent[]): Promise<void> {
    for (const event of events) {
      const envelope = this.toEnvelope(event);
      await this.transactionContext.manager().insert(OutboxEntity, {
        id: envelope.eventId,
        boundedContext: BOUNDED_CONTEXT_DIAGNOSTICS,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
        eventType: envelope.eventType,
        schemaVersion: envelope.schemaVersion,
        occurredAt: event.occurredAt,
        payload: envelope as unknown as Record<string, never>,
      });
    }
  }

  private toEnvelope(event: PingDomainEvent) {
    const base = {
      eventId: v7(),
      schemaVersion: 1 as const,
      aggregateType: PING_AGGREGATE_TYPE,
      aggregateId: event.pingId,
      aggregateVersion: event.aggregateVersion,
      occurredAt: event.occurredAt.toISOString(),
      correlationId: null,
      causationId: null,
    };
    if (event instanceof PingCreatedEvent) {
      return PingCreatedV1Schema.parse({
        ...base,
        eventType: PING_EVENT_TYPES.created,
        payload: { label: event.label },
      });
    }
    if (event instanceof PingIncrementedEvent) {
      return PingIncrementedV1Schema.parse({
        ...base,
        eventType: PING_EVENT_TYPES.incremented,
        payload: { count: event.count },
      });
    }
    throw new Error('Unsupported domain event');
  }
}
