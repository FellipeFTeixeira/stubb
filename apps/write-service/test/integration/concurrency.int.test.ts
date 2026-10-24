import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Ping } from '../../src/diagnostics/domain/ping.aggregate.js';
import { PingRepository } from '../../src/diagnostics/infrastructure/ping.repository.js';
import { ConcurrencyConflictError } from '../../src/shared/errors.js';
import { TransactionContext } from '../../src/shared/transaction/transaction-context.js';
import {
  api,
  body,
  countRows,
  createTestApp,
  newKey,
  rows,
  truncateAll,
  type TestApp,
} from './setup.js';

describe('Concorrência otimista (CA-10)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.dataSource);
  });

  it('a segunda gravação com a mesma versão lança ConcurrencyConflictError e não deixa rastro', async () => {
    const repo = ctx.app.get(PingRepository);
    const tx = ctx.app.get(TransactionContext);
    const id = newKey();
    await tx.run(() => repo.insert(Ping.create(id, 'x', new Date())));
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(1);

    const loadedA = await tx.run(() => repo.findById(id));
    const loadedB = await tx.run(() => repo.findById(id));
    if (!loadedA || !loadedB) throw new Error('ping not found');
    loadedA.increment(new Date());
    loadedB.increment(new Date());

    await tx.run(() => repo.update(loadedA, 1));
    await expect(tx.run(() => repo.update(loadedB, 1))).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );

    const pings = await rows(ctx.dataSource, 'SELECT count, version FROM diagnostics_pings');
    expect(pings).toEqual([{ count: 1, version: 2 }]);
    const incremented = await rows(
      ctx.dataSource,
      "SELECT 1 FROM outbox WHERE event_type = 'PingIncremented'",
    );
    expect(incremented).toHaveLength(1);
  });

  it('pelo HTTP, dois incrementos simultâneos: 202 e (202 ou 409), sem rastro da perdedora', async () => {
    const created = await api(ctx)
      .post('/api/diagnostics/pings')
      .set('Idempotency-Key', newKey())
      .send({ label: 'x' });
    const { id } = body<{ id: string }>(created);
    const send = () =>
      api(ctx).post(`/api/diagnostics/pings/${id}/increment`).set('Idempotency-Key', newKey());
    const results = await Promise.all([send(), send()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(202);
    expect([202, 409]).toContain(statuses[1]);

    const accepted = results.filter((r) => r.status === 202).length;
    const pings = await rows(ctx.dataSource, 'SELECT count, version FROM diagnostics_pings');
    expect(pings).toEqual([{ count: accepted, version: 1 + accepted }]);
    const incremented = await rows(
      ctx.dataSource,
      "SELECT 1 FROM outbox WHERE event_type = 'PingIncremented'",
    );
    expect(incremented).toHaveLength(accepted);
    // create + as chaves das requisições aceitas
    expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(1 + accepted);
  });
});
