import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './setup.js';

// Os módulos de src/ são importados dinamicamente: config.ts lê process.env na importação,
// e o setup.ts só define DATABASE_URL quando é avaliado (napkin: ordem de import).
describe('SharedModule (CA-5)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('registra o cron de limpeza da idempotência uma única vez (mais o da Identity)', () => {
    // 1 da idempotência (SharedModule) + 1 da Identity (IdentityCleanupJob).
    expect(ctx.app.get(SchedulerRegistry).getCronJobs().size).toBe(2);
  });

  it('resolve OutboxWriter e Clock', async () => {
    const { OutboxWriter } = await import('../../src/shared/outbox/outbox-writer.js');
    const { Clock } = await import('../../src/shared/clock/clock.js');
    expect(ctx.app.get(OutboxWriter, { strict: false })).toBeInstanceOf(OutboxWriter);
    expect(ctx.app.get(Clock, { strict: false })).toBeInstanceOf(Clock);
  });
});
