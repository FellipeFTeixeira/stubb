import { z } from 'zod';
import { uuidSchema } from '../shared/schemas.js';

/** Envelope sem tipagem de payload, usado por infraestrutura que não conhece o domínio (ex.: OutboxWriter). */
export interface AnyEventEnvelope {
  eventId: string;
  eventType: string;
  schemaVersion: 1;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string | null;
  causationId: string | null;
  payload: unknown;
}

export function createEventEnvelopeSchema<
  const TEvent extends string,
  const TAggregate extends string,
  TPayload extends z.ZodType,
>(eventType: TEvent, aggregateType: TAggregate, payloadSchema: TPayload) {
  return z.object({
    eventId: uuidSchema,
    eventType: z.literal(eventType),
    schemaVersion: z.literal(1),
    aggregateType: z.literal(aggregateType),
    aggregateId: uuidSchema,
    aggregateVersion: z.number().int().min(1),
    occurredAt: z.iso.datetime(),
    correlationId: uuidSchema.nullable(),
    causationId: uuidSchema.nullable(),
    payload: payloadSchema,
  });
}
