import { DomainErrorResponseSchema } from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  body,
  countRows,
  createTestApp,
  newKey,
  rows,
  truncateAll,
  type TestApp,
} from '../setup.js';
import {
  CLOCK_OVERRIDE,
  OTHER_ORGANIZER_ID,
  TEST_ORGANIZER_ID,
  accept,
  addVenueSector,
  createEvent,
  eventBody,
  generalAdmission,
  publishPath,
  registerVenue,
  scheduleSession,
  send,
  sessionBody,
  venueBody,
} from './helpers.js';

const asB = <T>(fn: (actor: string) => Promise<T>) => fn(OTHER_ORGANIZER_ID);

describe('Posse no Catalog (CA-21, CA-22)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp([CLOCK_OVERRIDE]);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.dataSource);
  });

  async function ownedByA() {
    const venue = await registerVenue(ctx);
    const sector = await addVenueSector(ctx, venue.id, generalAdmission());
    const event = await createEvent(ctx);
    const session = await scheduleSession(ctx, event.id, venue.id);
    return {
      venueId: venue.id,
      sectorId: sector.entityId ?? '',
      eventId: event.id,
      sessionId: session.entityId ?? '',
    };
  }

  function expectNotFound(res: Awaited<ReturnType<typeof send>>) {
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(DomainErrorResponseSchema.parse(body(res)).code).toBe('AGGREGATE_NOT_FOUND');
  }

  it('B recebe 404 AGGREGATE_NOT_FOUND (nunca 409) nos commands de local de A', async () => {
    const a = await ownedByA();
    const base = `/api/catalog/venues/${a.venueId}`;
    const attempts = [
      // expectedVersion errada: posse vence versão.
      ['patch', base, venueBody({ expectedVersion: 99 })],
      ['patch', base, venueBody({ expectedVersion: 3 })],
      ['post', `${base}/sectors`, generalAdmission('Outra')],
      ['delete', `${base}/sectors/${a.sectorId}`, undefined],
    ] as const;
    for (const [method, path, payload] of attempts) {
      expectNotFound(await asB((actor) => send(ctx, method, path, payload, newKey(), actor)));
    }
    const venue = await rows<{ version: number; name: string }>(
      ctx.dataSource,
      'SELECT version, name FROM catalog_venues WHERE id = $1',
      [a.venueId],
    );
    expect(venue[0]).toMatchObject({ version: 2, name: 'Teatro Aurora' });
    expect(await countRows(ctx.dataSource, 'catalog_venue_sectors')).toBe(1);
  });

  it('B recebe 404 AGGREGATE_NOT_FOUND (nunca 409) nos commands de evento de A', async () => {
    const a = await ownedByA();
    const base = `/api/catalog/events/${a.eventId}`;
    const session = `${base}/sessions/${a.sessionId}`;
    const attempts = [
      ['patch', base, eventBody({ expectedVersion: 99, imageUrl: null })],
      ['patch', base, eventBody({ expectedVersion: 2, imageUrl: null })],
      ['delete', base, undefined],
      ['post', `${base}/sessions`, sessionBody(a.venueId)],
      ['delete', session, undefined],
      ['post', publishPath(a.eventId, a.sessionId), {}],
      ['post', `${session}/sectors`, { venueSectorId: a.sectorId }],
    ] as const;
    for (const [method, path, payload] of attempts) {
      expectNotFound(await asB((actor) => send(ctx, method, path, payload, newKey(), actor)));
    }
    const event = await rows<{ version: number; title: string }>(
      ctx.dataSource,
      'SELECT version, title FROM catalog_events WHERE id = $1',
      [a.eventId],
    );
    expect(event[0]).toMatchObject({ title: 'Hamlet' });
    expect(event[0]?.version).toBe(2);
    expect(await countRows(ctx.dataSource, 'catalog_sessions')).toBe(1);
  });

  it('o dono continua operando normalmente', async () => {
    const a = await ownedByA();
    const res = await send(
      ctx,
      'patch',
      `/api/catalog/venues/${a.venueId}`,
      venueBody({ expectedVersion: 2, name: 'Novo nome' }),
    );
    expect(res.status).toBe(202);
  });

  it('B agenda sessão no próprio evento com o local de A: 422 VENUE_NOT_FOUND', async () => {
    const a = await ownedByA();
    const eventB = await accept(
      ctx,
      'post',
      '/api/catalog/events',
      eventBody(),
      OTHER_ORGANIZER_ID,
    );
    const res = await asB((actor) =>
      send(
        ctx,
        'post',
        `/api/catalog/events/${eventB.id}/sessions`,
        sessionBody(a.venueId),
        newKey(),
        actor,
      ),
    );
    expect(res.status).toBe(422);
    expect(DomainErrorResponseSchema.parse(body(res)).code).toBe('VENUE_NOT_FOUND');
    expect(await countRows(ctx.dataSource, 'catalog_sessions')).toBe(1);
  });

  it('organizerId vem do sub do token', async () => {
    const venueA = await registerVenue(ctx);
    const eventB = await accept(
      ctx,
      'post',
      '/api/catalog/events',
      eventBody(),
      OTHER_ORGANIZER_ID,
    );
    const venue = await rows<{ organizer_id: string }>(
      ctx.dataSource,
      'SELECT organizer_id FROM catalog_venues WHERE id = $1',
      [venueA.id],
    );
    const event = await rows<{ organizer_id: string }>(
      ctx.dataSource,
      'SELECT organizer_id FROM catalog_events WHERE id = $1',
      [eventB.id],
    );
    expect(venue[0]?.organizer_id).toBe(TEST_ORGANIZER_ID);
    expect(event[0]?.organizer_id).toBe(OTHER_ORGANIZER_ID);
  });

  it('mesma chave e mesmo corpo por A e B geram dois locais (CA-22)', async () => {
    const key = newKey();
    const first = await send(ctx, 'post', '/api/catalog/venues', venueBody(), key);
    const second = await send(
      ctx,
      'post',
      '/api/catalog/venues',
      venueBody(),
      key,
      OTHER_ORGANIZER_ID,
    );
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(body<{ id: string }>(first).id).not.toBe(body<{ id: string }>(second).id);
    const venues = await rows<{ organizer_id: string }>(
      ctx.dataSource,
      'SELECT organizer_id FROM catalog_venues ORDER BY organizer_id',
    );
    expect(venues.map((v) => v.organizer_id)).toEqual([TEST_ORGANIZER_ID, OTHER_ORGANIZER_ID]);
    // A repetição do mesmo ator continua idempotente.
    const replay = await send(ctx, 'post', '/api/catalog/venues', venueBody(), key);
    expect(body<{ id: string }>(replay).id).toBe(body<{ id: string }>(first).id);
    expect(await countRows(ctx.dataSource, 'catalog_venues')).toBe(2);
  });
});
