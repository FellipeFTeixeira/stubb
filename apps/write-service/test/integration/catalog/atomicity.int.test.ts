import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OutboxWriter } from '../../../src/shared/outbox/outbox-writer.js';
import { body, countRows, createTestApp, newKey, truncateAll, type TestApp } from '../setup.js';
import {
  CLOCK_OVERRIDE,
  addVenueSector,
  createEvent,
  generalAdmission,
  registerVenue,
  send,
  sessionBody,
  venueBody,
} from './helpers.js';

const CATALOG_TABLES = [
  'catalog_venues',
  'catalog_venue_sectors',
  'catalog_events',
  'catalog_sessions',
  'catalog_session_sectors',
  'catalog_batches',
  'outbox',
  'idempotency_keys',
];

async function counts(ctx: TestApp): Promise<Record<string, number>> {
  const entries = await Promise.all(
    CATALOG_TABLES.map(async (table) => [table, await countRows(ctx.dataSource, table)] as const),
  );
  return Object.fromEntries(entries);
}

describe('Atomicidade (CA-22)', () => {
  describe('regra violada', () => {
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

    it('não deixa linha de domínio, outbox nem chave; reenviar com a mesma chave executa de novo', async () => {
      const venue = await registerVenue(ctx);
      const event = await createEvent(ctx);
      const before = await counts(ctx);

      const key = newKey();
      const path = `/api/catalog/events/${event.id}/sessions`;
      const payload = sessionBody(venue.id);
      const rejected = await send(ctx, 'post', path, payload, key);
      expect(rejected.status).toBe(422);
      expect(body(rejected)).toMatchObject({ code: 'VENUE_WITHOUT_SECTORS' });
      expect(await counts(ctx)).toEqual(before);

      await addVenueSector(ctx, venue.id, generalAdmission());
      const retried = await send(ctx, 'post', path, payload, key);
      expect(retried.status).toBe(202);
      expect(await countRows(ctx.dataSource, 'catalog_sessions')).toBe(1);
    });
  });

  describe('falha no meio da gravação', () => {
    let ctx: TestApp;
    beforeAll(async () => {
      const failingOutbox = {
        append: () => Promise.reject(new Error('outbox indisponível')),
      };
      ctx = await createTestApp([{ provide: OutboxWriter, useValue: failingOutbox }]);
    });
    afterAll(async () => {
      await ctx.close();
    });
    beforeEach(async () => {
      await truncateAll(ctx.dataSource);
    });

    it('a falha ao gravar a outbox desfaz o domínio e a chave', async () => {
      const res = await send(ctx, 'post', '/api/catalog/venues', venueBody());
      expect(res.status).toBe(500);
      expect(await counts(ctx)).toEqual(Object.fromEntries(CATALOG_TABLES.map((t) => [t, 0])));
    });
  });
});
