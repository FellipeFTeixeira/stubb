import {
  EventCardSchema,
  type EventDetailDocument,
  type EventListingDocument,
  GetEventResponseSchema,
  GetOrganizerEventResponseSchema,
  GetVenueResponseSchema,
  ListVenuesResponseSchema,
  type VenueDocument,
} from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import {
  toEventCard,
  toOrganizerEventView,
  toPublicEventView,
  toVenueSummary,
  toVenueView,
} from './view-mappers.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const id = (n: number): string => `0190a0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const future = (days: number): Date => new Date(NOW.getTime() + days * 86_400_000);

const snapshot = {
  name: 'Teatro',
  address: 'Rua A, 1',
  city: 'Porto Alegre',
  state: 'RS',
  cityKey: 'porto alegre',
  detailsVersion: 1,
};

const detail: EventDetailDocument = {
  _id: id(1),
  organizerId: id(2),
  version: 3,
  status: 'published',
  title: 'Peça',
  description: 'Descrição',
  category: 'theater',
  ageRating: '12',
  imageUrl: null,
  createdAt: future(-30),
  updatedAt: future(-20),
  sessions: [
    {
      id: id(10),
      status: 'published',
      venueId: id(20),
      venue: snapshot,
      startsAt: future(10),
      salesStartsAt: future(-1),
      timeZone: 'America/Sao_Paulo',
      sectors: [
        {
          id: id(30),
          venueSectorId: id(31),
          name: 'Plateia',
          kind: 'seated',
          capacity: 30,
          rows: [{ label: 'A', seats: 30 }],
          position: 0,
          batches: [
            {
              id: id(40),
              name: 'Lote 1',
              priceCents: 5000,
              quantity: null,
              endsAt: null,
              position: 0,
            },
          ],
        },
      ],
    },
  ],
};

describe('view mappers', () => {
  it('maps the listing document to a card that satisfies the contract', () => {
    const doc: EventListingDocument = {
      _id: id(1),
      organizerId: id(2),
      version: 1,
      title: 'Peça',
      titleSortKey: 'peca',
      category: 'theater',
      imageUrl: null,
      sessions: [
        {
          id: id(10),
          venueId: id(20),
          startsAt: future(10),
          salesStartsAt: future(-1),
          timeZone: 'America/Sao_Paulo',
          venue: { name: 'Teatro', city: 'Porto Alegre', state: 'RS' },
          cityKey: 'porto alegre',
          sectors: [{ id: id(30), batches: [{ priceCents: 5000, endsAt: null, position: 0 }] }],
        },
        {
          id: id(11),
          venueId: id(20),
          startsAt: future(20),
          salesStartsAt: future(3),
          timeZone: 'America/Sao_Paulo',
          venue: { name: 'Teatro', city: 'Porto Alegre', state: 'RS' },
          cityKey: 'porto alegre',
          sectors: [],
        },
      ],
    };
    const card = toEventCard(doc, NOW);
    expect(EventCardSchema.parse(card)).toMatchObject({
      otherUpcomingSessionsCount: 1,
      price: { kind: 'from', priceCents: 5000 },
    });
  });

  it('maps the public view with the published session and the open batch', () => {
    const view = toPublicEventView(detail, NOW);
    const parsed = GetEventResponseSchema.parse({ event: view, minVersionReached: true });
    expect(parsed.event.sessions[0]?.sectors[0]?.sales).toEqual({
      status: 'open',
      batch: { name: 'Lote 1', priceCents: 5000 },
    });
  });

  it('does not expose the public view of a draft event or of one without sessions', () => {
    expect(toPublicEventView({ ...detail, status: 'draft' }, NOW)).toBeNull();
    expect(toPublicEventView({ ...detail, sessions: [] }, NOW)).toBeNull();
  });

  it('maps the organizer view including a session without venue', () => {
    const doc: EventDetailDocument = {
      ...detail,
      sessions: [
        ...detail.sessions,
        {
          ...detail.sessions[0]!,
          id: id(12),
          venue: null,
          status: 'draft',
          startsAt: future(11),
          sectors: [],
        },
      ],
    };
    const parsed = GetOrganizerEventResponseSchema.parse({
      event: toOrganizerEventView(doc, NOW),
      minVersionReached: true,
    });
    expect(parsed.event.sessions[1]).toMatchObject({ venue: null, status: 'draft' });
    expect(parsed.event.sessions[0]?.sectors[0]?.batches[0]?.badge).toBe('current');
  });

  it('maps venues to summary and view', () => {
    const venue: VenueDocument = {
      _id: id(20),
      organizerId: id(2),
      version: 2,
      detailsVersion: 1,
      name: 'Teatro',
      address: 'Rua A, 1',
      city: 'Porto Alegre',
      state: 'RS',
      timeZone: 'America/Sao_Paulo',
      cityKey: 'porto alegre',
      sectors: [
        {
          id: id(31),
          name: 'Plateia',
          kind: 'seated',
          capacity: 30,
          rows: [{ label: 'A', seats: 30 }],
          position: 0,
        },
      ],
      createdAt: future(-5),
      updatedAt: future(-4),
    };
    expect(
      ListVenuesResponseSchema.parse({ items: [toVenueSummary(venue)] }).items[0]?.sectorsCount,
    ).toBe(1);
    expect(
      GetVenueResponseSchema.parse({ venue: toVenueView(venue), minVersionReached: true }).venue
        .sectors[0]?.capacity,
    ).toBe(30);
  });
});
