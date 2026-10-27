import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { body, countRows, createTestApp, newKey, truncateAll, type TestApp } from '../setup.js';
import {
  CLOCK_OVERRIDE,
  addVenueSector,
  createEvent,
  eventBody,
  generalAdmission,
  registerVenue,
  send,
  venueBody,
} from './helpers.js';

describe('Idempotência dos commands do Catalog (CA-23)', () => {
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

  it('PATCH: repetir com a mesma chave e corpo devolve a mesma resposta sem novo evento', async () => {
    const venue = await registerVenue(ctx);
    const key = newKey();
    const path = `/api/catalog/venues/${venue.id}`;
    const payload = venueBody({ name: 'Renomeado', expectedVersion: 1 });
    const first = await send(ctx, 'patch', path, payload, key);
    const outbox = await countRows(ctx.dataSource, 'outbox');
    const second = await send(ctx, 'patch', path, payload, key);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(body(second)).toEqual(body(first));
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(outbox);
  });

  it('PATCH: mesma chave com outro corpo é 422 IDEMPOTENCY_KEY_MISMATCH', async () => {
    const venue = await registerVenue(ctx);
    const key = newKey();
    const path = `/api/catalog/venues/${venue.id}`;
    await send(ctx, 'patch', path, venueBody({ expectedVersion: 1 }), key);
    const res = await send(
      ctx,
      'patch',
      path,
      venueBody({ name: 'Outro', expectedVersion: 1 }),
      key,
    );
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'IDEMPOTENCY_KEY_MISMATCH' });
  });

  it('PATCH: sem a chave é 400 IDEMPOTENCY_KEY_INVALID', async () => {
    const event = await createEvent(ctx);
    const res = await send(
      ctx,
      'patch',
      `/api/catalog/events/${event.id}`,
      eventBody({ imageUrl: null, expectedVersion: 1 }),
      null,
    );
    expect(res.status).toBe(400);
    expect(body(res)).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
  });

  it('DELETE: repetir a mesma chave não remove duas vezes nem dá 404', async () => {
    const venue = await registerVenue(ctx);
    const sector = await addVenueSector(ctx, venue.id, generalAdmission());
    const key = newKey();
    const path = `/api/catalog/venues/${venue.id}/sectors/${sector.entityId}`;
    const first = await send(ctx, 'delete', path, undefined, key);
    const outbox = await countRows(ctx.dataSource, 'outbox');
    const second = await send(ctx, 'delete', path, undefined, key);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(body(second)).toEqual(body(first));
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(outbox);
  });

  it('DELETE: mesma chave em outro recurso é 422 IDEMPOTENCY_KEY_MISMATCH; sem chave é 400', async () => {
    const venue = await registerVenue(ctx);
    const a = await addVenueSector(ctx, venue.id, generalAdmission('A'));
    const b = await addVenueSector(ctx, venue.id, generalAdmission('B'));
    const key = newKey();
    await send(
      ctx,
      'delete',
      `/api/catalog/venues/${venue.id}/sectors/${a.entityId}`,
      undefined,
      key,
    );
    const reused = await send(
      ctx,
      'delete',
      `/api/catalog/venues/${venue.id}/sectors/${b.entityId}`,
      undefined,
      key,
    );
    expect(reused.status).toBe(422);
    expect(body(reused)).toMatchObject({ code: 'IDEMPOTENCY_KEY_MISMATCH' });

    const missing = await send(
      ctx,
      'delete',
      `/api/catalog/venues/${venue.id}/sectors/${b.entityId}`,
      undefined,
      null,
    );
    expect(missing.status).toBe(400);
    expect(body(missing)).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
  });

  it('POST: chave repetida na criação devolve o mesmo id e não duplica o local', async () => {
    const key = newKey();
    const first = await send(ctx, 'post', '/api/catalog/venues', venueBody(), key);
    const second = await send(ctx, 'post', '/api/catalog/venues', venueBody(), key);
    expect(body(second)).toEqual(body(first));
    expect(await countRows(ctx.dataSource, 'catalog_venues')).toBe(1);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(1);
  });
});
