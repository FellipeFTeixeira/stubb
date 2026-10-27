import { randomUUID } from 'node:crypto';
import {
  CatalogDomainEventSchema,
  type BatchPayload,
  type CatalogDomainEvent,
  type EventDomainEventV1,
  type SessionSectorPayload,
  type VenueDomainEventV1,
  type VenueSectorPayload,
} from '@stubb/contracts';

// Só para testes do Catalog: monta envelopes válidos (passam pelo schema do contrato).

let counter = 0;
/** UUID v7 válido e determinístico por chamada, no formato exigido pelo `z.uuid()` do Zod 4. */
export function testId(): string {
  counter += 1;
  return `0190a0a0-0000-7000-8000-${String(counter).padStart(12, '0')}`;
}

export const ORGANIZER_ID = '0190a0a0-0000-7000-8000-00000000f001';

export const VENUE_DETAILS = {
  name: 'Teatro Aurora',
  address: 'Rua das Acácias, 120 - Centro',
  city: 'São Paulo',
  state: 'SP',
  timeZone: 'America/Sao_Paulo',
} as const;

export const EVENT_DETAILS = {
  title: 'Hamlet',
  description: 'Tragédia de Shakespeare.',
  category: 'theater',
  ageRating: '14',
  imageUrl: null,
} as const;

function occurredAtFor(version: number, minuteOffset: number): string {
  const min = String(minuteOffset).padStart(2, '0');
  const sec = String(version).padStart(2, '0');
  return `2026-10-26T12:${min}:${sec}.000Z`;
}

function build(
  eventType: CatalogDomainEvent['eventType'],
  aggregateType: 'Venue' | 'Event',
  aggregateId: string,
  aggregateVersion: number,
  payload: unknown,
  minuteOffset: number,
): CatalogDomainEvent {
  return CatalogDomainEventSchema.parse({
    eventId: randomUUID(),
    eventType,
    schemaVersion: 1,
    aggregateType,
    aggregateId,
    aggregateVersion,
    occurredAt: occurredAtFor(aggregateVersion, minuteOffset),
    correlationId: null,
    causationId: null,
    payload,
  });
}

export function asVenueEvent(event: CatalogDomainEvent): VenueDomainEventV1 {
  if (event.aggregateType !== 'Venue') throw new Error('not a venue event');
  return event;
}

export function asEventEvent(event: CatalogDomainEvent): EventDomainEventV1 {
  if (event.aggregateType !== 'Event') throw new Error('not an event event');
  return event;
}

export const venueEvents = {
  registered: (id: string, v = 1, details: Record<string, string> = VENUE_DETAILS) =>
    build('VenueRegistered', 'Venue', id, v, { organizerId: ORGANIZER_ID, ...details }, 0),
  detailsUpdated: (id: string, v: number, details: Record<string, string>) =>
    build('VenueDetailsUpdated', 'Venue', id, v, details, 10),
  sectorAdded: (id: string, v: number, sector: VenueSectorPayload) =>
    build('VenueSectorAdded', 'Venue', id, v, { sector }, 1),
  sectorRemoved: (id: string, v: number, venueSectorId: string) =>
    build('VenueSectorRemoved', 'Venue', id, v, { venueSectorId }, 2),
};

export const eventEvents = {
  created: (id: string, v = 1, details: Record<string, unknown> = EVENT_DETAILS) =>
    build('EventCreated', 'Event', id, v, { organizerId: ORGANIZER_ID, ...details }, 0),
  detailsUpdated: (id: string, v: number, details: Record<string, unknown>) =>
    build('EventDetailsUpdated', 'Event', id, v, details, 0),
  discarded: (id: string, v: number) => build('EventDiscarded', 'Event', id, v, {}, 0),
  sessionScheduled: (
    id: string,
    v: number,
    p: {
      sessionId: string;
      venueId: string;
      startsAt: string;
      salesStartsAt?: string;
      timeZone?: string;
      sectors: SessionSectorPayload[];
    },
  ) =>
    build(
      'SessionScheduled',
      'Event',
      id,
      v,
      {
        salesStartsAt: '2026-10-26T12:00:00.000Z',
        timeZone: 'America/Sao_Paulo',
        ...p,
      },
      0,
    ),
  sessionRemoved: (id: string, v: number, sessionId: string) =>
    build('SessionRemoved', 'Event', id, v, { sessionId }, 0),
  sessionSectorAdded: (id: string, v: number, sessionId: string, sector: SessionSectorPayload) =>
    build('SessionSectorAdded', 'Event', id, v, { sessionId, sector }, 0),
  sessionSectorRemoved: (id: string, v: number, sessionId: string, sessionSectorId: string) =>
    build('SessionSectorRemoved', 'Event', id, v, { sessionId, sessionSectorId }, 0),
  batchAdded: (
    id: string,
    v: number,
    sessionId: string,
    sessionSectorId: string,
    batch: BatchPayload,
  ) => build('BatchAdded', 'Event', id, v, { sessionId, sessionSectorId, batch }, 0),
  batchRemoved: (
    id: string,
    v: number,
    sessionId: string,
    sessionSectorId: string,
    batchId: string,
  ) => build('BatchRemoved', 'Event', id, v, { sessionId, sessionSectorId, batchId }, 0),
  sessionPublished: (
    id: string,
    v: number,
    session: {
      sessionId: string;
      venueId: string;
      startsAt: string;
      salesStartsAt?: string;
      timeZone?: string;
      sectors: SessionSectorPayload[];
    },
  ) =>
    build(
      'SessionPublished',
      'Event',
      id,
      v,
      {
        session: {
          salesStartsAt: '2026-10-26T12:00:00.000Z',
          timeZone: 'America/Sao_Paulo',
          ...session,
        },
      },
      0,
    ),
};

export function gaVenueSector(position = 1, capacity = 300): VenueSectorPayload {
  return {
    venueSectorId: testId(),
    name: `Pista ${position}`,
    position,
    kind: 'general_admission',
    capacity,
  };
}

export function seatedVenueSector(position = 2): VenueSectorPayload {
  return {
    venueSectorId: testId(),
    name: `Plateia ${position}`,
    position,
    kind: 'seated',
    rows: [
      { label: 'A', seats: 10 },
      { label: 'B', seats: 12 },
    ],
  };
}

export function sessionSectorFrom(
  venueSector: VenueSectorPayload,
  batches: BatchPayload[] = [],
): SessionSectorPayload {
  const base = {
    sessionSectorId: testId(),
    venueSectorId: venueSector.venueSectorId,
    name: venueSector.name,
    position: venueSector.position,
    batches,
  };
  return venueSector.kind === 'seated'
    ? { ...base, kind: 'seated', rows: venueSector.rows }
    : { ...base, kind: 'general_admission', capacity: venueSector.capacity };
}

export function batch(
  position: number,
  priceCents = 8000,
  endsAt: string | null = null,
): BatchPayload {
  return {
    batchId: testId(),
    name: `Lote ${position}`,
    priceCents,
    quantity: null,
    endsAt,
    position,
  };
}

/**
 * Cenário completo do CA-30: um Local (4 eventos de domínio) e um Evento (11) que agenda duas
 * sessões nele, em dois setores cada. Cada lista respeita a ordem do próprio agregado.
 */
export function buildScenario() {
  const venueId = testId();
  const eventId = testId();
  const pista = gaVenueSector(1, 300);
  const plateia = seatedVenueSector(2);

  const sessionA = testId();
  const sessionB = testId();
  const a1 = sessionSectorFrom(pista);
  const a2 = sessionSectorFrom(plateia);
  const b1 = sessionSectorFrom(pista);
  const b2 = sessionSectorFrom(plateia);
  const batch1 = batch(1, 8000, '2026-12-01T03:00:00.000Z');
  const batch2 = batch(2, 10000);
  const batch3 = batch(3, 12000);

  const venue = [
    venueEvents.registered(venueId, 1),
    venueEvents.sectorAdded(venueId, 2, pista),
    venueEvents.sectorAdded(venueId, 3, plateia),
    venueEvents.detailsUpdated(venueId, 4, {
      ...VENUE_DETAILS,
      name: 'Teatro Aurora Nova',
      city: 'Belo Horizonte',
      state: 'MG',
    }),
  ];

  const event = [
    eventEvents.created(eventId, 1),
    eventEvents.detailsUpdated(eventId, 2, { ...EVENT_DETAILS, title: 'Hamlet (temporada)' }),
    eventEvents.sessionScheduled(eventId, 3, {
      sessionId: sessionA,
      venueId,
      startsAt: '2026-12-20T23:00:00.000Z',
      sectors: [a1, a2],
    }),
    eventEvents.sessionScheduled(eventId, 4, {
      sessionId: sessionB,
      venueId,
      startsAt: '2026-12-10T23:00:00.000Z',
      sectors: [b1, b2],
    }),
    eventEvents.sessionSectorRemoved(eventId, 5, sessionB, b2.sessionSectorId),
    eventEvents.batchAdded(eventId, 6, sessionA, a1.sessionSectorId, batch1),
    eventEvents.batchAdded(eventId, 7, sessionA, a1.sessionSectorId, batch2),
    eventEvents.batchRemoved(eventId, 8, sessionA, a1.sessionSectorId, batch2.batchId),
    eventEvents.batchAdded(eventId, 9, sessionA, a1.sessionSectorId, batch3),
    eventEvents.batchAdded(eventId, 10, sessionA, a2.sessionSectorId, batch(1, 5000)),
    eventEvents.sessionPublished(eventId, 11, {
      sessionId: sessionA,
      venueId,
      startsAt: '2026-12-20T23:00:00.000Z',
      sectors: [a1, a2],
    }),
  ];

  return { venueId, eventId, sessionA, sessionB, venue, event };
}
