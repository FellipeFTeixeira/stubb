import { describe, expect, it } from 'vitest';
import {
  AddBatchRequestSchema,
  CreateEventRequestSchema,
  EventCardSchema,
  GetEventResponseSchema,
  GetOrganizerEventResponseSchema,
  GetVenueResponseSchema,
  ListEventsQuerySchema,
  ListEventsResponseSchema,
  ListOrganizerEventsQuerySchema,
  ListOrganizerEventsResponseSchema,
  ListVenuesResponseSchema,
  ReadNotFoundResponseSchema,
  ScheduleSessionRequestSchema,
  UpdateEventDetailsRequestSchema,
  UpdateVenueDetailsRequestSchema,
} from '../index.js';

const id = '018f4c1e-7b3a-7c2d-9e1f-0a1b2c3d4e5f';
const iso = '2026-12-10T23:00:00.000Z';

describe('ScheduleSessionRequestSchema', () => {
  const base = { venueId: id, timeZone: 'America/Sao_Paulo' };

  it('rejeita salesStartsAt igual ou posterior com path salesStartsAt', () => {
    for (const salesStartsAt of [iso, '2026-12-11T00:00:00.000Z']) {
      const r = ScheduleSessionRequestSchema.safeParse({ ...base, startsAt: iso, salesStartsAt });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['salesStartsAt']);
    }
  });

  it('aceita Z e offset -03:00', () => {
    expect(
      ScheduleSessionRequestSchema.safeParse({
        ...base,
        startsAt: '2026-12-10T23:00:00Z',
        salesStartsAt: '2026-12-01T00:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      ScheduleSessionRequestSchema.safeParse({
        ...base,
        startsAt: '2026-12-10T20:00:00-03:00',
        salesStartsAt: '2026-12-01T00:00:00-03:00',
      }).success,
    ).toBe(true);
  });

  it('rejeita fuso fora da lista', () => {
    const r = ScheduleSessionRequestSchema.safeParse({
      ...base,
      timeZone: 'UTC',
      startsAt: iso,
      salesStartsAt: '2026-12-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('requests com opcionais', () => {
  it('CreateEventRequest sem imageUrl gera null', () => {
    const r = CreateEventRequestSchema.parse({
      title: 'A',
      description: 'B',
      category: 'show',
      ageRating: 'L',
    });
    expect(r.imageUrl).toBeNull();
  });

  it('AddBatchRequest sem quantity/endsAt gera null; aceita null explícito', () => {
    expect(AddBatchRequestSchema.parse({ name: 'L1', priceCents: 100 })).toEqual({
      name: 'L1',
      priceCents: 100,
      quantity: null,
      endsAt: null,
    });
    expect(
      AddBatchRequestSchema.parse({ name: 'L1', priceCents: 100, quantity: null, endsAt: null }),
    ).toMatchObject({ quantity: null, endsAt: null });
  });

  it('Update* exigem expectedVersion >= 1', () => {
    const venue = {
      name: 'a',
      address: 'a',
      city: 'a',
      state: 'RS',
      timeZone: 'America/Sao_Paulo',
    };
    expect(UpdateVenueDetailsRequestSchema.safeParse(venue).success).toBe(false);
    expect(
      UpdateVenueDetailsRequestSchema.safeParse({ ...venue, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      UpdateVenueDetailsRequestSchema.safeParse({ ...venue, expectedVersion: 3 }).success,
    ).toBe(true);
    expect(
      UpdateEventDetailsRequestSchema.safeParse({
        title: 'a',
        description: 'a',
        category: 'show',
        ageRating: 'L',
        imageUrl: null,
        expectedVersion: 1,
      }).success,
    ).toBe(true);
  });
});

describe('queries de lista', () => {
  it('q em branco vira undefined; sem parâmetros usa page 1 e pageSize 12', () => {
    expect(ListEventsQuerySchema.parse({ q: '  ' })).toEqual({
      q: undefined,
      city: undefined,
      category: undefined,
      page: 1,
      pageSize: 12,
    });
  });
  it('converte strings da query string', () => {
    expect(ListEventsQuerySchema.parse({ q: ' hamlet ', page: '2', pageSize: '48' })).toMatchObject(
      { q: 'hamlet', page: 2, pageSize: 48 },
    );
  });
  it.each([{ pageSize: '49' }, { pageSize: '0' }, { page: '0' }, { category: 'x' }])(
    'rejeita %j',
    (q) => {
      expect(ListEventsQuerySchema.safeParse(q).success).toBe(false);
    },
  );
  it('lista do produtor usa os mesmos limites', () => {
    expect(ListOrganizerEventsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 12 });
    expect(ListOrganizerEventsQuerySchema.safeParse({ pageSize: '49' }).success).toBe(false);
  });
});

describe('views e respostas', () => {
  const venueLoc = { name: 'Teatro', city: 'Porto Alegre', state: 'RS' };
  const card = {
    id,
    title: 'Hamlet',
    category: 'theater',
    imageUrl: null,
    nextSession: { id, startsAt: iso, timeZone: 'America/Sao_Paulo', venue: venueLoc },
    otherUpcomingSessionsCount: 0,
    price: { kind: 'from', priceCents: 5000 },
  };

  it('EventCard aceita as três variantes de preço e rejeita desconhecida', () => {
    for (const price of [
      { kind: 'from', priceCents: 1 },
      { kind: 'sales_start', salesStartsAt: iso },
      { kind: 'sales_ended' },
    ]) {
      expect(EventCardSchema.safeParse({ ...card, price }).success).toBe(true);
    }
    expect(EventCardSchema.safeParse({ ...card, price: { kind: 'free' } }).success).toBe(false);
  });

  it('ListEventsResponse', () => {
    expect(
      ListEventsResponseSchema.safeParse({
        items: [card],
        page: 1,
        pageSize: 12,
        total: 1,
        asOf: iso,
      }).success,
    ).toBe(true);
  });

  it('GetEventResponse (três status de venda)', () => {
    const sector = (sales: unknown) => ({ id, name: 'Pista', kind: 'general_admission', sales });
    const event = {
      id,
      version: 3,
      title: 'Hamlet',
      description: 'x',
      category: 'theater',
      ageRating: '12',
      imageUrl: null,
      ended: false,
      asOf: iso,
      sessions: [
        {
          id,
          startsAt: iso,
          timeZone: 'America/Sao_Paulo',
          ended: false,
          venue: { ...venueLoc, address: 'Rua A' },
          sectors: [
            sector({ status: 'open', batch: { name: 'Lote 1', priceCents: 100 } }),
            sector({ status: 'upcoming', salesStartsAt: iso }),
            sector({ status: 'ended' }),
          ],
        },
      ],
    };
    expect(GetEventResponseSchema.safeParse({ event, minVersionReached: true }).success).toBe(true);
  });

  it('GetOrganizerEventResponse', () => {
    const event = {
      id,
      version: 2,
      status: 'draft',
      title: 'Hamlet',
      description: 'x',
      category: 'theater',
      ageRating: 'L',
      imageUrl: null,
      createdAt: iso,
      asOf: iso,
      sessions: [
        {
          id,
          status: 'draft',
          venueId: id,
          venue: null,
          startsAt: iso,
          salesStartsAt: iso,
          timeZone: 'America/Sao_Paulo',
          ended: false,
          salesOpen: false,
          sectors: [
            {
              id,
              venueSectorId: id,
              name: 'Plateia',
              kind: 'seated',
              capacity: 10,
              rows: [{ label: 'A', seats: 10 }],
              batches: [
                {
                  id,
                  name: 'L1',
                  priceCents: 100,
                  quantity: null,
                  endsAt: null,
                  badge: 'upcoming',
                },
              ],
            },
          ],
        },
      ],
    };
    expect(
      GetOrganizerEventResponseSchema.safeParse({ event, minVersionReached: false }).success,
    ).toBe(true);
  });

  it('lista do produtor, locais e 404', () => {
    expect(
      ListOrganizerEventsResponseSchema.safeParse({
        items: [
          {
            id,
            title: 'x',
            category: 'show',
            status: 'published',
            sessionsCount: 2,
            publishedSessionsCount: 1,
            createdAt: iso,
          },
        ],
        page: 1,
        pageSize: 12,
        total: 1,
      }).success,
    ).toBe(true);
    expect(
      ListVenuesResponseSchema.safeParse({
        items: [
          {
            id,
            name: 'a',
            city: 'b',
            state: 'RS',
            timeZone: 'America/Manaus',
            sectorsCount: 0,
            version: 1,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      GetVenueResponseSchema.safeParse({
        venue: {
          id,
          version: 1,
          name: 'a',
          address: 'b',
          city: 'c',
          state: 'RS',
          timeZone: 'America/Manaus',
          sectors: [{ id, name: 'Pista', kind: 'general_admission', capacity: 5, rows: null }],
        },
        minVersionReached: true,
      }).success,
    ).toBe(true);
    expect(
      ReadNotFoundResponseSchema.safeParse({
        statusCode: 404,
        message: 'x',
        minVersionReached: true,
      }).success,
    ).toBe(true);
  });
});
