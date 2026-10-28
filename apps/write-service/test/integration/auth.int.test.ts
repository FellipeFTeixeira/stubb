import { DomainErrorResponseSchema } from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signTestToken, TEST_ORGANIZER_ID, authHeader } from '../support/auth.js';
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
import { eventBody, venueBody } from './catalog/helpers.js';

describe('autenticação e papéis (CA-12, CA-20, CA-24)', () => {
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

  const routes = [
    ['venues', '/api/catalog/venues', venueBody()],
    ['events', '/api/catalog/events', eventBody()],
  ] as const;

  it.each(routes)(
    '401 UNAUTHENTICATED sem token em %s, sem reservar a chave',
    async (_n, path, payload) => {
      const res = await api(ctx).post(path).set('Idempotency-Key', newKey()).send(payload);
      expect(res.status).toBe(401);
      expect(DomainErrorResponseSchema.parse(body(res))).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
      expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(0);
      expect(await countRows(ctx.dataSource, 'catalog_venues')).toBe(0);
      expect(await countRows(ctx.dataSource, 'catalog_events')).toBe(0);
    },
  );

  it.each(routes)(
    '403 FORBIDDEN com conta só customer em %s, sem reservar a chave',
    async (_n, path, payload) => {
      const res = await api(ctx)
        .post(path)
        .set(await authHeader(TEST_ORGANIZER_ID, ['customer']))
        .set('Idempotency-Key', newKey())
        .send(payload);
      expect(res.status).toBe(403);
      expect(DomainErrorResponseSchema.parse(body(res))).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
      expect(await countRows(ctx.dataSource, 'idempotency_keys')).toBe(0);
      expect(await countRows(ctx.dataSource, 'catalog_venues')).toBe(0);
    },
  );

  it('401 com token vencido, assinatura inválida ou header malformado', async () => {
    const expired = await signTestToken({
      sub: TEST_ORGANIZER_ID,
      roles: ['organizer'],
      expiresInSeconds: -120,
      issuedAt: new Date(Date.now() - 3_600_000),
    });
    const bearers = [`Bearer ${expired}`, 'Bearer abc.def.ghi', 'Token xyz'];
    for (const authorization of bearers) {
      const res = await api(ctx)
        .post('/api/catalog/venues')
        .set('Authorization', authorization)
        .set('Idempotency-Key', newKey())
        .send(venueBody());
      expect(res.status).toBe(401);
      expect(DomainErrorResponseSchema.parse(body(res)).code).toBe('UNAUTHENTICATED');
    }
  });

  it('token de organizer passa pelo guard', async () => {
    const res = await api(ctx)
      .post('/api/catalog/venues')
      .set(await authHeader(TEST_ORGANIZER_ID))
      .set('Idempotency-Key', newKey())
      .send(venueBody());
    expect(res.status).toBe(202);
  });

  it('GET /health e os pings respondem sem token (CA-24)', async () => {
    expect((await api(ctx).get('/health')).status).toBe(200);
    const created = await api(ctx)
      .post('/api/diagnostics/pings')
      .set('Idempotency-Key', newKey())
      .send({ label: 'aberto' });
    expect(created.status).toBe(202);
    const id = body<{ id: string }>(created).id;
    const incremented = await api(ctx)
      .post(`/api/diagnostics/pings/${id}/increment`)
      .set('Idempotency-Key', newKey())
      .send({});
    expect(incremented.status).toBe(202);
  });
});

describe('migration da Identity (CA-26)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('cria as cinco tabelas identity_*', async () => {
    const tables = await rows<{ table_name: string }>(
      ctx.dataSource,
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'identity\\_%' ORDER BY table_name`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'identity_email_verifications',
      'identity_organizer_requests',
      'identity_refresh_tokens',
      'identity_user_roles',
      'identity_users',
    ]);
  });

  it('não toca a outbox: sem FK, sem trigger e sem linhas ligadas à Identity', async () => {
    const fks = await rows<{ n: number }>(
      ctx.dataSource,
      `SELECT count(*)::int AS n FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_class r ON r.oid = c.confrelid
        WHERE c.contype = 'f'
          AND ((t.relname = 'outbox' AND r.relname LIKE 'identity\\_%')
            OR (r.relname = 'outbox' AND t.relname LIKE 'identity\\_%'))`,
    );
    expect(fks[0]?.n).toBe(0);
    const triggers = await rows<{ n: number }>(
      ctx.dataSource,
      `SELECT count(*)::int AS n FROM pg_trigger tg JOIN pg_class t ON t.oid = tg.tgrelid
        WHERE NOT tg.tgisinternal AND t.relname LIKE 'identity\\_%'`,
    );
    expect(triggers[0]?.n).toBe(0);
    expect(await countRows(ctx.dataSource, 'outbox')).toBe(0);
  });
});
