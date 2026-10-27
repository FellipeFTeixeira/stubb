import {
  GetEventResponseSchema,
  ReadNotFoundResponseSchema,
  READ_STORE_COLLECTIONS,
  type EventDetailDocument,
  type EventDetailSector,
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
  uid,
} from './catalog-setup.js';

const DB = 'stubb_read_it_catalog_get_event';

function sector(name: string, position: number, batches: Array<[string, number, Date | null]>) {
  return {
    id: uid(),
    venueSectorId: uid(),
    name,
    kind: 'general_admission',
    capacity: 100,
    rows: null,
    position,
    batches: batches.map(([batchName, priceCents, endsAt], index) => ({
      id: uid(),
      name: batchName,
      priceCents,
      quantity: null,
      endsAt,
      position: index,
    })),
  } satisfies EventDetailSector;
}

describe('GET /api/catalog/events/:id (MongoDB)', () => {
  let ctx: CatalogTestContext;
  const detail = () =>
    ctx.client.db(DB).collection<{ _id: string }>(READ_STORE_COLLECTIONS.eventDetail);
  const insert = (doc: EventDetailDocument | { _id: string; version: number; status: string }) =>
    detail().insertOne(doc);
  const get = (id: string, query = '') =>
    request(ctx.server()).get(`/api/catalog/events/${id}${query}`);

  beforeAll(async () => {
    ctx = await createCatalogApp(DB);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await detail().deleteMany({});
    ctx.setNow(NOW);
  });

  it('shows published sessions only, with the sales state of each sector (CA-35)', async () => {
    const id = uid();
    const started = uid();
    const open = uid();
    const upcoming = uid();
    const lotsEnded = uid();
    const draft = uid();
    await insert(
      detailDoc({
        _id: id,
        version: 7,
        title: 'Festival',
        sessions: [
          detailSession({
            id: upcoming,
            startsAt: day(20),
            salesStartsAt: day(5),
            sectors: [sector('Pista', 0, [['L1', 3000, null]])],
          }),
          detailSession({
            id: draft,
            status: 'draft',
            startsAt: day(8),
            sectors: [sector('Pista', 0, [['L1', 1, null]])],
          }),
          detailSession({
            id: started,
            startsAt: day(-1),
            sectors: [sector('Pista', 0, [['L1', 1000, null]])],
          }),
          detailSession({
            id: open,
            startsAt: day(10),
            sectors: [
              sector('Pista', 0, [
                ['Lote 1', 8000, day(-3)],
                ['Lote 2', 9500, null],
              ]),
              sector('Camarote', 1, [['Unico', 20000, day(-1)]]),
            ],
          }),
          detailSession({
            id: lotsEnded,
            startsAt: day(15),
            sectors: [sector('Pista', 0, [['L1', 1000, day(-2)]])],
          }),
        ],
      }),
    );

    const res = await get(id);
    expect(res.status).toBe(200);
    const parsed = GetEventResponseSchema.parse(res.body);
    expect(parsed.minVersionReached).toBe(true);
    const { event } = parsed;
    expect(event).toMatchObject({ id, version: 7, title: 'Festival', ended: false });
    expect(event.asOf).toBe(NOW.toISOString());
    expect(event.sessions.map((s) => s.id)).toEqual([started, open, lotsEnded, upcoming]);

    const byId = new Map(event.sessions.map((s) => [s.id, s]));
    expect(byId.get(started)).toMatchObject({ ended: true, sectors: [] });
    expect(byId.get(open)?.sectors.map((s) => [s.name, s.sales])).toEqual([
      ['Pista', { status: 'open', batch: { name: 'Lote 2', priceCents: 9500 } }],
      ['Camarote', { status: 'ended' }],
    ]);
    expect(byId.get(lotsEnded)?.sectors[0]?.sales).toEqual({ status: 'ended' });
    expect(byId.get(upcoming)?.sectors[0]?.sales).toEqual({
      status: 'upcoming',
      salesStartsAt: day(5).toISOString(),
    });
    expect(byId.get(open)?.venue).toEqual({
      name: 'Teatro Central',
      address: 'Rua A, 1',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('marks the event as ended once every published session started, and keeps it reachable', async () => {
    const id = uid();
    await insert(
      detailDoc({
        _id: id,
        sessions: [
          detailSession({ id: uid(), startsAt: day(2) }),
          detailSession({ id: uid(), status: 'draft', startsAt: day(40) }),
        ],
      }),
    );
    expect(GetEventResponseSchema.parse((await get(id)).body).event.ended).toBe(false);
    ctx.setNow(day(3));
    const res = GetEventResponseSchema.parse((await get(id)).body);
    expect(res.event.ended).toBe(true);
    expect(res.event.sessions.every((s) => s.ended && s.sectors.length === 0)).toBe(true);
  });

  it('answers 404 for draft events, events without a visible session and unknown ids', async () => {
    const draftEvent = uid();
    const onlyDraftSessions = uid();
    const noVenue = uid();
    await insert(
      detailDoc({ _id: draftEvent, status: 'draft', sessions: [detailSession({ id: uid() })] }),
    );
    await insert(
      detailDoc({
        _id: onlyDraftSessions,
        sessions: [detailSession({ id: uid(), status: 'draft' })],
      }),
    );
    await insert(
      detailDoc({ _id: noVenue, sessions: [detailSession({ id: uid(), venue: null })] }),
    );
    // I-15: an existing document that satisfies min_version reports true even when hidden.
    const cases: Array<[string, boolean]> = [
      [draftEvent, true],
      [onlyDraftSessions, true],
      [noVenue, true],
      [uid(), false],
    ];
    for (const [id, reached] of cases) {
      const res = await get(id, '?min_version=1');
      expect(res.status, id).toBe(404);
      expect(ReadNotFoundResponseSchema.parse(res.body).minVersionReached).toBe(reached);
    }
  });

  it('answers 404 with minVersionReached=true for a tombstone that reached min_version (CA-32, I-15)', async () => {
    const id = uid();
    await insert({ _id: id, version: 5, status: 'discarded' });
    const reached = await get(id, '?min_version=5');
    expect(reached.status).toBe(404);
    expect(reached.body).toMatchObject({ statusCode: 404, minVersionReached: true });
    const without = await get(id);
    expect(without.status).toBe(404);
    expect(body<{ minVersionReached: boolean }>(without).minVersionReached).toBe(true);
  });

  it('answers immediately when min_version is already reached', async () => {
    const id = uid();
    await insert(detailDoc({ _id: id, version: 3, sessions: [detailSession({ id: uid() })] }));
    const started = Date.now();
    const res = await get(id, '?min_version=3');
    expect(Date.now() - started).toBeLessThan(500);
    expect(res.status).toBe(200);
    expect(body<{ minVersionReached: boolean }>(res).minVersionReached).toBe(true);
  });

  it('waits for the projection and then answers with the new version', async () => {
    const id = uid();
    await insert(detailDoc({ _id: id, version: 1, sessions: [detailSession({ id: uid() })] }));
    setTimeout(() => void detail().updateOne({ _id: id }, { $set: { version: 2 } }), 400);
    const res = await get(id, '?min_version=2');
    expect(res.status).toBe(200);
    const parsed = GetEventResponseSchema.parse(res.body);
    expect(parsed).toMatchObject({ minVersionReached: true, event: { version: 2 } });
  });

  it('times out after 3 s with the current state and minVersionReached=false', async () => {
    const id = uid();
    await insert(detailDoc({ _id: id, version: 1, sessions: [detailSession({ id: uid() })] }));
    const started = Date.now();
    const res = await get(id, '?min_version=2');
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(GetEventResponseSchema.parse(res.body)).toMatchObject({
      minVersionReached: false,
      event: { version: 1 },
    });
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThanOrEqual(4500);
  });

  it('rejects an invalid id and an invalid min_version with 400', async () => {
    expect((await get('abc')).status).toBe(400);
    expect((await get(uid(), '?min_version=0')).status).toBe(400);
  });
});
