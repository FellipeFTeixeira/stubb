import {
  GetOrganizerEventResponseSchema,
  GetVenueResponseSchema,
  ListOrganizerEventsResponseSchema,
  ListVenuesResponseSchema,
  type OrganizerEventDocument,
  READ_STORE_COLLECTIONS,
  type VenueDocument,
} from '@stubb/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  body,
  type CatalogTestContext,
  createCatalogApp,
  day,
  detailDoc,
  detailSession,
  NOW,
  OTHER_OWNER,
  OWNER,
  uid,
} from './catalog-setup.js';
import { authHeader, signTestToken } from '../support/auth.js';

const DB = 'stubb_read_it_catalog_organizer';

function summary(
  overrides: Partial<OrganizerEventDocument> & { _id: string },
): OrganizerEventDocument {
  return {
    organizerId: OWNER,
    version: 1,
    title: 'Evento',
    category: 'show',
    status: 'draft',
    sessionsCount: 0,
    publishedSessionsCount: 0,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function venueDoc(overrides: Partial<VenueDocument> & { _id: string }): VenueDocument {
  return {
    organizerId: OWNER,
    version: 1,
    detailsVersion: 1,
    name: 'Local',
    address: 'Rua A, 1',
    city: 'Porto Alegre',
    state: 'RS',
    timeZone: 'America/Sao_Paulo',
    cityKey: 'porto alegre',
    sectors: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('organizer reads (MongoDB)', () => {
  let ctx: CatalogTestContext;
  const col = (name: string) => ctx.client.db(DB).collection<{ _id: string }>(name);
  const get = async (path: string, sub: string = OWNER) =>
    request(ctx.server())
      .get(`/api/catalog/organizer${path}`)
      .set(await authHeader(sub));

  beforeAll(async () => {
    ctx = await createCatalogApp(DB);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    for (const name of Object.values(READ_STORE_COLLECTIONS)) await col(name).deleteMany({});
    ctx.setNow(NOW);
  });

  describe('authentication (CA-23)', () => {
    const routes = ['/events', `/events/${uid(900)}`, '/venues', `/venues/${uid(901)}`] as const;

    it.each(routes)('GET %s answers 401 without a token', async (path) => {
      const res = await request(ctx.server()).get(`/api/catalog/organizer${path}`);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
    });

    it.each(routes)('GET %s answers 403 with only the customer role', async (path) => {
      const res = await request(ctx.server())
        .get(`/api/catalog/organizer${path}`)
        .set(await authHeader(OWNER, ['customer']));
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('answers 401 for an expired token', async () => {
      const token = await signTestToken({
        sub: OWNER,
        roles: ['organizer'],
        issuedAt: Math.floor(Date.now() / 1000) - 3600,
      });
      const res = await request(ctx.server())
        .get('/api/catalog/organizer/events')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('keeps the public showcase open without a token', async () => {
      expect((await request(ctx.server()).get('/api/catalog/events')).status).toBe(200);
    });

    it('scopes each organizer to its own documents', async () => {
      await col(READ_STORE_COLLECTIONS.organizerEvents).insertMany([
        summary({ _id: uid(), title: 'Do dono' }),
        summary({ _id: uid(), title: 'Do outro', organizerId: OTHER_OWNER }),
      ]);
      const mine = ListOrganizerEventsResponseSchema.parse((await get('/events')).body);
      const theirs = ListOrganizerEventsResponseSchema.parse(
        (await get('/events', OTHER_OWNER)).body,
      );
      expect(mine.items.map((i) => i.title)).toEqual(['Do dono']);
      expect(theirs.items.map((i) => i.title)).toEqual(['Do outro']);
    });
  });

  describe('GET /events (CA-36)', () => {
    it('lists only the seed organizer, newest first with id as tiebreak, paginated', async () => {
      const same = new Date('2026-10-05T00:00:00.000Z');
      const [a, b, c] = [uid(), uid(), uid()];
      await col(READ_STORE_COLLECTIONS.organizerEvents).insertMany([
        summary({ _id: a, title: 'Antigo', createdAt: new Date('2026-10-01T00:00:00.000Z') }),
        summary({
          _id: b,
          title: 'Empate B',
          createdAt: same,
          status: 'published',
          sessionsCount: 3,
          publishedSessionsCount: 2,
        }),
        summary({ _id: c, title: 'Empate C', createdAt: same }),
        summary({ _id: uid(), title: 'De outro dono', organizerId: OTHER_OWNER }),
      ]);
      const res = await get('/events');
      expect(res.status).toBe(200);
      const parsed = ListOrganizerEventsResponseSchema.parse(res.body);
      expect(parsed).toMatchObject({ page: 1, pageSize: 12, total: 3 });
      expect(parsed.items.map((i) => i.title)).toEqual(['Empate C', 'Empate B', 'Antigo']);
      expect(parsed.items[1]).toEqual({
        id: b,
        title: 'Empate B',
        category: 'show',
        status: 'published',
        sessionsCount: 3,
        publishedSessionsCount: 2,
        createdAt: same.toISOString(),
      });

      const page2 = ListOrganizerEventsResponseSchema.parse(
        (await get('/events?page=2&pageSize=2')).body,
      );
      expect(page2.items.map((i) => i.title)).toEqual(['Antigo']);
      expect(page2.total).toBe(3);
    });

    it('rejects an invalid page size with 400', async () => {
      expect((await get('/events?pageSize=49')).status).toBe(400);
      expect((await get('/events?page=0')).status).toBe(400);
    });
  });

  describe('GET /events/:id (CA-36)', () => {
    it('returns drafts, every batch with its badge and the derived flags', async () => {
      const id = uid();
      const draftSession = uid();
      const liveSession = uid();
      const sectorId = uid();
      const batches = [
        {
          id: uid(),
          name: 'Lote 1',
          priceCents: 8000,
          quantity: null,
          endsAt: day(-2),
          position: 0,
        },
        { id: uid(), name: 'Lote 2', priceCents: 9000, quantity: 50, endsAt: day(4), position: 1 },
        { id: uid(), name: 'Lote 3', priceCents: 10000, quantity: null, endsAt: null, position: 2 },
      ];
      const sectorOf = (sid: string) => ({
        id: sid,
        venueSectorId: uid(),
        name: 'Pista',
        kind: 'general_admission' as const,
        capacity: 200,
        rows: null,
        position: 0,
        batches,
      });
      await col(READ_STORE_COLLECTIONS.eventDetail).insertOne(
        detailDoc({
          _id: id,
          version: 4,
          status: 'published',
          sessions: [
            detailSession({
              id: draftSession,
              status: 'draft',
              startsAt: day(40),
              sectors: [sectorOf(uid())],
            }),
            detailSession({ id: liveSession, startsAt: day(10), sectors: [sectorOf(sectorId)] }),
          ],
        }),
      );
      const res = await get(`/events/${id}`);
      expect(res.status).toBe(200);
      const { event } = GetOrganizerEventResponseSchema.parse(res.body);
      expect(event.createdAt).toBe('2026-10-01T00:00:00.000Z');
      expect(event.sessions.map((s) => s.id)).toEqual([liveSession, draftSession]);
      const [live, draft] = event.sessions;
      expect(live).toMatchObject({ status: 'published', ended: false, salesOpen: true });
      expect(live?.sectors[0]?.batches.map((b) => b.badge)).toEqual([
        'ended',
        'current',
        'upcoming',
      ]);
      expect(draft).toMatchObject({ status: 'draft', salesOpen: false });
      expect(draft?.sectors[0]?.batches.map((b) => b.badge)).toEqual([
        'ended',
        'upcoming',
        'upcoming',
      ]);
    });

    it('flags a started session as ended with every batch ended', async () => {
      const id = uid();
      await col(READ_STORE_COLLECTIONS.eventDetail).insertOne(
        detailDoc({
          _id: id,
          sessions: [
            detailSession({
              id: uid(),
              startsAt: day(-1),
              sectors: [
                {
                  id: uid(),
                  venueSectorId: uid(),
                  name: 'Pista',
                  kind: 'general_admission',
                  capacity: 10,
                  rows: null,
                  position: 0,
                  batches: [
                    {
                      id: uid(),
                      name: 'L',
                      priceCents: 1,
                      quantity: null,
                      endsAt: null,
                      position: 0,
                    },
                  ],
                },
              ],
            }),
          ],
        }),
      );
      const { event } = GetOrganizerEventResponseSchema.parse((await get(`/events/${id}`)).body);
      expect(event.sessions[0]).toMatchObject({ ended: true, salesOpen: false });
      expect(event.sessions[0]?.sectors[0]?.batches[0]?.badge).toBe('ended');
    });

    it('hides a document of another organizer', async () => {
      const id = uid();
      await col(READ_STORE_COLLECTIONS.eventDetail).insertOne(
        detailDoc({ _id: id, organizerId: OTHER_OWNER }),
      );
      const res = await get(`/events/${id}`);
      expect(res.status).toBe(404);
      expect(body<{ minVersionReached: boolean }>(res).minVersionReached).toBe(false);
    });

    it('answers 404 with minVersionReached=true for the tombstone after the discard (CA-32)', async () => {
      const id = uid();
      await ctx.client
        .db(DB)
        .collection<{ _id: string; version: number; status: string }>(
          READ_STORE_COLLECTIONS.eventDetail,
        )
        .insertOne({ _id: id, version: 6, status: 'discarded' });
      const res = await get(`/events/${id}?min_version=6`);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ statusCode: 404, minVersionReached: true });
    });

    it('waits for min_version and times out with the current state', async () => {
      const id = uid();
      await col(READ_STORE_COLLECTIONS.eventDetail).insertOne(detailDoc({ _id: id, version: 1 }));
      setTimeout(
        () =>
          void col(READ_STORE_COLLECTIONS.eventDetail).updateOne(
            { _id: id },
            { $set: { version: 2 } },
          ),
        400,
      );
      const caught = GetOrganizerEventResponseSchema.parse(
        (await get(`/events/${id}?min_version=2`)).body,
      );
      expect(caught).toMatchObject({ minVersionReached: true, event: { version: 2 } });

      const started = Date.now();
      const late = GetOrganizerEventResponseSchema.parse(
        (await get(`/events/${id}?min_version=3`)).body,
      );
      expect(late).toMatchObject({ minVersionReached: false, event: { version: 2 } });
      expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    });
  });

  describe('venues (CA-37)', () => {
    it('lists only the seed organizer in alphabetical order ignoring case and accents', async () => {
      const [x, y] = [uid(50), uid(51)];
      await col(READ_STORE_COLLECTIONS.venues).insertMany([
        venueDoc({ _id: uid(), name: 'zeppelin' }),
        venueDoc({ _id: y, name: 'Arena' }),
        venueDoc({ _id: x, name: 'arena' }),
        venueDoc({
          _id: uid(),
          name: 'Álamo',
          sectors: [
            {
              id: uid(),
              name: 'Pista',
              kind: 'general_admission',
              capacity: 10,
              rows: null,
              position: 0,
            },
          ],
        }),
        venueDoc({ _id: uid(), name: 'Alheio', organizerId: OTHER_OWNER }),
      ]);
      const res = await get('/venues');
      expect(res.status).toBe(200);
      const { items } = ListVenuesResponseSchema.parse(res.body);
      expect(items.map((v) => v.name)).toEqual(['Álamo', 'arena', 'Arena', 'zeppelin']);
      expect(items.map((v) => v.id).slice(1, 3)).toEqual([x, y]);
      expect(items[0]).toMatchObject({
        city: 'Porto Alegre',
        state: 'RS',
        sectorsCount: 1,
        version: 1,
        timeZone: 'America/Sao_Paulo',
      });
    });

    it('returns the plant with computed capacity, sorted by position', async () => {
      const id = uid();
      await col(READ_STORE_COLLECTIONS.venues).insertOne(
        venueDoc({
          _id: id,
          version: 3,
          sectors: [
            {
              id: uid(),
              name: 'Plateia',
              kind: 'seated',
              capacity: 30,
              rows: [
                { label: 'A', seats: 10 },
                { label: 'B', seats: 20 },
              ],
              position: 1,
            },
            {
              id: uid(),
              name: 'Pista',
              kind: 'general_admission',
              capacity: 500,
              rows: null,
              position: 0,
            },
          ],
        }),
      );
      const { venue, minVersionReached } = GetVenueResponseSchema.parse(
        (await get(`/venues/${id}`)).body,
      );
      expect(minVersionReached).toBe(true);
      expect(venue).toMatchObject({ id, version: 3, address: 'Rua A, 1' });
      expect(venue.sectors.map((s) => [s.name, s.capacity])).toEqual([
        ['Pista', 500],
        ['Plateia', 30],
      ]);
      expect(venue.sectors[1]?.rows).toEqual([
        { label: 'A', seats: 10 },
        { label: 'B', seats: 20 },
      ]);
    });

    it('respects min_version and hides other owners', async () => {
      const id = uid();
      const foreign = uid();
      await col(READ_STORE_COLLECTIONS.venues).insertMany([
        venueDoc({ _id: id, version: 1 }),
        venueDoc({ _id: foreign, organizerId: OTHER_OWNER }),
      ]);
      setTimeout(
        () =>
          void col(READ_STORE_COLLECTIONS.venues).updateOne({ _id: id }, { $set: { version: 2 } }),
        400,
      );
      expect(
        GetVenueResponseSchema.parse((await get(`/venues/${id}?min_version=2`)).body),
      ).toMatchObject({
        minVersionReached: true,
        venue: { version: 2 },
      });
      const late = GetVenueResponseSchema.parse((await get(`/venues/${id}?min_version=5`)).body);
      expect(late).toMatchObject({ minVersionReached: false, venue: { version: 2 } });

      const hidden = await get(`/venues/${foreign}`);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toMatchObject({ statusCode: 404, minVersionReached: false });
      expect((await get(`/venues/${uid()}`)).status).toBe(404);
      expect((await get('/venues/abc')).status).toBe(400);
    });
  });
});
