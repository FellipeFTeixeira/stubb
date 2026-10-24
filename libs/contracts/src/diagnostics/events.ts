import { z } from 'zod';
import { createEventEnvelopeSchema } from '../events/envelope.js';
import { PING_AGGREGATE_TYPE, PING_EVENT_TYPES } from './constants.js';
import { pingLabelSchema } from './http.js';

export const PingCreatedV1Schema = createEventEnvelopeSchema(
  PING_EVENT_TYPES.created,
  PING_AGGREGATE_TYPE,
  z.object({ label: pingLabelSchema }),
).extend({ aggregateVersion: z.literal(1) });

export const PingIncrementedV1Schema = createEventEnvelopeSchema(
  PING_EVENT_TYPES.incremented,
  PING_AGGREGATE_TYPE,
  z.object({ count: z.number().int().min(1) }),
);

export const DiagnosticsEventSchema = z.discriminatedUnion('eventType', [
  PingCreatedV1Schema,
  PingIncrementedV1Schema,
]);

export type PingCreatedV1 = z.infer<typeof PingCreatedV1Schema>;
export type PingIncrementedV1 = z.infer<typeof PingIncrementedV1Schema>;
export type DiagnosticsEvent = z.infer<typeof DiagnosticsEventSchema>;
