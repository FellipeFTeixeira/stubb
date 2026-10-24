import { z } from 'zod';
import { uuidSchema } from '../shared/schemas.js';

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
