import {
  DomainErrorResponseSchema,
  ListAdminOrganizerRequestsResponseSchema,
} from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authHeader } from '../../support/auth.js';
import { venueBody } from '../catalog/helpers.js';
import { api, body, countRows, newKey, rows, truncateAll } from '../setup.js';
import {
  ADMIN_ID,
  advance,
  bearer,
  cookieFrom,
  createIdentityApp,
  insertAdmin,
  loginAs,
  registerVerified,
  resetClock,
  SECOND,
  type IdentityApp,
  type LoggedIn,
} from './helpers.js';

const CNPJ = '11.222.333/0001-81';

describe('pedidos de produtor (CA-13 a CA-18)', () => {
  let app: IdentityApp;
  let admin: { Authorization: string };
  beforeAll(async () => {
    app = await createIdentityApp();
  });
  afterAll(async () => {
    await app.ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(app.ctx.dataSource);
    app.mailer.reset();
    resetClock();
    admin = await insertAdmin(app.ctx, ADMIN_ID);
  });

  const customer = async (): Promise<LoggedIn> => loginAs(app.ctx, await registerVerified(app));

  const requestRole = (
    user: LoggedIn,
    overrides: Record<string, unknown> = {},
    key: string = newKey(),
  ) =>
    api(app.ctx)
      .post('/api/identity/organizer-requests')
      .set(bearer(user.accessToken))
      .set('Idempotency-Key', key)
      .send({
        organizationName: 'Produtora Aurora',
        cnpj: CNPJ,
        reason: 'Quero vender',
        ...overrides,
      });

  const decide = (id: string, action: 'approve' | 'reject', payload: object = {}) =>
    api(app.ctx)
      .post(`/api/identity/admin/organizer-requests/${id}/${action}`)
      .set(admin)
      .set('Idempotency-Key', newKey())
      .send(payload);

  const idOf = (res: { body: unknown }) => body<{ id: string }>(res).id;

  const rolesOf = async (userId: string) =>
    (
      await rows<{ role: string }>(
        app.ctx.dataSource,
        'SELECT role FROM identity_user_roles WHERE user_id = $1 ORDER BY role',
        [userId],
      )
    ).map((r) => r.role);

  it('CA-13: cria o pedido pendente com o CNPJ normalizado e a conta segue customer', async () => {
    const user = await customer();
    const res = await requestRole(user);
    expect(res.status).toBe(202);
    const [row] = await rows<{ id: string; status: string; cnpj: string; user_id: string }>(
      app.ctx.dataSource,
      'SELECT id, status, cnpj, user_id FROM identity_organizer_requests',
    );
    expect(row).toMatchObject({ id: idOf(res), status: 'pending', cnpj: '11222333000181' });
    expect(row?.user_id).toBe(user.id);
    expect(await rolesOf(user.id)).toEqual(['customer']);
  });

  it('CA-13: aceita o CNPJ alfanumérico e recusa CNPJ inválido com 400', async () => {
    const user = await customer();
    const alpha = await requestRole(user, { cnpj: '12.ABC.345/01DE-35' });
    expect(alpha.status).toBe(202);
    const [row] = await rows<{ cnpj: string }>(
      app.ctx.dataSource,
      'SELECT cnpj FROM identity_organizer_requests',
    );
    expect(row?.cnpj).toBe('12ABC34501DE35');

    const other = await customer();
    for (const cnpj of ['11.222.333/0001-80', '00.000.000/0000-00']) {
      const res = await requestRole(other, { cnpj });
      expect(res.status).toBe(400);
      expect(body<{ code: string }>(res).code).toBe('VALIDATION_FAILED');
    }
  });

  it('CA-14: pedido pendente e conta já produtora recebem 409; simultâneos mantêm um só pendente', async () => {
    const user = await customer();
    const results = await Promise.all([requestRole(user), requestRole(user)]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
    const conflict = results.find((r) => r.status === 409);
    expect(body<{ code: string }>(conflict ?? { body: {} }).code).toBe('ORGANIZER_REQUEST_PENDING');
    expect(await countRows(app.ctx.dataSource, 'identity_organizer_requests')).toBe(1);

    const again = await requestRole(user);
    expect(again.status).toBe(409);
    expect(body<{ code: string }>(again).code).toBe('ORGANIZER_REQUEST_PENDING');

    const producer = await customer();
    await app.ctx.dataSource.query(
      `INSERT INTO identity_user_roles (user_id, role, granted_at) VALUES ($1, 'organizer', now())`,
      [producer.id],
    );
    const blocked = await requestRole(producer);
    expect(blocked.status).toBe(409);
    expect(body<{ code: string }>(blocked).code).toBe('ALREADY_ORGANIZER');
  });

  it('exige autenticação e Idempotency-Key no pedido', async () => {
    const user = await customer();
    const anonymous = await api(app.ctx)
      .post('/api/identity/organizer-requests')
      .set('Idempotency-Key', newKey())
      .send({ organizationName: 'X Y', cnpj: CNPJ, reason: 'r' });
    expect(anonymous.status).toBe(401);
    const noKey = await api(app.ctx)
      .post('/api/identity/organizer-requests')
      .set(bearer(user.accessToken))
      .send({ organizationName: 'Produtora', cnpj: CNPJ, reason: 'r' });
    expect(noKey.status).toBe(400);
  });

  it('a mesma chave repete a resposta sem criar outro pedido', async () => {
    const user = await customer();
    const key = newKey();
    const first = await requestRole(user, {}, key);
    const replay = await requestRole(user, {}, key);
    expect(replay.status).toBe(202);
    expect(idOf(replay)).toBe(idOf(first));
    expect(await countRows(app.ctx.dataSource, 'identity_organizer_requests')).toBe(1);
  });

  describe('lista do admin (CA-15)', () => {
    it('pendentes do mais antigo ao mais novo; recusados pela decisão mais recente', async () => {
      const a = await customer();
      const b = await customer();
      const c = await customer();
      const ra = await requestRole(a, { organizationName: 'Org A' });
      advance(10 * SECOND);
      const rb = await requestRole(b, { organizationName: 'Org B' });
      advance(10 * SECOND);
      const rc = await requestRole(c, { organizationName: 'Org C' });
      advance(10 * SECOND);
      await decide(idOf(ra), 'reject', { message: 'primeira' });
      advance(10 * SECOND);
      await decide(idOf(rc), 'reject', { message: 'segunda' });
      expect(idOf(rb)).toBeTruthy();

      const pending = await api(app.ctx).get('/api/identity/admin/organizer-requests').set(admin);
      expect(pending.status).toBe(200);
      const parsedPending = ListAdminOrganizerRequestsResponseSchema.parse(pending.body);
      expect(parsedPending).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(parsedPending.items.map((i) => i.organizationName)).toEqual(['Org B']);
      expect(parsedPending.items[0]?.requester).toEqual({
        id: b.id,
        fullName: 'Ana Souza',
        email: b.email,
      });

      const rejected = await api(app.ctx)
        .get('/api/identity/admin/organizer-requests?status=rejected')
        .set(admin);
      const parsedRejected = ListAdminOrganizerRequestsResponseSchema.parse(rejected.body);
      expect(parsedRejected.total).toBe(2);
      expect(parsedRejected.items.map((i) => i.organizationName)).toEqual(['Org C', 'Org A']);
      expect(parsedRejected.items[0]?.rejectionMessage).toBe('segunda');
    });

    it('pagina com page e pageSize e valida os parâmetros', async () => {
      for (let i = 0; i < 3; i += 1) {
        await requestRole(await customer(), { organizationName: `Org ${i}` });
        advance(SECOND);
      }
      const page2 = await api(app.ctx)
        .get('/api/identity/admin/organizer-requests?page=2&pageSize=2')
        .set(admin);
      const parsed = ListAdminOrganizerRequestsResponseSchema.parse(page2.body);
      expect(parsed).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(parsed.items.map((i) => i.organizationName)).toEqual(['Org 2']);

      for (const query of ['status=x', 'pageSize=51', 'page=0']) {
        const bad = await api(app.ctx)
          .get(`/api/identity/admin/organizer-requests?${query}`)
          .set(admin);
        expect(bad.status, query).toBe(400);
      }
    });

    it('conta sem admin recebe 403 e sem token recebe 401', async () => {
      const user = await customer();
      const forbidden = await api(app.ctx)
        .get('/api/identity/admin/organizer-requests')
        .set(bearer(user.accessToken));
      expect(forbidden.status).toBe(403);
      expect(DomainErrorResponseSchema.parse(forbidden.body).code).toBe('FORBIDDEN');
      const noToken = await api(app.ctx).get('/api/identity/admin/organizer-requests');
      expect(noToken.status).toBe(401);
      const organizerOnly = await api(app.ctx)
        .get('/api/identity/admin/organizer-requests')
        .set(await authHeader(user.id, ['customer', 'organizer']));
      expect(organizerOnly.status).toBe(403);
    });
  });

  it('CA-16: aprovar concede organizer, e depois do refresh a conta cria um local no Catalog', async () => {
    const user = await customer();
    const created = await requestRole(user);
    advance(5 * SECOND);

    const res = await decide(idOf(created), 'approve');
    expect(res.status).toBe(202);
    expect(idOf(res)).toBe(idOf(created));
    const [row] = await rows<{ status: string; decided_at: Date | null; decided_by: string }>(
      app.ctx.dataSource,
      'SELECT status, decided_at, decided_by FROM identity_organizer_requests',
    );
    expect(row?.status).toBe('approved');
    expect(row?.decided_at?.toISOString()).toBe('2026-11-01T12:00:05.000Z');
    expect(row?.decided_by).toBe(ADMIN_ID);
    expect(await rolesOf(user.id)).toEqual(['customer', 'organizer']);

    // Com o access token antigo (só customer) o Catalog ainda recusa.
    const before = await api(app.ctx)
      .post('/api/catalog/venues')
      .set(bearer(user.accessToken))
      .set('Idempotency-Key', newKey())
      .send(venueBody());
    expect(before.status).toBe(403);

    const refreshed = await api(app.ctx)
      .post('/api/identity/session/refresh')
      .set('Cookie', user.refreshCookie);
    expect(refreshed.status).toBe(200);
    expect(cookieFrom(refreshed)).not.toBe(user.refreshCookie);
    const venue = await api(app.ctx)
      .post('/api/catalog/venues')
      .set(bearer(body<{ accessToken: string }>(refreshed).accessToken))
      .set('Idempotency-Key', newKey())
      .send(venueBody());
    expect(venue.status).toBe(202);
    const [owner] = await rows<{ organizer_id: string }>(
      app.ctx.dataSource,
      'SELECT organizer_id FROM catalog_venues WHERE id = $1',
      [idOf(venue)],
    );
    expect(owner?.organizer_id).toBe(user.id);
  });

  it('CA-17: recusar guarda a mensagem, a conta segue customer e pode pedir de novo', async () => {
    const user = await customer();
    const first = await requestRole(user);
    const res = await decide(idOf(first), 'reject', { message: '  CNPJ não confere  ' });
    expect(res.status).toBe(202);
    const [row] = await rows<{ status: string; rejection_message: string | null }>(
      app.ctx.dataSource,
      'SELECT status, rejection_message FROM identity_organizer_requests',
    );
    expect(row).toEqual({ status: 'rejected', rejection_message: 'CNPJ não confere' });
    expect(await rolesOf(user.id)).toEqual(['customer']);

    const again = await requestRole(user);
    expect(again.status).toBe(202);

    // Sem mensagem (corpo vazio ou string em branco): rejection_message fica null.
    const other = await customer();
    const second = await requestRole(other);
    expect((await decide(idOf(second), 'reject', { message: '   ' })).status).toBe(202);
    const [blank] = await rows<{ rejection_message: string | null }>(
      app.ctx.dataSource,
      'SELECT rejection_message FROM identity_organizer_requests WHERE id = $1',
      [idOf(second)],
    );
    expect(blank?.rejection_message).toBeNull();
  });

  it('CA-17: mensagem de recusa com mais de 500 caracteres responde 400', async () => {
    const created = await requestRole(await customer());
    const res = await decide(idOf(created), 'reject', { message: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('CA-18: decidido responde 409, inexistente 404 e aprovações simultâneas uma só passa', async () => {
    const user = await customer();
    const created = await requestRole(user);
    expect((await decide(idOf(created), 'approve')).status).toBe(202);

    for (const action of ['approve', 'reject'] as const) {
      const again = await decide(idOf(created), action);
      expect(again.status).toBe(409);
      expect(body<{ code: string }>(again).code).toBe('ORGANIZER_REQUEST_NOT_PENDING');
    }
    for (const action of ['approve', 'reject'] as const) {
      const missing = await decide('0193a4f0-0000-7000-8000-0000000000ff', action);
      expect(missing.status).toBe(404);
      expect(body<{ code: string }>(missing).code).toBe('ORGANIZER_REQUEST_NOT_FOUND');
    }

    const other = await customer();
    const pending = await requestRole(other);
    const race = await Promise.all([
      decide(idOf(pending), 'approve'),
      decide(idOf(pending), 'approve'),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(await rolesOf(other.id)).toEqual(['customer', 'organizer']);
  });

  it('decidir exige papel admin, token e Idempotency-Key', async () => {
    const user = await customer();
    const created = await requestRole(user);
    const id = idOf(created);
    const asCustomer = await api(app.ctx)
      .post(`/api/identity/admin/organizer-requests/${id}/approve`)
      .set(bearer(user.accessToken))
      .set('Idempotency-Key', newKey())
      .send({});
    expect(asCustomer.status).toBe(403);
    const anonymous = await api(app.ctx)
      .post(`/api/identity/admin/organizer-requests/${id}/approve`)
      .set('Idempotency-Key', newKey())
      .send({});
    expect(anonymous.status).toBe(401);
    const noKey = await api(app.ctx)
      .post(`/api/identity/admin/organizer-requests/${id}/approve`)
      .set(admin)
      .send({});
    expect(noKey.status).toBe(400);
    const badId = await decide('nao-e-uuid', 'approve');
    expect(badId.status).toBe(400);
    expect(await rolesOf(user.id)).toEqual(['customer']);
  });
});
