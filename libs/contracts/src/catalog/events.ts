import { z } from 'zod';
import { createEventEnvelopeSchema } from '../events/envelope.js';
import { instantSchema, uuidSchema } from '../shared/schemas.js';
import {
  AGE_RATINGS,
  BRAZIL_STATES,
  BRAZIL_TIME_ZONES,
  CATALOG_EVENT_TYPES,
  EVENT_AGGREGATE_TYPE,
  EVENT_CATEGORIES,
  VENUE_AGGREGATE_TYPE,
} from './constants.js';

const text = z.string().min(1);
const positionSchema = z.number().int().min(1);
const rowPayloadSchema = z.strictObject({
  label: z.string().regex(/^[A-Z0-9]{1,3}$/),
  seats: z.number().int().min(1).max(100),
});
const rowsPayloadSchema = z.array(rowPayloadSchema).min(1).max(50);
const generalAdmissionCapacitySchema = z.number().int().min(1).max(50000);

export const batchPayloadSchema = z.strictObject({
  batchId: uuidSchema,
  name: text,
  priceCents: z.number().int().min(1).max(10000000),
  quantity: z.number().int().min(1).nullable(),
  endsAt: instantSchema.nullable(),
  position: positionSchema,
});

export const venueSectorPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    venueSectorId: uuidSchema,
    name: text,
    position: positionSchema,
    kind: z.literal('general_admission'),
    capacity: generalAdmissionCapacitySchema,
  }),
  z.strictObject({
    venueSectorId: uuidSchema,
    name: text,
    position: positionSchema,
    kind: z.literal('seated'),
    rows: rowsPayloadSchema,
  }),
]);

function sessionSector<TBatches extends z.ZodType>(batches: TBatches) {
  return z.discriminatedUnion('kind', [
    z.strictObject({
      sessionSectorId: uuidSchema,
      venueSectorId: uuidSchema,
      name: text,
      position: positionSchema,
      kind: z.literal('general_admission'),
      capacity: generalAdmissionCapacitySchema,
      batches,
    }),
    z.strictObject({
      sessionSectorId: uuidSchema,
      venueSectorId: uuidSchema,
      name: text,
      position: positionSchema,
      kind: z.literal('seated'),
      rows: rowsPayloadSchema,
      batches,
    }),
  ]);
}

export const sessionSectorPayloadSchema = sessionSector(z.array(batchPayloadSchema));
// Na agenda e na inclusão de setor, a cópia nasce sem lotes.
const newSessionSectorPayloadSchema = sessionSector(z.array(batchPayloadSchema).max(0));

const venueDetailsPayload = {
  name: text,
  address: text,
  city: text,
  state: z.enum(BRAZIL_STATES),
  timeZone: z.enum(BRAZIL_TIME_ZONES),
};

const eventDetailsPayload = {
  title: text,
  description: text,
  category: z.enum(EVENT_CATEGORIES),
  ageRating: z.enum(AGE_RATINGS),
  imageUrl: z.string().nullable(),
};

const T = CATALOG_EVENT_TYPES;
const V = VENUE_AGGREGATE_TYPE;
const E = EVENT_AGGREGATE_TYPE;

export const VenueRegisteredV1Schema = createEventEnvelopeSchema(
  T.venueRegistered,
  V,
  z.strictObject({ organizerId: uuidSchema, ...venueDetailsPayload }),
).extend({ aggregateVersion: z.literal(1) });

export const VenueDetailsUpdatedV1Schema = createEventEnvelopeSchema(
  T.venueDetailsUpdated,
  V,
  z.strictObject(venueDetailsPayload),
);

export const VenueSectorAddedV1Schema = createEventEnvelopeSchema(
  T.venueSectorAdded,
  V,
  z.strictObject({ sector: venueSectorPayloadSchema }),
);

export const VenueSectorRemovedV1Schema = createEventEnvelopeSchema(
  T.venueSectorRemoved,
  V,
  z.strictObject({ venueSectorId: uuidSchema }),
);

export const EventCreatedV1Schema = createEventEnvelopeSchema(
  T.eventCreated,
  E,
  z.strictObject({ organizerId: uuidSchema, ...eventDetailsPayload }),
).extend({ aggregateVersion: z.literal(1) });

export const EventDetailsUpdatedV1Schema = createEventEnvelopeSchema(
  T.eventDetailsUpdated,
  E,
  z.strictObject(eventDetailsPayload),
);

export const EventDiscardedV1Schema = createEventEnvelopeSchema(
  T.eventDiscarded,
  E,
  z.strictObject({}),
);

export const SessionScheduledV1Schema = createEventEnvelopeSchema(
  T.sessionScheduled,
  E,
  z.strictObject({
    sessionId: uuidSchema,
    venueId: uuidSchema,
    startsAt: instantSchema,
    salesStartsAt: instantSchema,
    timeZone: z.enum(BRAZIL_TIME_ZONES),
    sectors: z.array(newSessionSectorPayloadSchema),
  }),
);

export const SessionRemovedV1Schema = createEventEnvelopeSchema(
  T.sessionRemoved,
  E,
  z.strictObject({ sessionId: uuidSchema }),
);

export const SessionSectorAddedV1Schema = createEventEnvelopeSchema(
  T.sessionSectorAdded,
  E,
  z.strictObject({ sessionId: uuidSchema, sector: newSessionSectorPayloadSchema }),
);

export const SessionSectorRemovedV1Schema = createEventEnvelopeSchema(
  T.sessionSectorRemoved,
  E,
  z.strictObject({ sessionId: uuidSchema, sessionSectorId: uuidSchema }),
);

export const BatchAddedV1Schema = createEventEnvelopeSchema(
  T.batchAdded,
  E,
  z.strictObject({
    sessionId: uuidSchema,
    sessionSectorId: uuidSchema,
    batch: batchPayloadSchema,
  }),
);

export const BatchRemovedV1Schema = createEventEnvelopeSchema(
  T.batchRemoved,
  E,
  z.strictObject({
    sessionId: uuidSchema,
    sessionSectorId: uuidSchema,
    batchId: uuidSchema,
  }),
);

export const SessionPublishedV1Schema = createEventEnvelopeSchema(
  T.sessionPublished,
  E,
  z.strictObject({
    session: z.strictObject({
      sessionId: uuidSchema,
      venueId: uuidSchema,
      timeZone: z.enum(BRAZIL_TIME_ZONES),
      startsAt: instantSchema,
      salesStartsAt: instantSchema,
      sectors: z.array(sessionSectorPayloadSchema),
    }),
  }),
);

export const CatalogDomainEventSchema = z.discriminatedUnion('eventType', [
  VenueRegisteredV1Schema,
  VenueDetailsUpdatedV1Schema,
  VenueSectorAddedV1Schema,
  VenueSectorRemovedV1Schema,
  EventCreatedV1Schema,
  EventDetailsUpdatedV1Schema,
  EventDiscardedV1Schema,
  SessionScheduledV1Schema,
  SessionRemovedV1Schema,
  SessionSectorAddedV1Schema,
  SessionSectorRemovedV1Schema,
  BatchAddedV1Schema,
  BatchRemovedV1Schema,
  SessionPublishedV1Schema,
]);

export type VenueSectorPayload = z.infer<typeof venueSectorPayloadSchema>;
export type SessionSectorPayload = z.infer<typeof sessionSectorPayloadSchema>;
export type BatchPayload = z.infer<typeof batchPayloadSchema>;

export type VenueRegisteredV1 = z.infer<typeof VenueRegisteredV1Schema>;
export type VenueDetailsUpdatedV1 = z.infer<typeof VenueDetailsUpdatedV1Schema>;
export type VenueSectorAddedV1 = z.infer<typeof VenueSectorAddedV1Schema>;
export type VenueSectorRemovedV1 = z.infer<typeof VenueSectorRemovedV1Schema>;
export type EventCreatedV1 = z.infer<typeof EventCreatedV1Schema>;
export type EventDetailsUpdatedV1 = z.infer<typeof EventDetailsUpdatedV1Schema>;
export type EventDiscardedV1 = z.infer<typeof EventDiscardedV1Schema>;
export type SessionScheduledV1 = z.infer<typeof SessionScheduledV1Schema>;
export type SessionRemovedV1 = z.infer<typeof SessionRemovedV1Schema>;
export type SessionSectorAddedV1 = z.infer<typeof SessionSectorAddedV1Schema>;
export type SessionSectorRemovedV1 = z.infer<typeof SessionSectorRemovedV1Schema>;
export type BatchAddedV1 = z.infer<typeof BatchAddedV1Schema>;
export type BatchRemovedV1 = z.infer<typeof BatchRemovedV1Schema>;
export type SessionPublishedV1 = z.infer<typeof SessionPublishedV1Schema>;

export type CatalogDomainEvent = z.infer<typeof CatalogDomainEventSchema>;
export type VenueDomainEventV1 =
  VenueRegisteredV1 | VenueDetailsUpdatedV1 | VenueSectorAddedV1 | VenueSectorRemovedV1;
export type EventDomainEventV1 =
  | EventCreatedV1
  | EventDetailsUpdatedV1
  | EventDiscardedV1
  | SessionScheduledV1
  | SessionRemovedV1
  | SessionSectorAddedV1
  | SessionSectorRemovedV1
  | BatchAddedV1
  | BatchRemovedV1
  | SessionPublishedV1;
