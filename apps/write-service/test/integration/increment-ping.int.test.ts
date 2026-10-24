import { PingIncrementedV1Schema } from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('IncrementPing', () => {
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

  const create = async () => {
    const res = await api(ctx)
      .post('/api/diagnostics/pings')
      .set('Idempotency-Key', newKey())
      .send({ label: 'x' });
    return body<{ id: string; version: number }>(res);
  };
  const increment = (id: string, key = newKey()) =>
    api(ctx).post(`/api/diagnostics/pings/${id}/increment`).set('Idempotency-Key', key);

  it('CA-9: devolve versão n+1, soma 1 ao count e grava PingIncremented', async () => {
    const { id } = await create();
    const first = await increment(id);
    expect(first.status).toBe(202);
    expect(body(first)).toEqual({ id, version: 2 });
    const second = await increment(id);
    expect(body(second)).toEqual({ id, version: 3 });

    const pings = await rows(ctx.dataSource, 'SELECT count, version FROM diagnostics_pings');
    expect(pings).toEqual([{ count: 2, version: 3 }]);

    const events = await rows<{ aggregate_version: string; payload: unknown }>(
      ctx.dataSource,
      "SELECT aggregate_version, payload FROM outbox WHERE event_type = 'PingIncremented' ORDER BY aggregate_version",
    );
    expect(events.map((r) => r.aggregate_version)).toEqual(['2', '3']);
    expect(events.map((r) => PingIncrementedV1Schema.parse(r.payload).payload.count)).toEqual([
      1, 2,
    ]);
  });

  it('CA-11: ping inexistente -> 404 sem gravar', async () => {
    const res = await increment('0190f1a2-0000-7000-8000-0000000000ff');
    expect(res.status).toBe(404);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(0);
    expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(0);
  });

  it(':id que não é UUID -> 400', async () => {
    const res = await increment('abc');
    expect(res.status).toBe(400);
  });
});
