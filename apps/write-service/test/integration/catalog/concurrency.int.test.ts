import { v7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogEventRepository } from '../../../src/catalog/infrastructure/catalog-event.repository.js';
import { ConcurrencyConflictError } from '../../../src/shared/errors.js';
import { TransactionContext } from '../../../src/shared/transaction/transaction-context.js';
import { body, countRows, createTestApp, rows, truncateAll, type TestApp } from '../setup.js';
import { CLOCK_OVERRIDE, NOW, batchPath, draftSession, must, outboxRows, send } from './helpers.js';

describe('Concorrência por agregado (CA-21)', () => {
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

  it('duas gravações com a mesma versão lida: a segunda lança ConcurrencyConflictError e não deixa rastro', async () => {
    const draft = await draftSession(ctx);
    const repo = ctx.app.get(CatalogEventRepository);
    const tx = ctx.app.get(TransactionContext);
    const loadedA = must(await tx.run(() => repo.findById(draft.eventId)), 'event A');
    const loadedB = must(await tx.run(() => repo.findById(draft.eventId)), 'event B');
    const expected = loadedA.version;
    const [first, second] = draft.sectors;
    const input = { name: 'Lote', priceCents: 100, quantity: null, endsAt: null };
    loadedA.addBatch(draft.sessionId, must(first, 'sector').id, input, v7(), NOW);
    loadedB.addBatch(draft.sessionId, must(second, 'sector').id, input, v7(), NOW);

    await tx.run(() => repo.update(loadedA, expected));
    await expect(tx.run(() => repo.update(loadedB, expected))).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );

    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(1);
    const added = (await outboxRows(ctx, draft.eventId)).filter(
      (r) => r.event_type === 'BatchAdded',
    );
    expect(added).toHaveLength(1);
    const [event] = await rows(ctx.dataSource, 'SELECT version FROM catalog_events WHERE id = $1', [
      draft.eventId,
    ]);
    expect(event).toEqual({ version: expected + 1 });
  });

  it('pelo HTTP, dois AddBatch simultâneos em setores diferentes: 202 e (202 ou 409), sem rastro da perdedora', async () => {
    const draft = await draftSession(ctx);
    const [first, second] = draft.sectors;
    const add = (sectorId: string) =>
      send(ctx, 'post', batchPath(draft.eventId, draft.sessionId, sectorId), {
        name: 'Lote',
        priceCents: 100,
      });
    const results = await Promise.all([
      add(must(first, 'sector').id),
      add(must(second, 'sector').id),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(202);
    expect([202, 409]).toContain(statuses[1]);

    const accepted = results.filter((r) => r.status === 202);
    const versions = accepted.map((r) => body<{ version: number }>(r).version).sort();
    // Cada 202 avança a versão em 1 a partir de 2 (criação + agenda): 3, 4...
    expect(versions).toEqual(accepted.map((_, i) => 3 + i));
    const losers = results.filter((r) => r.status === 409);
    for (const res of losers) expect(body(res)).toMatchObject({ code: 'CONCURRENCY_CONFLICT' });

    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(accepted.length);
    const added = (await outboxRows(ctx, draft.eventId)).filter(
      (r) => r.event_type === 'BatchAdded',
    );
    expect(added).toHaveLength(accepted.length);
  });
});
