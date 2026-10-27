import { ListEventsResponseSchema, READ_STORE_COLLECTIONS } from '@stubb/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  body,
  type CatalogTestContext,
  createCatalogApp,
  createListingIndexes,
  day,
  listingDoc,
  listingSession,
  uid,
} from './catalog-setup.js';

const DB = 'stubb_read_it_catalog_list';

describe('GET /api/catalog/events (MongoDB)', () => {
  let ctx: CatalogTestContext;

  const listing = () =>
    ctx.client
      .db(DB)
      .collection<ReturnType<typeof listingDoc>>(READ_STORE_COLLECTIONS.eventListing);
  const get = (query = '') => request(ctx.server()).get(`/api/catalog/events${query}`);
  const titles = (res: { body: unknown }): string[] =>
    ListEventsResponseSchema.parse(res.body).items.map((i) => i.title);

  beforeAll(async () => {
    ctx = await createCatalogApp(DB);
    await createListingIndexes(ctx.client, DB);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await listing().deleteMany({});
  });

  it('lists only events with a published, not started session that has a venue (RN-37)', async () => {
    await listing().insertMany([
      listingDoc({ _id: uid(), title: 'Futuro', titleSortKey: 'futuro' }),
      listingDoc({
        _id: uid(),
        title: 'Passado',
        titleSortKey: 'passado',
        sessions: [listingSession({ id: uid(), startsAt: day(-1) })],
      }),
      listingDoc({
        _id: uid(),
        title: 'Sem local',
        titleSortKey: 'sem local',
        sessions: [listingSession({ id: uid(), venue: null, cityKey: null })],
      }),
      listingDoc({ _id: uid(), title: 'Sem sessao', titleSortKey: 'sem sessao', sessions: [] }),
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Futuro']);
    expect(ListEventsResponseSchema.parse(res.body).total).toBe(1);
  });

  it('searches whole words ignoring case and accents, never prefixes', async () => {
    await listing().insertMany([
      listingDoc({ _id: uid(), title: 'Hamlet', titleSortKey: 'hamlet' }),
      listingDoc({ _id: uid(), title: 'Rock in Rio', titleSortKey: 'rock in rio' }),
    ]);
    expect(titles(await get('?q=hamlet'))).toEqual(['Hamlet']);
    expect(titles(await get('?q=H%C3%A1mlet'))).toEqual(['Hamlet']);
    expect(titles(await get('?q=HAMLET'))).toEqual(['Hamlet']);
    expect(titles(await get('?q=ham'))).toEqual([]);
  });

  it('filters by city ignoring accents and case; any visible session counts', async () => {
    await listing().insertMany([
      listingDoc({ _id: uid(), title: 'Em SP', titleSortKey: 'em sp' }),
      listingDoc({
        _id: uid(),
        title: 'No Rio',
        titleSortKey: 'no rio',
        sessions: [
          listingSession({
            id: uid(),
            venue: { name: 'Maracanã', city: 'Rio de Janeiro', state: 'RJ' },
            cityKey: 'rio de janeiro',
          }),
        ],
      }),
      listingDoc({
        _id: uid(),
        title: 'SP so no passado',
        titleSortKey: 'sp so no passado',
        sessions: [
          listingSession({ id: uid(), startsAt: day(-2) }),
          listingSession({
            id: uid(),
            venue: { name: 'Maracanã', city: 'Rio de Janeiro', state: 'RJ' },
            cityKey: 'rio de janeiro',
          }),
        ],
      }),
    ]);
    expect(titles(await get('?city=sao%20paulo'))).toEqual(['Em SP']);
    expect(titles(await get('?city=%20S%C3%83O%20PAULO%20'))).toEqual(['Em SP']);
    expect(titles(await get('?city=Rio%20de%20Janeiro'))).toEqual(['No Rio', 'SP so no passado']);
  });

  it('filters by category and combines with search', async () => {
    await listing().insertMany([
      listingDoc({ _id: uid(), title: 'Hamlet', titleSortKey: 'hamlet', category: 'theater' }),
      listingDoc({
        _id: uid(),
        title: 'Hamlet Rock',
        titleSortKey: 'hamlet rock',
        category: 'show',
      }),
      listingDoc({ _id: uid(), title: 'Circo', titleSortKey: 'circo', category: 'kids' }),
    ]);
    expect(titles(await get('?category=theater'))).toEqual(['Hamlet']);
    expect(titles(await get('?category=show&q=hamlet'))).toEqual(['Hamlet Rock']);
    expect((await get('?category=nope')).status).toBe(400);
  });

  it('orders by next session, then title sort key, then id (RN-45)', async () => {
    await listing().insertMany([
      listingDoc({
        _id: uid(),
        title: 'Zebra',
        titleSortKey: 'zebra',
        sessions: [listingSession({ id: uid(), startsAt: day(5) })],
      }),
      listingDoc({
        _id: uid(),
        title: 'Álamo',
        titleSortKey: 'alamo',
        sessions: [listingSession({ id: uid(), startsAt: day(5) })],
      }),
      listingDoc({
        _id: uid(),
        title: 'Tardio',
        titleSortKey: 'tardio',
        sessions: [listingSession({ id: uid(), startsAt: day(9) })],
      }),
      listingDoc({
        _id: uid(),
        title: 'Cedo',
        titleSortKey: 'cedo',
        // earliest visible session counts, not the earliest overall (past ones are ignored)
        sessions: [
          listingSession({ id: uid(), startsAt: day(-3) }),
          listingSession({ id: uid(), startsAt: day(1) }),
        ],
      }),
    ]);
    expect(titles(await get())).toEqual(['Cedo', 'Álamo', 'Zebra', 'Tardio']);
  });

  it('paginates and counts the filtered total', async () => {
    await listing().insertMany(
      [1, 2, 3, 4, 5].map((n) =>
        listingDoc({
          _id: uid(),
          title: `Evento ${n}`,
          titleSortKey: `evento ${n}`,
          sessions: [listingSession({ id: uid(), startsAt: day(n) })],
        }),
      ),
    );
    const page2 = ListEventsResponseSchema.parse((await get('?page=2&pageSize=2')).body);
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(page2.items.map((i) => i.title)).toEqual(['Evento 3', 'Evento 4']);
    const last = ListEventsResponseSchema.parse((await get('?page=3&pageSize=2')).body);
    expect(last.items.map((i) => i.title)).toEqual(['Evento 5']);
    const beyond = ListEventsResponseSchema.parse((await get('?page=9&pageSize=2')).body);
    expect(beyond).toMatchObject({ items: [], total: 5 });
  });

  it('defaults to page 1 and pageSize 12', async () => {
    const res = ListEventsResponseSchema.parse((await get()).body);
    expect(res).toMatchObject({ page: 1, pageSize: 12, total: 0, items: [] });
  });

  it('rejects pageSize 49, pageSize 0 and page 0 with 400', async () => {
    for (const query of ['?pageSize=49', '?pageSize=0', '?page=0', '?page=abc']) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
      expect(body<{ message: string }>(res).message).toBe('Validation failed');
    }
  });

  it('builds the card from the next session with price, other dates and asOf (CA-34)', async () => {
    await listing().insertOne(
      listingDoc({
        _id: uid(),
        title: 'Com preco',
        titleSortKey: 'com preco',
        sessions: [
          listingSession({
            id: uid(),
            startsAt: day(20),
            sectors: [
              {
                id: uid(),
                batches: [
                  { priceCents: 9000, endsAt: day(-5), position: 0 },
                  { priceCents: 7000, endsAt: null, position: 1 },
                ],
              },
            ],
          }),
          listingSession({ id: uid(), startsAt: day(10) }),
        ],
      }),
    );
    const res = ListEventsResponseSchema.parse((await get()).body);
    const [card] = res.items;
    expect(res.asOf).toBe(new Date(day(0)).toISOString());
    expect(card?.nextSession).toMatchObject({
      startsAt: day(10).toISOString(),
      timeZone: 'America/Sao_Paulo',
      venue: { name: 'Teatro Central', city: 'São Paulo', state: 'SP' },
    });
    expect(card?.otherUpcomingSessionsCount).toBe(1);
    expect(card?.price).toEqual({ kind: 'from', priceCents: 5000 });
  });

  it('shows sales_start and sales_ended prices', async () => {
    await listing().insertMany([
      listingDoc({
        _id: uid(),
        title: 'Em breve',
        titleSortKey: 'em breve',
        sessions: [listingSession({ id: uid(), salesStartsAt: day(3) })],
      }),
      listingDoc({
        _id: uid(),
        title: 'Esgotado por data',
        titleSortKey: 'esgotado por data',
        sessions: [
          listingSession({
            id: uid(),
            sectors: [{ id: uid(), batches: [{ priceCents: 100, endsAt: day(-1), position: 0 }] }],
          }),
        ],
      }),
    ]);
    const res = ListEventsResponseSchema.parse((await get()).body);
    const price = (title: string) => res.items.find((i) => i.title === title)?.price;
    expect(price('Em breve')).toEqual({ kind: 'sales_start', salesStartsAt: day(3).toISOString() });
    expect(price('Esgotado por data')).toEqual({ kind: 'sales_ended' });
  });

  it('follows the injected clock', async () => {
    await listing().insertOne(
      listingDoc({
        _id: uid(),
        title: 'Relogio',
        titleSortKey: 'relogio',
        sessions: [listingSession({ id: uid(), startsAt: day(30) })],
      }),
    );
    expect(titles(await get())).toEqual(['Relogio']);
    ctx.setNow(day(31));
    try {
      expect(titles(await get())).toEqual([]);
    } finally {
      ctx.setNow(day(0));
    }
  });
});
