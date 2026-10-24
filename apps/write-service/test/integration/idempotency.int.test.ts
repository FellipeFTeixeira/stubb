import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IdempotencyService } from '../../src/shared/idempotency/idempotency.service.js';
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

describe('Idempotency-Key', () => {
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

  const create = (label: string, key: string) =>
    api(ctx).post('/api/diagnostics/pings').set('Idempotency-Key', key).send({ label });
  const increment = (id: string, key: string) =>
    api(ctx).post(`/api/diagnostics/pings/${id}/increment`).set('Idempotency-Key', key);

  it('CA-14: repetição devolve status e corpo iguais sem novas linhas', async () => {
    const key = newKey();
    const first = await create('x', key);
    const second = await create('x', key);
    expect(second.status).toBe(first.status);
    expect(body(second)).toEqual(body(first));
    expect(await countRows(ctx.dataSource, 'diagnostics_pings')).toBe(1);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(1);
  });

  it('CA-15: mesma chave com outro label -> 422', async () => {
    const key = newKey();
    await create('x', key);
    const res = await create('outro', key);
    expect(res.status).toBe(422);
    expect(await countRows(ctx.dataSource, 'diagnostics_pings')).toBe(1);
  });

  it('CA-15: mesma chave em increment para outro ping -> 422', async () => {
    const a = body<{ id: string }>(await create('a', newKey())).id;
    const b = body<{ id: string }>(await create('b', newKey())).id;
    const key = newKey();
    expect((await increment(a, key)).status).toBe(202);
    const res = await increment(b, key);
    expect(res.status).toBe(422);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(3);
  });

  it('CA-16: duas execuções concorrentes com a mesma chave executam a operação uma vez', async () => {
    const service = ctx.app.get(IdempotencyService);
    let calls = 0;
    const input = { key: newKey(), scope: 'test-scope', requestHash: 'a'.repeat(64) };
    const operation = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { id: 'fixed', version: 1 };
    };
    const [r1, r2] = await Promise.all([
      service.execute(input, operation),
      service.execute(input, operation),
    ]);
    expect(calls).toBe(1);
    expect(r2).toEqual(r1);
  });

  it('CA-17: chave com mais de 24 h é tratada como inexistente', async () => {
    const key = newKey();
    await create('x', key);
    await rows(
      ctx.dataSource,
      "UPDATE idempotency_keys SET created_at = now() - interval '25 hours'",
    );
    const res = await create('x', key);
    expect(res.status).toBe(202);
    expect(await countRows(ctx.dataSource, 'diagnostics_pings')).toBe(2);
    expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(1);
  });
});
