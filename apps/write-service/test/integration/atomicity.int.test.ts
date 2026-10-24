import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxWriter } from '../../src/shared/outbox/outbox-writer.js';
import { api, countRows, createTestApp, newKey, type TestApp } from './setup.js';

describe('Atomicidade agregado + outbox (CA-8)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp([
      {
        provide: OutboxWriter,
        useValue: {
          append: () => Promise.reject(new Error('outbox unavailable')),
        },
      },
    ]);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('falha na outbox desfaz agregado e chave de idempotência', async () => {
    const res = await api(ctx)
      .post('/api/diagnostics/pings')
      .set('Idempotency-Key', newKey())
      .send({ label: 'x' });
    expect(res.status).toBe(500);
    expect(await countRows(ctx.dataSource, 'diagnostics_pings')).toBe(0);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(0);
    expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(0);
  });
});
