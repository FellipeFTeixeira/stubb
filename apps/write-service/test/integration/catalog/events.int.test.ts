import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  body,
  countRows,
  createTestApp,
  rows,
  truncateAll,
  type TestApp,
  UUID_V7,
} from '../setup.js';
import {
  CLOCK_OVERRIDE,
  SEED_ORGANIZER_ID,
  eventBody,
  outboxRows,
  parseEnvelope,
  publishPath,
  readySession,
  createEvent,
  send,
  venueWithSectors,
  scheduleSession,
  addBatch,
  must,
} from './helpers.js';

describe('Evento', () => {
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

  it('CA-10: CreateEvent sem imageUrl nasce Rascunho com dono seed e imageUrl nulo', async () => {
    const res = await send(ctx, 'post', '/api/catalog/events', eventBody());
    expect(res.status).toBe(202);
    const { id, version } = body<{ id: string; version: number }>(res);
    expect(id).toMatch(UUID_V7);
    expect(version).toBe(1);

    const [row] = await rows(
      ctx.dataSource,
      'SELECT organizer_id, title, status, image_url, version FROM catalog_events WHERE id = $1',
      [id],
    );
    expect(row).toEqual({
      organizer_id: SEED_ORGANIZER_ID,
      title: 'Hamlet',
      status: 'draft',
      image_url: null,
      version: 1,
    });
    const outbox = await outboxRows(ctx, id);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      bounded_context: 'catalog',
      aggregate_type: 'Event',
      aggregate_id: id,
      aggregate_version: 1,
      event_type: 'EventCreated',
    });
    expect(parseEnvelope(must(outbox[0], 'outbox')).payload).toMatchObject({
      organizerId: SEED_ORGANIZER_ID,
      imageUrl: null,
    });
  });

  it('CA-11: UpdateEventDetails em Rascunho e em Publicado; versão errada é 409', async () => {
    const draft = await createEvent(ctx);
    const path = `/api/catalog/events/${draft.id}`;
    const ok = await send(
      ctx,
      'patch',
      path,
      eventBody({ title: 'Hamlet II', imageUrl: 'https://x.test/h.png', expectedVersion: 1 }),
    );
    expect(ok.status).toBe(202);
    expect(body(ok)).toEqual({ id: draft.id, version: 2 });

    const stale = await send(
      ctx,
      'patch',
      path,
      eventBody({ title: 'Velho', imageUrl: null, expectedVersion: 1 }),
    );
    expect(stale.status).toBe(409);
    expect(body(stale)).toMatchObject({ code: 'CONCURRENCY_CONFLICT' });

    // imageUrl nulo remove a imagem (I-8)
    const cleared = await send(
      ctx,
      'patch',
      path,
      eventBody({ title: 'Hamlet II', imageUrl: null, expectedVersion: 2 }),
    );
    expect(cleared.status).toBe(202);
    const [row] = await rows(
      ctx.dataSource,
      'SELECT title, image_url, version FROM catalog_events WHERE id = $1',
      [draft.id],
    );
    expect(row).toEqual({ title: 'Hamlet II', image_url: null, version: 3 });

    // Publicado
    const ready = await readySession(ctx);
    const published = await send(ctx, 'post', publishPath(ready.eventId, ready.sessionId), {});
    expect(published.status).toBe(202);
    const { version } = body<{ version: number }>(published);
    const edited = await send(
      ctx,
      'patch',
      `/api/catalog/events/${ready.eventId}`,
      eventBody({ title: 'Editado depois de publicar', imageUrl: null, expectedVersion: version }),
    );
    expect(edited.status).toBe(202);
    expect(body(edited)).toMatchObject({ version: version + 1 });
    const updates = (await outboxRows(ctx, ready.eventId)).filter(
      (r) => r.event_type === 'EventDetailsUpdated',
    );
    expect(updates).toHaveLength(1);
  });

  it('CA-20: DiscardEvent de rascunho apaga tudo (CASCADE) e grava EventDiscarded; depois dá 404', async () => {
    const venue = await venueWithSectors(ctx);
    const event = await createEvent(ctx);
    const session = await scheduleSession(ctx, event.id, venue.venueId);
    const sessionId = session.entityId ?? '';
    const [sector] = await rows<{ id: string }>(
      ctx.dataSource,
      'SELECT id FROM catalog_session_sectors WHERE session_id = $1 LIMIT 1',
      [sessionId],
    );
    await addBatch(ctx, { eventId: event.id, sessionId, sectorId: sector?.id ?? '' });
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(1);

    const res = await send(ctx, 'delete', `/api/catalog/events/${event.id}`);
    expect(res.status).toBe(202);
    expect(await countRows(ctx.dataSource, 'catalog_events')).toBe(0);
    expect(await countRows(ctx.dataSource, 'catalog_sessions')).toBe(0);
    expect(await countRows(ctx.dataSource, 'catalog_session_sectors')).toBe(0);
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(0);
    // O local e a planta não são tocados
    expect(await countRows(ctx.dataSource, 'catalog_venues')).toBe(1);
    expect(await countRows(ctx.dataSource, 'catalog_venue_sectors')).toBe(2);

    const discarded = (await outboxRows(ctx, event.id)).filter(
      (r) => r.event_type === 'EventDiscarded',
    );
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.aggregate_version).toBe(4);

    const later = await send(
      ctx,
      'patch',
      `/api/catalog/events/${event.id}`,
      eventBody({ imageUrl: null, expectedVersion: 4 }),
    );
    expect(later.status).toBe(404);
    expect(body(later)).toMatchObject({ code: 'AGGREGATE_NOT_FOUND' });
  });

  it('CA-20: evento Publicado não pode ser descartado (422 EVENT_NOT_DRAFT)', async () => {
    const ready = await readySession(ctx);
    expect((await send(ctx, 'post', publishPath(ready.eventId, ready.sessionId), {})).status).toBe(
      202,
    );
    const res = await send(ctx, 'delete', `/api/catalog/events/${ready.eventId}`);
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'EVENT_NOT_DRAFT' });
    expect(await countRows(ctx.dataSource, 'catalog_events')).toBe(1);
  });
});
