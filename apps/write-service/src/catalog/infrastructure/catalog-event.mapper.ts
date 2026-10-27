import {
  type AnyEventEnvelope,
  type BatchPayload,
  CATALOG_EVENT_TYPES,
  CatalogDomainEventSchema,
  EVENT_AGGREGATE_TYPE,
  type SessionSectorPayload,
  VENUE_AGGREGATE_TYPE,
  type VenueSectorPayload,
} from '@stubb/contracts';
import { v7 } from 'uuid';
import type {
  BatchState,
  CatalogEventDomainEvent,
  SessionSectorState,
  SessionState,
} from '../domain/catalog-event.events.js';
import type { VenueDomainEvent, VenueSectorState } from '../domain/venue.events.js';

const T = CATALOG_EVENT_TYPES;

function batchPayload(batch: BatchState): BatchPayload {
  return {
    batchId: batch.id,
    name: batch.name,
    priceCents: batch.priceCents,
    quantity: batch.quantity,
    endsAt: batch.endsAt ? batch.endsAt.toISOString() : null,
    position: batch.position,
  };
}

function venueSectorPayload(sector: VenueSectorState): VenueSectorPayload {
  const base = { venueSectorId: sector.id, name: sector.name, position: sector.position };
  if (sector.kind === 'seated') {
    return { ...base, kind: 'seated', rows: (sector.rows ?? []).map((row) => ({ ...row })) };
  }
  return { ...base, kind: 'general_admission', capacity: sector.capacity ?? 0 };
}

function sessionSectorPayload(sector: SessionSectorState): SessionSectorPayload {
  const base = {
    sessionSectorId: sector.id,
    venueSectorId: sector.venueSectorId,
    name: sector.name,
    position: sector.position,
    batches: sector.batches.map(batchPayload),
  };
  if (sector.kind === 'seated') {
    return { ...base, kind: 'seated', rows: (sector.rows ?? []).map((row) => ({ ...row })) };
  }
  return { ...base, kind: 'general_admission', capacity: sector.capacity ?? 0 };
}

function sessionPublishedPayload(session: SessionState) {
  return {
    sessionId: session.id,
    venueId: session.venueId,
    timeZone: session.timeZone,
    startsAt: session.startsAt.toISOString(),
    salesStartsAt: session.salesStartsAt.toISOString(),
    sectors: session.sectors.map(sessionSectorPayload),
  };
}

function toEnvelope(event: VenueDomainEvent | CatalogEventDomainEvent): AnyEventEnvelope {
  const isVenue = 'venueId' in event;
  const base = {
    eventId: v7(),
    schemaVersion: 1 as const,
    aggregateType: isVenue ? VENUE_AGGREGATE_TYPE : EVENT_AGGREGATE_TYPE,
    aggregateId: isVenue ? event.venueId : event.eventId,
    aggregateVersion: event.aggregateVersion,
    occurredAt: event.occurredAt.toISOString(),
    correlationId: null,
    causationId: null,
  };
  switch (event.type) {
    case 'VenueRegistered':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.venueRegistered,
        payload: { organizerId: event.organizerId, ...event.details },
      });
    case 'VenueDetailsUpdated':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.venueDetailsUpdated,
        payload: { ...event.details },
      });
    case 'VenueSectorAdded':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.venueSectorAdded,
        payload: { sector: venueSectorPayload(event.sector) },
      });
    case 'VenueSectorRemoved':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.venueSectorRemoved,
        payload: { venueSectorId: event.venueSectorId },
      });
    case 'EventCreated':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.eventCreated,
        payload: { organizerId: event.organizerId, ...event.details },
      });
    case 'EventDetailsUpdated':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.eventDetailsUpdated,
        payload: { ...event.details },
      });
    case 'EventDiscarded':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.eventDiscarded,
        payload: {},
      });
    case 'SessionScheduled':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.sessionScheduled,
        payload: {
          sessionId: event.session.id,
          venueId: event.session.venueId,
          startsAt: event.session.startsAt.toISOString(),
          salesStartsAt: event.session.salesStartsAt.toISOString(),
          timeZone: event.session.timeZone,
          sectors: event.session.sectors.map(sessionSectorPayload),
        },
      });
    case 'SessionRemoved':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.sessionRemoved,
        payload: { sessionId: event.sessionId },
      });
    case 'SessionSectorAdded':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.sessionSectorAdded,
        payload: { sessionId: event.sessionId, sector: sessionSectorPayload(event.sector) },
      });
    case 'SessionSectorRemoved':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.sessionSectorRemoved,
        payload: { sessionId: event.sessionId, sessionSectorId: event.sessionSectorId },
      });
    case 'BatchAdded':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.batchAdded,
        payload: {
          sessionId: event.sessionId,
          sessionSectorId: event.sessionSectorId,
          batch: batchPayload(event.batch),
        },
      });
    case 'BatchRemoved':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.batchRemoved,
        payload: {
          sessionId: event.sessionId,
          sessionSectorId: event.sessionSectorId,
          batchId: event.batchId,
        },
      });
    case 'SessionPublished':
      return CatalogDomainEventSchema.parse({
        ...base,
        eventType: T.sessionPublished,
        payload: { session: sessionPublishedPayload(event.session) },
      });
  }
}

// Evento de domínio -> envelope V1 validado (o contrato público entre write e read).
export function toCatalogEnvelopes(
  events: readonly (VenueDomainEvent | CatalogEventDomainEvent)[],
): AnyEventEnvelope[] {
  return events.map(toEnvelope);
}
