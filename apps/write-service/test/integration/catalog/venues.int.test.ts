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
  TEST_ORGANIZER_ID,
  accept,
  addVenueSector,
  createEvent,
  generalAdmission,
  outboxRows,
  parseEnvelope,
  registerVenue,
  scheduleSession,
  seated,
  send,
  venueBody,
  venueWithSectors,
  must,
} from './helpers.js';

describe('Venue', () => {
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

  it('CA-6: RegisterVenue responde 202 { id, version: 1 } e grava domínio + outbox', async () => {
    const res = await send(ctx, 'post', '/api/catalog/venues', venueBody());
    expect(res.status).toBe(202);
    const { id, version } = body<{ id: string; version: number }>(res);
    expect(id).toMatch(UUID_V7);
    expect(version).toBe(1);

    const venues = await rows(
      ctx.dataSource,
      'SELECT organizer_id, name, address, city, state, time_zone, version FROM catalog_venues WHERE id = $1',
      [id],
    );
    expect(venues).toEqual([
      {
        organizer_id: TEST_ORGANIZER_ID,
        name: 'Teatro Aurora',
        address: 'Rua das Acácias, 120 - Centro',
        city: 'São Paulo',
        state: 'SP',
        time_zone: 'America/Sao_Paulo',
        version: 1,
      },
    ]);

    const outbox = await outboxRows(ctx);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      bounded_context: 'catalog',
      aggregate_type: 'Venue',
      aggregate_id: id,
      aggregate_version: 1,
      event_type: 'VenueRegistered',
    });
    const envelope = parseEnvelope(must(outbox[0], 'outbox'));
    expect(envelope.payload).toMatchObject({ organizerId: TEST_ORGANIZER_ID, city: 'São Paulo' });
  });

  it('CA-7: UpdateVenueDetails com expectedVersion certa aplica; a repetida dá 409 sem gravar', async () => {
    const venue = await registerVenue(ctx);
    await addVenueSector(ctx, venue.id, generalAdmission('A'));
    await addVenueSector(ctx, venue.id, generalAdmission('B'));
    // versão 3 do local
    const path = `/api/catalog/venues/${venue.id}`;
    const first = await send(
      ctx,
      'patch',
      path,
      venueBody({ name: 'Novo nome', expectedVersion: 3 }),
    );
    expect(first.status).toBe(202);
    expect(body(first)).toEqual({ id: venue.id, version: 4 });

    const outboxBefore = await countRows(ctx.dataSource, 'outbox');
    const second = await send(ctx, 'patch', path, venueBody({ name: 'Outro', expectedVersion: 3 }));
    expect(second.status).toBe(409);
    expect(body(second)).toMatchObject({ statusCode: 409, code: 'CONCURRENCY_CONFLICT' });
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(outboxBefore);

    const [row] = await rows<{ name: string; version: number }>(
      ctx.dataSource,
      'SELECT name, version FROM catalog_venues WHERE id = $1',
      [venue.id],
    );
    expect(row).toEqual({ name: 'Novo nome', version: 4 });
    const updated = (await outboxRows(ctx, venue.id)).filter(
      (r) => r.event_type === 'VenueDetailsUpdated',
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]?.aggregate_version).toBe(4);
  });

  it('CA-8: AddVenueSector devolve entityId; 21º setor e nome repetido são 422', async () => {
    const venue = await registerVenue(ctx);
    for (let i = 1; i <= 18; i += 1) {
      await addVenueSector(ctx, venue.id, generalAdmission(`Setor ${i}`, 10));
    }
    // 19º setor: marcado, capacidade = soma das filas (10 + 10)
    const nineteenth = await send(ctx, 'post', `/api/catalog/venues/${venue.id}/sectors`, seated());
    expect(nineteenth.status).toBe(202);
    const { entityId, version } = body<{ entityId: string; version: number }>(nineteenth);
    expect(entityId).toMatch(UUID_V7);
    expect(version).toBe(20);

    const added = (await outboxRows(ctx, venue.id)).find((r) => r.aggregate_version === 20);
    const envelope = parseEnvelope(must(added, 'event'));
    expect(envelope.eventType).toBe('VenueSectorAdded');
    expect(envelope.payload).toMatchObject({
      sector: {
        venueSectorId: entityId,
        kind: 'seated',
        rows: [
          { label: 'A', seats: 10 },
          { label: 'B', seats: 10 },
        ],
      },
    });

    const twentieth = await send(
      ctx,
      'post',
      `/api/catalog/venues/${venue.id}/sectors`,
      generalAdmission('Vigésimo'),
    );
    expect(twentieth.status).toBe(202);
    const limit = await send(
      ctx,
      'post',
      `/api/catalog/venues/${venue.id}/sectors`,
      generalAdmission('21'),
    );
    expect(limit.status).toBe(422);
    expect(body(limit)).toMatchObject({ code: 'VENUE_SECTOR_LIMIT_REACHED' });
  });

  it('CA-8: nome igual sem diferenciar maiúsculas é VENUE_SECTOR_NAME_TAKEN', async () => {
    const venue = await registerVenue(ctx);
    await addVenueSector(ctx, venue.id, generalAdmission('Pista Premium'));
    const res = await send(
      ctx,
      'post',
      `/api/catalog/venues/${venue.id}/sectors`,
      generalAdmission(' PISTA premium '),
    );
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'VENUE_SECTOR_NAME_TAKEN' });
    expect(await countRows(ctx.dataSource, 'catalog_venue_sectors')).toBe(1);
  });

  it('RemoveVenueSector remove, emite VenueSectorRemoved; setor inexistente é 404 ENTITY_NOT_FOUND', async () => {
    const venue = await registerVenue(ctx);
    const sector = await addVenueSector(ctx, venue.id, generalAdmission());
    const path = `/api/catalog/venues/${venue.id}/sectors/${sector.entityId}`;
    const res = await send(ctx, 'delete', path);
    expect(res.status).toBe(202);
    expect(body(res)).toEqual({ id: venue.id, version: 3 });
    expect(await countRows(ctx.dataSource, 'catalog_venue_sectors')).toBe(0);
    const removed = (await outboxRows(ctx, venue.id)).find(
      (r) => r.event_type === 'VenueSectorRemoved',
    );
    expect(parseEnvelope(must(removed, 'event')).payload).toEqual({
      venueSectorId: sector.entityId,
    });

    const again = await send(ctx, 'delete', path);
    expect(again.status).toBe(404);
    expect(body(again)).toMatchObject({ code: 'ENTITY_NOT_FOUND' });
  });

  it('local inexistente é 404 AGGREGATE_NOT_FOUND', async () => {
    const res = await send(
      ctx,
      'post',
      '/api/catalog/venues/0190a0a0-0000-7000-8000-000000000999/sectors',
      generalAdmission(),
    );
    expect(res.status).toBe(404);
    expect(body(res)).toMatchObject({ code: 'AGGREGATE_NOT_FOUND' });
  });

  it('CA-9: remover o setor da planta não afeta a cópia na sessão', async () => {
    const venue = await venueWithSectors(ctx);
    const event = await createEvent(ctx);
    const session = await scheduleSession(ctx, event.id, venue.venueId);
    const removal = await send(
      ctx,
      'delete',
      `/api/catalog/venues/${venue.venueId}/sectors/${venue.pistaId}`,
    );
    expect(removal.status).toBe(202);

    const planta = await rows(
      ctx.dataSource,
      'SELECT id FROM catalog_venue_sectors WHERE venue_id = $1',
      [venue.venueId],
    );
    expect(planta).toHaveLength(1);
    const copies = await rows<{ venue_sector_id: string }>(
      ctx.dataSource,
      'SELECT venue_sector_id FROM catalog_session_sectors WHERE session_id = $1',
      [session.entityId],
    );
    expect(copies.map((c) => c.venue_sector_id).sort()).toEqual(
      [venue.pistaId, venue.plateiaId].sort(),
    );
    expect((await outboxRows(ctx, venue.venueId)).map((r) => r.event_type)).toContain(
      'VenueSectorRemoved',
    );
  });

  it('accept: helper devolve o corpo do 202', async () => {
    const res = await accept(
      ctx,
      'post',
      '/api/catalog/venues',
      venueBody({ name: ' Com trim  ' }),
    );
    const [row] = await rows<{ name: string }>(
      ctx.dataSource,
      'SELECT name FROM catalog_venues WHERE id = $1',
      [res.id],
    );
    expect(row?.name).toBe('Com trim');
  });
});
