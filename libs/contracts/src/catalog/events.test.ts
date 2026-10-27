import { describe, expect, it } from 'vitest';
import { CATALOG_EVENT_TYPES, CatalogDomainEventSchema } from '../index.js';

const id = '018f4c1e-7b3a-7c2d-9e1f-0a1b2c3d4e5f';
const iso = '2026-12-10T23:00:00.000Z';

function envelope(eventType: string, aggregateType: string, payload: unknown, version = 2) {
  return {
    eventId: id,
    eventType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: id,
    aggregateVersion: version,
    occurredAt: iso,
    correlationId: null,
    causationId: null,
    payload,
  };
}

const venueDetails = {
  name: 'Teatro',
  address: 'Rua A',
  city: 'Porto Alegre',
  state: 'RS',
  timeZone: 'America/Sao_Paulo',
};
const eventDetails = {
  title: 'Hamlet',
  description: 'x',
  category: 'theater',
  ageRating: '12',
  imageUrl: null,
};
const batch = {
  batchId: id,
  name: 'L1',
  priceCents: 100,
  quantity: null,
  endsAt: null,
  position: 1,
};
const pista = (batches: unknown[] = []) => ({
  sessionSectorId: id,
  venueSectorId: id,
  name: 'Pista',
  position: 1,
  kind: 'general_admission',
  capacity: 100,
  batches,
});
const marcado = {
  sessionSectorId: id,
  venueSectorId: id,
  name: 'Plateia',
  position: 2,
  kind: 'seated',
  rows: [{ label: 'A', seats: 10 }],
  batches: [],
};

const valid: Record<string, [string, unknown, number?]> = {
  [CATALOG_EVENT_TYPES.venueRegistered]: ['Venue', { organizerId: id, ...venueDetails }, 1],
  [CATALOG_EVENT_TYPES.venueDetailsUpdated]: ['Venue', venueDetails],
  [CATALOG_EVENT_TYPES.venueSectorAdded]: [
    'Venue',
    {
      sector: {
        venueSectorId: id,
        name: 'Pista',
        position: 1,
        kind: 'general_admission',
        capacity: 10,
      },
    },
  ],
  [CATALOG_EVENT_TYPES.venueSectorRemoved]: ['Venue', { venueSectorId: id }],
  [CATALOG_EVENT_TYPES.eventCreated]: ['Event', { organizerId: id, ...eventDetails }, 1],
  [CATALOG_EVENT_TYPES.eventDetailsUpdated]: ['Event', eventDetails],
  [CATALOG_EVENT_TYPES.eventDiscarded]: ['Event', {}],
  [CATALOG_EVENT_TYPES.sessionScheduled]: [
    'Event',
    {
      sessionId: id,
      venueId: id,
      startsAt: iso,
      salesStartsAt: '2026-12-01T00:00:00-03:00',
      timeZone: 'America/Manaus',
      sectors: [pista(), marcado],
    },
  ],
  [CATALOG_EVENT_TYPES.sessionRemoved]: ['Event', { sessionId: id }],
  [CATALOG_EVENT_TYPES.sessionSectorAdded]: ['Event', { sessionId: id, sector: marcado }],
  [CATALOG_EVENT_TYPES.sessionSectorRemoved]: ['Event', { sessionId: id, sessionSectorId: id }],
  [CATALOG_EVENT_TYPES.batchAdded]: ['Event', { sessionId: id, sessionSectorId: id, batch }],
  [CATALOG_EVENT_TYPES.batchRemoved]: [
    'Event',
    { sessionId: id, sessionSectorId: id, batchId: id },
  ],
  [CATALOG_EVENT_TYPES.sessionPublished]: [
    'Event',
    {
      session: {
        sessionId: id,
        venueId: id,
        timeZone: 'America/Sao_Paulo',
        startsAt: iso,
        salesStartsAt: iso,
        sectors: [pista([batch])],
      },
    },
  ],
};

describe('CatalogDomainEventSchema', () => {
  it('cobre os 14 tipos', () => {
    expect(Object.keys(valid)).toHaveLength(14);
    expect(Object.values(CATALOG_EVENT_TYPES)).toHaveLength(14);
  });

  it.each(Object.entries(valid))('aceita um envelope válido de %s', (type, [agg, payload, v]) => {
    const r = CatalogDomainEventSchema.safeParse(envelope(type, agg, payload, v));
    expect(r.error?.issues).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it('rejeita eventType desconhecido', () => {
    expect(CatalogDomainEventSchema.safeParse(envelope('Nope', 'Event', {})).success).toBe(false);
  });

  it('rejeita schemaVersion 2', () => {
    const e = { ...envelope('EventDiscarded', 'Event', {}), schemaVersion: 2 };
    expect(CatalogDomainEventSchema.safeParse(e).success).toBe(false);
  });

  it('rejeita aggregateType trocado', () => {
    expect(
      CatalogDomainEventSchema.safeParse(envelope('EventDiscarded', 'Venue', {})).success,
    ).toBe(false);
  });

  it('rejeita SessionScheduled com `active` no setor', () => {
    const [, payload] = valid[CATALOG_EVENT_TYPES.sessionScheduled]!;
    const withActive = {
      ...(payload as object),
      sectors: [{ ...pista(), active: true }],
    };
    expect(
      CatalogDomainEventSchema.safeParse(envelope('SessionScheduled', 'Event', withActive)).success,
    ).toBe(false);
  });

  it('rejeita SessionScheduled com lotes já no setor', () => {
    const [, payload] = valid[CATALOG_EVENT_TYPES.sessionScheduled]!;
    const withBatch = { ...(payload as object), sectors: [pista([batch])] };
    expect(
      CatalogDomainEventSchema.safeParse(envelope('SessionScheduled', 'Event', withBatch)).success,
    ).toBe(false);
  });

  it.each(['VenueRegistered', 'EventCreated'])('%s só aceita aggregateVersion 1', (type) => {
    const [agg, payload] = valid[type]!;
    expect(CatalogDomainEventSchema.safeParse(envelope(type, agg, payload, 2)).success).toBe(false);
    expect(CatalogDomainEventSchema.safeParse(envelope(type, agg, payload, 1)).success).toBe(true);
  });

  it('rejeita rótulo de fila minúsculo no evento', () => {
    const bad = { sessionId: id, sector: { ...marcado, rows: [{ label: 'a', seats: 1 }] } };
    expect(
      CatalogDomainEventSchema.safeParse(envelope('SessionSectorAdded', 'Event', bad)).success,
    ).toBe(false);
  });
});
