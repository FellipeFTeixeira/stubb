import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { body, countRows, createTestApp, rows, truncateAll, type TestApp } from '../setup.js';
import {
  CLOCK_OVERRIDE,
  batchPath,
  draftSession,
  must,
  outboxRows,
  parseEnvelope,
  send,
} from './helpers.js';

describe('Lotes (CA-15)', () => {
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

  it('(a)-(h): aceita os válidos e rejeita cada violação com o código certo', async () => {
    // Pista com capacidade 200
    const draft = await draftSession(ctx);
    const pista = must(
      draft.sectors.find((s) => s.name === 'Pista'),
      'Pista',
    );
    const path = batchPath(draft.eventId, draft.sessionId, pista.id);
    const post = (payload: Record<string, unknown>) =>
      send(ctx, 'post', path, { priceCents: 5000, ...payload });
    const expectRule = async (payload: Record<string, unknown>, code: string) => {
      const res = await post(payload);
      expect(res.status, code).toBe(422);
      expect(body(res)).toMatchObject({ code });
    };

    // (a) válido com quantity 100
    const a = await post({ name: '1º lote', quantity: 100 });
    expect(a.status).toBe(202);
    expect(body(a)).toMatchObject({ id: draft.eventId, version: 3 });
    const batchId = body<{ entityId: string }>(a).entityId;
    const added = (await outboxRows(ctx, draft.eventId)).find((r) => r.event_type === 'BatchAdded');
    expect(parseEnvelope(must(added, 'BatchAdded')).payload).toMatchObject({
      sessionId: draft.sessionId,
      sessionSectorId: pista.id,
      batch: {
        batchId,
        name: '1º lote',
        priceCents: 5000,
        quantity: 100,
        endsAt: null,
        position: 1,
      },
    });

    // (d) nome repetido, (e) soma acima da capacidade
    await expectRule({ name: '1º LOTE' }, 'BATCH_NAME_TAKEN');
    await expectRule({ name: 'Excedente', quantity: 101 }, 'BATCH_QUANTITY_EXCEEDS_CAPACITY');
    // (f) fim depois do início da sessão e antes do início das vendas
    await expectRule(
      { name: 'Fim tarde', endsAt: '2026-12-11T00:00:00.000Z' },
      'BATCH_END_OUT_OF_RANGE',
    );
    await expectRule(
      { name: 'Fim cedo', endsAt: '2026-11-02T12:00:00.000Z' },
      'BATCH_END_OUT_OF_RANGE',
    );

    // (b) segundo sem quantity nem endsAt
    expect((await post({ name: '2º lote' })).status).toBe(202);
    // (c) terceiro depois do ilimitado
    await expectRule({ name: '3º lote', quantity: 5 }, 'PREVIOUS_BATCH_UNBOUNDED');

    const stored = await rows(
      ctx.dataSource,
      'SELECT name, name_key, quantity, position FROM catalog_batches WHERE session_sector_id = $1 ORDER BY position',
      [pista.id],
    );
    expect(stored).toEqual([
      { name: '1º lote', name_key: '1º lote', quantity: 100, position: 1 },
      { name: '2º lote', name_key: '2º lote', quantity: null, position: 2 },
    ]);
  });

  it('(g) endsAt antes do endsAt de um anterior é BATCH_END_BEFORE_PREVIOUS', async () => {
    const draft = await draftSession(ctx);
    const sector = must(draft.sectors[0], 'sector');
    const path = batchPath(draft.eventId, draft.sessionId, sector.id);
    const first = await send(ctx, 'post', path, {
      name: 'A',
      priceCents: 100,
      endsAt: '2026-12-01T00:00:00.000Z',
    });
    expect(first.status).toBe(202);
    const res = await send(ctx, 'post', path, {
      name: 'B',
      priceCents: 100,
      endsAt: '2026-11-20T00:00:00.000Z',
    });
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'BATCH_END_BEFORE_PREVIOUS' });
    const ok = await send(ctx, 'post', path, {
      name: 'B',
      priceCents: 100,
      endsAt: '2026-12-02T00:00:00.000Z',
    });
    expect(ok.status).toBe(202);
  });

  it('(h) o 11º lote é BATCH_LIMIT_REACHED', async () => {
    const draft = await draftSession(ctx);
    const sector = must(draft.sectors[0], 'sector');
    const path = batchPath(draft.eventId, draft.sessionId, sector.id);
    for (let i = 1; i <= 10; i += 1) {
      const res = await send(ctx, 'post', path, {
        name: `Lote ${i}`,
        priceCents: 100,
        quantity: 1,
      });
      expect(res.status).toBe(202);
    }
    const res = await send(ctx, 'post', path, { name: 'Lote 11', priceCents: 100 });
    expect(res.status).toBe(422);
    expect(body(res)).toMatchObject({ code: 'BATCH_LIMIT_REACHED' });
    expect(await countRows(ctx.dataSource, 'catalog_batches')).toBe(10);
  });

  it('setor inexistente na sessão é 404 ENTITY_NOT_FOUND', async () => {
    const draft = await draftSession(ctx);
    const res = await send(
      ctx,
      'post',
      batchPath(draft.eventId, draft.sessionId, '0190a0a0-0000-7000-8000-000000000999'),
      {
        name: 'X',
        priceCents: 100,
      },
    );
    expect(res.status).toBe(404);
    expect(body(res)).toMatchObject({ code: 'ENTITY_NOT_FOUND' });
  });
});
