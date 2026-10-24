import { PingCreatedV1Schema } from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  body,
  countRows,
  createTestApp,
  newKey,
  rows,
  truncateAll,
  UUID_V7,
  type TestApp,
} from './setup.js';

interface Accepted {
  id: string;
  version: number;
}

describe('CreatePing', () => {
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

  const post = (payload: object, key?: string) => {
    const req = api(ctx).post('/api/diagnostics/pings');
    if (key) req.set('Idempotency-Key', key);
    return req.send(payload);
  };

  it('CA-7: aceita, grava o agregado e uma linha PingCreated na outbox', async () => {
    const res = await post({ label: '  primeiro  ' }, newKey());
    expect(res.status).toBe(202);
    const accepted = body<Accepted>(res);
    expect(accepted.id).toMatch(UUID_V7);
    expect(accepted.version).toBe(1);

    const pings = await rows(ctx.dataSource, 'SELECT * FROM diagnostics_pings');
    expect(pings).toHaveLength(1);
    expect(pings[0]).toMatchObject({ id: accepted.id, label: 'primeiro', count: 0, version: 1 });

    const outbox = await rows(ctx.dataSource, 'SELECT * FROM outbox');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      aggregate_id: accepted.id,
      aggregate_version: '1',
      bounded_context: 'diagnostics',
      aggregate_type: 'Ping',
      event_type: 'PingCreated',
      schema_version: 1,
    });
    const envelope = PingCreatedV1Schema.parse(outbox[0]?.payload);
    expect(envelope.payload.label).toBe('primeiro');
    expect(envelope.eventId).toBe(outbox[0]?.id);
    expect(envelope.correlationId).toBeNull();
  });

  it.each([
    ['ausente', undefined],
    ['só espaços', '   '],
    ['51 caracteres', 'x'.repeat(51)],
  ])('CA-12: label %s -> 400 sem gravar', async (_name, label) => {
    const res = await post(label === undefined ? {} : { label }, newKey());
    expect(res.status).toBe(400);
    const error = body<{ message: string; issues: Array<{ path: string }> }>(res);
    expect(error.message).toBe('Validation failed');
    expect(error.issues[0]?.path).toBe('label');
    expect(await countRows(ctx.dataSource, 'diagnostics_pings')).toBe(0);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(0);
    expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(0);
  });

  it.each([
    ['ausente', undefined],
    ['inválido', 'not-a-uuid'],
  ])('CA-13: Idempotency-Key %s -> 400 sem gravar', async (_name, key) => {
    const res = await post({ label: 'ok' }, key);
    expect(res.status).toBe(400);
    expect(await countRows(ctx.dataSource, 'diagnostics_pings')).toBe(0);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(0);
    expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(0);
  });
});
