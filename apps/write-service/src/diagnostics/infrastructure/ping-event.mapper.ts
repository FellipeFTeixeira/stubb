import {
  type AnyEventEnvelope,
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
} from '../domain/ping.events.js';

// Evento de domínio -> envelope V1 validado (o contrato público entre write e read).
export function toPingEnvelopes(events: readonly PingDomainEvent[]): AnyEventEnvelope[] {
  return events.map((event) => {
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
  });
}
