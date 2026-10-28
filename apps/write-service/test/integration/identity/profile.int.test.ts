import {
  DomainErrorResponseSchema,
  ListMyOrganizerRequestsResponseSchema,
  MeResponseSchema,
} from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signTestToken } from '../../support/auth.js';
import { api, body, newKey, truncateAll } from '../setup.js';
import {
  ADMIN_ID,
  advance,
  bearer,
  createIdentityApp,
  insertAdmin,
  loginAs,
  registerVerified,
  resetClock,
  SECOND,
  type IdentityApp,
} from './helpers.js';

describe('me e histórico (CA-12, CA-19)', () => {
  let app: IdentityApp;
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
  });

  it('CA-12: GET /me devolve os dados da conta com o CPF mascarado', async () => {
    const account = await registerVerified(app, {
      fullName: 'Ana Souza',
      email: 'Ana@Exemplo.com',
      cpf: '123.456.789-09',
    });
    const { accessToken } = await loginAs(app.ctx, account);

    const res = await api(app.ctx).get('/api/identity/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(MeResponseSchema.parse(res.body)).toEqual({
      id: account.id,
      email: 'ana@exemplo.com',
      fullName: 'Ana Souza',
      cpf: '***.456.789-**',
      roles: ['customer'],
    });
    expect(JSON.stringify(res.body)).not.toContain('12345678909');
  });

  it('CA-12: sem token, token adulterado ou vencido responde 401 UNAUTHENTICATED', async () => {
    const account = await registerVerified(app);
    const { accessToken } = await loginAs(app.ctx, account);
    const expired = await signTestToken({
      sub: account.id,
      roles: ['customer'],
      expiresInSeconds: -120,
      issuedAt: new Date(Date.now() - 3_600_000),
    });
    const headers = [
      undefined,
      `Bearer ${accessToken.slice(0, -4)}AAAA`,
      `Bearer ${expired}`,
      'Bearer lixo',
    ];
    for (const authorization of headers) {
      const req = api(app.ctx).get('/api/identity/me');
      const res = await (authorization ? req.set('Authorization', authorization) : req);
      expect(res.status).toBe(401);
      expect(DomainErrorResponseSchema.parse(res.body).code).toBe('UNAUTHENTICATED');
    }
  });

  it('CA-12: token de conta inexistente responde 401', async () => {
    const token = await signTestToken({
      sub: '0193a4f0-0000-7000-8000-0000000000ee',
      roles: ['customer'],
    });
    const res = await api(app.ctx).get('/api/identity/me').set(bearer(token));
    expect(res.status).toBe(401);
  });

  it('CA-19: o histórico vem do pedido mais novo para o mais antigo, com mensagem de recusa', async () => {
    const account = await registerVerified(app);
    const { accessToken } = await loginAs(app.ctx, account);
    const admin = await insertAdmin(app.ctx, ADMIN_ID);

    const send = (name: string) =>
      api(app.ctx)
        .post('/api/identity/organizer-requests')
        .set(bearer(accessToken))
        .set('Idempotency-Key', newKey())
        .send({ organizationName: name, cnpj: '11.222.333/0001-81', reason: 'Quero vender' });

    const first = await send('Produtora Um');
    expect(first.status).toBe(202);
    advance(10 * SECOND);
    const rejected = await api(app.ctx)
      .post(`/api/identity/admin/organizer-requests/${body<{ id: string }>(first).id}/reject`)
      .set(admin)
      .set('Idempotency-Key', newKey())
      .send({ message: 'CNPJ não confere' });
    expect(rejected.status).toBe(202);
    advance(10 * SECOND);
    const second = await send('Produtora Dois');
    expect(second.status).toBe(202);

    const res = await api(app.ctx)
      .get('/api/identity/me/organizer-requests')
      .set(bearer(accessToken));
    expect(res.status).toBe(200);
    const { items } = ListMyOrganizerRequestsResponseSchema.parse(res.body);
    expect(items.map((i) => i.organizationName)).toEqual(['Produtora Dois', 'Produtora Um']);
    expect(items[0]).toMatchObject({
      status: 'pending',
      cnpj: '11222333000181',
      rejectionMessage: null,
      decidedAt: null,
      createdAt: '2026-11-01T12:00:20.000Z',
    });
    expect(items[1]).toMatchObject({
      status: 'rejected',
      rejectionMessage: 'CNPJ não confere',
      decidedAt: '2026-11-01T12:00:10.000Z',
      createdAt: '2026-11-01T12:00:00.000Z',
    });
  });

  it('GET /me/organizer-requests exige autenticação', async () => {
    expect((await api(app.ctx).get('/api/identity/me/organizer-requests')).status).toBe(401);
  });
});
