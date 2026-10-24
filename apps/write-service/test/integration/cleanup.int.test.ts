import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IdempotencyCleanupJob } from '../../src/shared/idempotency/idempotency-cleanup.job.js';
import { createTestApp, newKey, rows, truncateAll, type TestApp } from './setup.js';

describe('Limpeza das chaves (CA-18)', () => {
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

  it('apaga só a chave de 25 h', async () => {
    const old = newKey();
    const recent = newKey();
    const insert =
      "INSERT INTO idempotency_keys (key, scope, request_hash, created_at) VALUES ($1, 's', $2, now() - $3::interval)";
    await rows(ctx.dataSource, insert, [old, 'a'.repeat(64), '25 hours']);
    await rows(ctx.dataSource, insert, [recent, 'b'.repeat(64), '1 hour']);

    const deleted = await ctx.app.get(IdempotencyCleanupJob).deleteExpired();
    expect(deleted).toBe(1);
    const left = await rows<{ key: string }>(ctx.dataSource, 'SELECT key FROM idempotency_keys');
    expect(left.map((r) => r.key)).toEqual([recent]);
  });

  it('está agendado de hora em hora', () => {
    const job = ctx.app.get(SchedulerRegistry).getCronJob('idempotency-cleanup');
    expect(job.cronTime.source).toBe(CronExpression.EVERY_HOUR);
  });
});
