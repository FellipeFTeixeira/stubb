import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { body, countRows, createTestApp, rows, truncateAll, type TestApp } from '../setup.js';
import {
  CLOCK_OVERRIDE,
  addBatch,
  clockState,
  resetClock,
  createEvent,
  draftSession,
  must,
  outboxRows,
  parseEnvelope,
  publishPath,
  readySession,
  scheduleSession,
  send,
  venueWithSectors,
} from './helpers.js';

describe('PublishSession', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp([CLOCK_OVERRIDE]);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    resetClock();
    await truncateAll(ctx.dataSource);
  });

  const publish = (eventId: string, sessionId: string) =>
    send(ctx, 'post', publishPath(eventId, sessionId), {});

  it('CA-17: publica a sessão e o evento, com uma só linha SessionPublished (retrato completo)', async () => {
    const ready = await readySession(ctx);
    const before = await countRows(ctx.dataSource, 'outbox');
    const res = await publish(ready.eventId, ready.sessionId);
    expect(res.status).toBe(202);
    expect(body(res)).toMatchObject({ id: ready.eventId, version: 5 });

    const [event] = await rows(
      ctx.dataSource,
      'SELECT status, version FROM catalog_events WHERE id = $1',
      [ready.eventId],
    );
    expect(event).toEqual({ status: 'published', version: 5 });
    const [session] = await rows(
      ctx.dataSource,
      'SELECT status FROM catalog_sessions WHERE id = $1',
      [ready.sessionId],
    );
    expect(session).toEqual({ status: 'published' });

    expect(await countRows(ctx.dataSource, 'outbox')).toBe(before + 1);
    const published = (await outboxRows(ctx, ready.eventId)).filter(
      (r) => r.event_type === 'SessionPublished',
    );
    expect(published).toHaveLength(1);
    const envelope = parseEnvelope(must(published[0], 'SessionPublished'));
    expect(envelope.aggregateVersion).toBe(5);
    const payload = envelope.payload as {
      session: { sessionId: string; sectors: Array<{ batches: unknown[] }> };
    };
    expect(payload.session.sessionId).toBe(ready.sessionId);
    expect(payload.session.sectors).toHaveLength(2);
    expect(payload.session.sectors.every((s) => s.batches.length === 1)).toBe(true);
    expect((await outboxRows(ctx)).some((r) => r.event_type === 'EventPublished')).toBe(false);
  });

  it('CA-17: uma segunda sessão publicada depois também emite só SessionPublished', async () => {
    const ready = await readySession(ctx);
    expect((await publish(ready.eventId, ready.sessionId)).status).toBe(202);
    const second = await scheduleSession(ctx, ready.eventId, ready.venueId, {
      startsAt: '2026-12-11T23:00:00.000Z',
    });
    const secondId = second.entityId ?? '';
    const sectors = await rows<{ id: string }>(
      ctx.dataSource,
      'SELECT id FROM catalog_session_sectors WHERE session_id = $1',
      [secondId],
    );
    for (const s of sectors) {
      await addBatch(ctx, { eventId: ready.eventId, sessionId: secondId, sectorId: s.id });
    }
    const before = await countRows(ctx.dataSource, 'outbox');
    expect((await publish(ready.eventId, secondId)).status).toBe(202);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(before + 1);
    const types = (await outboxRows(ctx, ready.eventId)).map((r) => r.event_type);
    expect(types.filter((t) => t === 'SessionPublished')).toHaveLength(2);
  });

  it('CA-18: sessão já publicada é SESSION_NOT_DRAFT', async () => {
    const ready = await readySession(ctx);
    await publish(ready.eventId, ready.sessionId);
    const res = await publish(ready.eventId, ready.sessionId);
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'SESSION_NOT_DRAFT' });
  });

  it('CA-18: sem setores é SESSION_WITHOUT_SECTORS; setor sem lote é SECTOR_WITHOUT_BATCH', async () => {
    const draft = await draftSession(ctx);
    const [first, second] = draft.sectors;
    await addBatch(ctx, {
      eventId: draft.eventId,
      sessionId: draft.sessionId,
      sectorId: must(first, 'sector').id,
    });
    const incomplete = await publish(draft.eventId, draft.sessionId);
    expect(incomplete.status).toBe(422);
    expect(body(incomplete)).toMatchObject({ code: 'SECTOR_WITHOUT_BATCH' });

    const base = `/api/catalog/events/${draft.eventId}/sessions/${draft.sessionId}/sectors`;
    await send(ctx, 'delete', `${base}/${must(first, 'sector').id}`);
    await send(ctx, 'delete', `${base}/${must(second, 'sector').id}`);
    const empty = await publish(draft.eventId, draft.sessionId);
    expect(empty.status).toBe(422);
    expect(body(empty)).toMatchObject({ code: 'SESSION_WITHOUT_SECTORS' });
  });

  it('CA-18: startsAt no passado e lote com endsAt vencido (relógio avançado)', async () => {
    const venue = await venueWithSectors(ctx);
    const event = await createEvent(ctx);
    const session = await scheduleSession(ctx, event.id, venue.venueId);
    const sessionId = session.entityId ?? '';
    const sectors = await rows<{ id: string }>(
      ctx.dataSource,
      'SELECT id FROM catalog_session_sectors WHERE session_id = $1',
      [sessionId],
    );
    for (const [index, sector] of sectors.entries()) {
      await addBatch(
        ctx,
        { eventId: event.id, sessionId, sectorId: sector.id },
        index === 0 ? { endsAt: '2026-11-10T00:00:00.000Z' } : {},
      );
    }

    // Avança o relógio do app para depois do fim do lote e antes do início da sessão.
    clockState.now = new Date('2026-11-20T00:00:00.000Z');
    const ended = await publish(event.id, sessionId);
    expect(ended.status).toBe(422);
    expect(body(ended)).toMatchObject({ code: 'BATCH_ENDED' });

    clockState.now = new Date('2026-12-20T00:00:00.000Z');
    const past = await publish(event.id, sessionId);
    expect(past.status).toBe(422);
    expect(body(past)).toMatchObject({ code: 'SESSION_START_NOT_IN_FUTURE' });
  });
});
