import { randomUUID } from 'node:crypto';
import { diagnosticsRoutes, PingCreatedV1Schema, PingIncrementedV1Schema } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { query } from '../support/db.ts';
import { api } from '../support/http.ts';
import {
  createPing,
  incrementPing,
  UUID_V7,
  uniqueLabel,
  type OutboxRow,
  type PingRow,
} from '../support/pings.ts';

const pingRows = (id: string) =>
  query<PingRow>('SELECT id, label, count, version FROM diagnostics_pings WHERE id = $1', [id]);
const outboxRows = (id: string) =>
  query<OutboxRow>(
    'SELECT aggregate_id, aggregate_version, event_type, bounded_context, payload FROM outbox WHERE aggregate_id = $1 ORDER BY aggregate_version',
    [id],
  );
const countPingsWithLabel = async (label: string) =>
  (await query('SELECT 1 FROM diagnostics_pings WHERE label = $1', [label])).length;

describe('commands via gateway', () => {
  it('CA-7: CreatePing devolve 202 e grava agregado e outbox', async () => {
    const label = uniqueLabel();
    const res = await createPing(`  ${label}  `);

    expect(res.status).toBe(202);
    expect(res.body.version).toBe(1);
    expect(res.body.id).toMatch(UUID_V7);

    expect(await pingRows(res.body.id)).toEqual([{ id: res.body.id, label, count: 0, version: 1 }]);
    const outbox = await outboxRows(res.body.id);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.event_type).toBe('PingCreated');
    expect(outbox[0]?.bounded_context).toBe('diagnostics');
    expect(PingCreatedV1Schema.parse(outbox[0]?.payload).payload.label).toBe(label);
  });

  it('CA-9: IncrementPing devolve versão n+1 e grava o evento', async () => {
    const created = await createPing();
    const res = await incrementPing(created.body.id);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: created.body.id, version: 2 });
    expect(await pingRows(created.body.id)).toMatchObject([{ count: 1, version: 2 }]);
    const outbox = await outboxRows(created.body.id);
    expect(outbox.map((row) => row.event_type)).toEqual(['PingCreated', 'PingIncremented']);
    const event = PingIncrementedV1Schema.parse(outbox[1]?.payload);
    expect(event.aggregateVersion).toBe(2);
    expect(event.payload.count).toBe(1);
  });

  it('CA-11: incremento de ping inexistente devolve 404', async () => {
    const res = await incrementPing(randomUUID());
    expect(res.status).toBe(404);
  });

  it('CA-12: label inválido devolve 400 e não grava', async () => {
    const before = (await query('SELECT 1 FROM diagnostics_pings')).length;
    for (const label of ['   ', '', 'x'.repeat(51)]) {
      const res = await api('POST', diagnosticsRoutes.createPing, {
        body: { label },
        idempotencyKey: randomUUID(),
      });
      expect(res.status).toBe(400);
    }
    const absent = await api('POST', diagnosticsRoutes.createPing, {
      body: {},
      idempotencyKey: randomUUID(),
    });
    expect(absent.status).toBe(400);
    expect((await query('SELECT 1 FROM diagnostics_pings')).length).toBe(before);
  });

  it('CA-13: Idempotency-Key ausente ou inválido devolve 400 e não grava', async () => {
    const label = uniqueLabel();
    const missing = await api('POST', diagnosticsRoutes.createPing, { body: { label } });
    const invalid = await api('POST', diagnosticsRoutes.createPing, {
      body: { label },
      idempotencyKey: 'abc',
    });
    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(await countPingsWithLabel(label)).toBe(0);
  });
});
