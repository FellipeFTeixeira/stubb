import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { body, countRows, createTestApp, rows, truncateAll, type TestApp } from '../setup.js';
import {
  CLOCK_OVERRIDE,
  SALES_STARTS_AT,
  STARTS_AT,
  accept,
  addBatch,
  batchPath,
  createEvent,
  draftSession,
  generalAdmission,
  must,
  outboxRows,
  parseEnvelope,
  publishPath,
  registerVenue,
  scheduleSession,
  send,
  sessionBody,
  sessionSectors,
  venueWithSectors,
  readySession,
  addVenueSector,
} from './helpers.js';

describe('Sessão', () => {
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

  it('CA-12: ScheduleSession copia a planta (IDs novos, mesma ordem) e o fuso do local', async () => {
    const venue = await venueWithSectors(ctx, { timeZone: 'America/Manaus' });
    const event = await createEvent(ctx);
    const res = await send(
      ctx,
      'post',
      `/api/catalog/events/${event.id}/sessions`,
      sessionBody(venue.venueId, { timeZone: 'America/Manaus' }),
    );
    expect(res.status).toBe(202);
    const accepted = body<{ id: string; version: number; entityId: string }>(res);
    expect(accepted).toMatchObject({ id: event.id, version: 2 });

    const [session] = await rows(
      ctx.dataSource,
      'SELECT status, time_zone, venue_id, starts_at, sales_starts_at FROM catalog_sessions WHERE id = $1',
      [accepted.entityId],
    );
    expect(session).toMatchObject({
      status: 'draft',
      time_zone: 'America/Manaus',
      venue_id: venue.venueId,
    });

    const copies = await sessionSectors(ctx, accepted.entityId);
    expect(copies.map((c) => [c.name, c.venue_sector_id, c.position])).toEqual([
      ['Pista', venue.pistaId, 1],
      ['Plateia', venue.plateiaId, 2],
    ]);
    expect(copies.map((c) => c.id)).not.toContain(venue.pistaId);

    const scheduled = (await outboxRows(ctx, event.id)).find(
      (r) => r.event_type === 'SessionScheduled',
    );
    const envelope = parseEnvelope(must(scheduled, 'SessionScheduled'));
    expect(envelope.aggregateVersion).toBe(2);
    expect(envelope.payload).toMatchObject({
      sessionId: accepted.entityId,
      venueId: venue.venueId,
      timeZone: 'America/Manaus',
      startsAt: STARTS_AT,
      salesStartsAt: SALES_STARTS_AT,
    });
    const payload = envelope.payload as { sectors: Array<Record<string, unknown>> };
    expect(payload.sectors).toHaveLength(2);
    expect(
      payload.sectors.every((s) => Array.isArray(s['batches']) && s['batches'].length === 0),
    ).toBe(true);
    expect(payload.sectors.every((s) => !('active' in s))).toBe(true);
  });

  it('CA-13: rejeições do ScheduleSession não gravam nada (nem outbox, nem chave)', async () => {
    const venue = await venueWithSectors(ctx);
    const empty = await registerVenue(ctx);
    const event = await createEvent(ctx);
    await scheduleSession(ctx, event.id, venue.venueId);

    const path = `/api/catalog/events/${event.id}/sessions`;
    const snapshot = async () => ({
      outbox: await countRows(ctx.dataSource, 'outbox'),
      keys: await countRows(ctx.dataSource, 'idempotency_keys'),
      sessions: await countRows(ctx.dataSource, 'catalog_sessions'),
    });
    const before = await snapshot();

    const cases: Array<[string, unknown, string]> = [
      ['VENUE_NOT_FOUND', sessionBody('0190a0a0-0000-7000-8000-000000000999'), 'VENUE_NOT_FOUND'],
      [
        'fuso',
        sessionBody(venue.venueId, { timeZone: 'America/Manaus' }),
        'VENUE_TIME_ZONE_CHANGED',
      ],
      ['sem setores', sessionBody(empty.id), 'VENUE_WITHOUT_SECTORS'],
      [
        'passado',
        sessionBody(venue.venueId, {
          startsAt: '2026-10-01T20:00:00.000Z',
          salesStartsAt: '2026-09-01T20:00:00.000Z',
        }),
        'SESSION_START_NOT_IN_FUTURE',
      ],
      ['duplicada', sessionBody(venue.venueId), 'SESSION_DUPLICATED'],
    ];
    for (const [, payload, code] of cases) {
      const res = await send(ctx, 'post', path, payload);
      expect(res.status, code).toBe(422);
      expect(body(res)).toMatchObject({ code });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('CA-13: a 51ª sessão é SESSION_LIMIT_REACHED', async () => {
    const venue = await venueWithSectors(ctx);
    const event = await createEvent(ctx);
    for (let day = 1; day <= 50; day += 1) {
      const startsAt = new Date(Date.UTC(2027, 0, day, 20)).toISOString();
      await scheduleSession(ctx, event.id, venue.venueId, { startsAt });
    }
    const res = await send(
      ctx,
      'post',
      `/api/catalog/events/${event.id}/sessions`,
      sessionBody(venue.venueId, { startsAt: '2028-01-01T20:00:00.000Z' }),
    );
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'SESSION_LIMIT_REACHED' });
  });

  it('CA-14: setores da sessão (remover leva os lotes, recopiar, já presente, outro local)', async () => {
    const draft = await draftSession(ctx);
    const base = `/api/catalog/events/${draft.eventId}/sessions/${draft.sessionId}/sectors`;
    const pista = must(
      draft.sectors.find((s) => s.name === 'Pista'),
      'Pista',
    );
    const plateia = must(
      draft.sectors.find((s) => s.name === 'Plateia'),
      'Plateia',
    );
    await addBatch(ctx, { eventId: draft.eventId, sessionId: draft.sessionId, sectorId: pista.id });
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(1);

    const removal = await send(ctx, 'delete', `${base}/${pista.id}`);
    expect(removal.status).toBe(202);
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(0);
    expect((await sessionSectors(ctx, draft.sessionId)).map((s) => s.name)).toEqual(['Plateia']);

    const readded = await send(ctx, 'post', base, { venueSectorId: draft.pistaId });
    expect(readded.status).toBe(202);
    const { entityId } = body<{ entityId: string }>(readded);
    const sectors = await sessionSectors(ctx, draft.sessionId);
    expect(sectors.map((s) => [s.name, s.position])).toEqual([
      ['Pista', 1],
      ['Plateia', 2],
    ]);
    expect(entityId).not.toBe(pista.id);
    expect(sectors.find((s) => s.name === 'Pista')?.id).toBe(entityId);

    const again = await send(ctx, 'post', base, { venueSectorId: plateia.venue_sector_id });
    expect(again.status).toBe(422);
    expect(body(again)).toMatchObject({ code: 'SESSION_SECTOR_ALREADY_PRESENT' });

    const other = await venueWithSectors(ctx);
    const foreign = await send(ctx, 'post', base, { venueSectorId: other.pistaId });
    expect(foreign.status).toBe(422);
    expect(body(foreign)).toMatchObject({ code: 'VENUE_SECTOR_NOT_FOUND' });
  });

  it('CA-14: o nome do setor da planta recopiado em conflito com o da sessão é SESSION_SECTOR_NAME_TAKEN', async () => {
    const draft = await draftSession(ctx);
    // Planta ganha um setor "pista" (outro ID, mesmo nome sem diferenciar maiúsculas) depois do agendamento.
    await send(ctx, 'delete', `/api/catalog/venues/${draft.venueId}/sectors/${draft.pistaId}`);
    const replacement = await addVenueSector(ctx, draft.venueId, generalAdmission('pista', 50));
    const res = await send(
      ctx,
      'post',
      `/api/catalog/events/${draft.eventId}/sessions/${draft.sessionId}/sectors`,
      { venueSectorId: replacement.entityId },
    );
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'SESSION_SECTOR_NAME_TAKEN' });
  });

  it('CA-16: RemoveBatch e RemoveSession apagam as linhas filhas e emitem BatchRemoved/SessionRemoved', async () => {
    const draft = await readySession(ctx);
    const sector = must(draft.sectors[0], 'sector');
    const [batch] = await rows<{ id: string }>(
      ctx.dataSource,
      'SELECT id FROM catalog_batches WHERE session_sector_id = $1',
      [sector.id],
    );
    const removeBatch = await send(
      ctx,
      'delete',
      `${batchPath(draft.eventId, draft.sessionId, sector.id)}/${must(batch, 'batch').id}`,
    );
    expect(removeBatch.status).toBe(202);
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(1);

    const removeSession = await send(
      ctx,
      'delete',
      `/api/catalog/events/${draft.eventId}/sessions/${draft.sessionId}`,
    );
    expect(removeSession.status).toBe(202);
    expect(await countRows(ctx.dataSource, 'catalog_sessions')).toBe(0);
    expect(await countRows(ctx.dataSource, 'catalog_session_sectors')).toBe(0);
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(0);
    const types = (await outboxRows(ctx, draft.eventId)).map((r) => r.event_type);
    expect(types).toContain('BatchRemoved');
    expect(types).toContain('SessionRemoved');

    const missing = await send(
      ctx,
      'delete',
      `/api/catalog/events/${draft.eventId}/sessions/${draft.sessionId}`,
    );
    expect(missing.status).toBe(404);
    expect(body(missing)).toMatchObject({ code: 'ENTITY_NOT_FOUND' });
  });

  it('CA-19: sessão publicada fica congelada, mas o evento aceita nova sessão em Rascunho', async () => {
    const ready = await readySession(ctx);
    expect((await send(ctx, 'post', publishPath(ready.eventId, ready.sessionId), {})).status).toBe(
      202,
    );

    const sector = must(ready.sectors[0], 'sector');
    const [batch] = await rows<{ id: string }>(
      ctx.dataSource,
      'SELECT id FROM catalog_batches WHERE session_sector_id = $1',
      [sector.id],
    );
    const sessionPath = `/api/catalog/events/${ready.eventId}/sessions/${ready.sessionId}`;
    const attempts: Array<[string, () => ReturnType<typeof send>]> = [
      ['RemoveSession', () => send(ctx, 'delete', sessionPath)],
      [
        'AddSessionSector',
        () => send(ctx, 'post', `${sessionPath}/sectors`, { venueSectorId: ready.pistaId }),
      ],
      ['RemoveSessionSector', () => send(ctx, 'delete', `${sessionPath}/sectors/${sector.id}`)],
      [
        'AddBatch',
        () =>
          send(ctx, 'post', batchPath(ready.eventId, ready.sessionId, sector.id), {
            name: 'Novo',
            priceCents: 100,
          }),
      ],
      [
        'RemoveBatch',
        () =>
          send(
            ctx,
            'delete',
            `${batchPath(ready.eventId, ready.sessionId, sector.id)}/${must(batch, 'batch').id}`,
          ),
      ],
    ];
    for (const [name, attempt] of attempts) {
      const res = await attempt();
      expect(res.status, name).toBe(422);
      expect(body(res), name).toMatchObject({ code: 'SESSION_NOT_DRAFT' });
    }

    const next = await accept(
      ctx,
      'post',
      `/api/catalog/events/${ready.eventId}/sessions`,
      sessionBody(ready.venueId, { startsAt: '2026-12-12T23:00:00.000Z' }),
    );
    const [row] = await rows(ctx.dataSource, 'SELECT status FROM catalog_sessions WHERE id = $1', [
      next.entityId,
    ]);
    expect(row).toEqual({ status: 'draft' });
  });
});
