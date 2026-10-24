import { randomUUID } from 'node:crypto';
import { diagnosticsRoutes } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { query } from '../support/db.ts';
import { api } from '../support/http.ts';
import { createPing, incrementPing, uniqueLabel } from '../support/pings.ts';

const countByLabel = async (label: string) =>
  (await query('SELECT 1 FROM diagnostics_pings WHERE label = $1', [label])).length;

describe('idempotência via gateway', () => {
  it('CA-14: mesma chave e mesmo request devolvem a mesma resposta sem novo efeito', async () => {
    const label = uniqueLabel();
    const key = randomUUID();
    const first = await createPing(label, key);
    const second = await createPing(label, key);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body).toEqual(first.body);
    expect(await countByLabel(label)).toBe(1);
    const outbox = await query('SELECT 1 FROM outbox WHERE aggregate_id = $1', [first.body.id]);
    expect(outbox).toHaveLength(1);
  });

  it('CA-15: chave reusada com outro request devolve 422', async () => {
    const key = randomUUID();
    expect((await createPing(uniqueLabel(), key)).status).toBe(202);
    expect((await createPing(uniqueLabel(), key)).status).toBe(422);

    const a = await createPing();
    const b = await createPing();
    const incrementKey = randomUUID();
    expect((await incrementPing(a.body.id, incrementKey)).status).toBe(202);
    expect((await incrementPing(b.body.id, incrementKey)).status).toBe(422);
  });

  it('CA-16: requisições concorrentes com a mesma chave criam um só ping', async () => {
    const label = uniqueLabel();
    const key = randomUUID();
    const [first, second] = await Promise.all([createPing(label, key), createPing(label, key)]);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body).toEqual(first.body);
    expect(await countByLabel(label)).toBe(1);
  });

  it('CA-17: chave expirada (25 h) é tratada como inexistente', async () => {
    const label = uniqueLabel();
    const key = randomUUID();
    const first = await createPing(label, key);
    await query(
      `UPDATE idempotency_keys SET created_at = now() - interval '25 hours' WHERE key = $1`,
      [key],
    );
    const second = await api<{ id: string }>('POST', diagnosticsRoutes.createPing, {
      body: { label },
      idempotencyKey: key,
    });

    expect(second.status).toBe(202);
    expect(second.body.id).not.toBe(first.body.id);
    expect(await countByLabel(label)).toBe(2);
  });
});
