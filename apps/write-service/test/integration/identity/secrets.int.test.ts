import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, body, newKey, rows, truncateAll } from '../setup.js';
import {
  bearer,
  createIdentityApp,
  loginAs,
  postRegister,
  registerPayload,
  resetClock,
  type IdentityApp,
} from './helpers.js';

const IDENTITY_TABLES = [
  'identity_users',
  'identity_user_roles',
  'identity_email_verifications',
  'identity_refresh_tokens',
  'identity_organizer_requests',
];

describe('segredos no banco (CA-26)', () => {
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

  it('senha, token de verificação e refresh nunca ficam em claro', async () => {
    const payload = registerPayload({ password: 'Senha-Muito-Secreta-42' });
    const registered = await postRegister(app.ctx, payload);
    expect(registered.status).toBe(202);
    const sent = app.mailer.sent[0];
    if (!sent) throw new Error('sem e-mail');
    const verificationToken = app.mailer.extractToken(sent);
    await api(app.ctx)
      .post('/api/identity/email-verifications/confirm')
      .send({ token: verificationToken });

    const logged = await loginAs(app.ctx, {
      id: body<{ id: string }>(registered).id,
      email: payload.email,
      password: payload.password,
      cpf: payload.cpf,
    });
    const refreshToken = logged.refreshCookie.split('=')[1] as string;
    const renewed = await api(app.ctx)
      .post('/api/identity/session/refresh')
      .set('Cookie', logged.refreshCookie);
    expect(renewed.status).toBe(200);
    const request = await api(app.ctx)
      .post('/api/identity/organizer-requests')
      .set(bearer(logged.accessToken))
      .set('Idempotency-Key', newKey())
      .send({
        organizationName: 'Produtora X',
        cnpj: '11.222.333/0001-81',
        reason: 'Quero vender',
      });
    expect(request.status).toBe(202);

    const secrets = [payload.password, verificationToken, refreshToken];
    const dump = JSON.stringify(
      await Promise.all(
        [...IDENTITY_TABLES, 'idempotency_keys'].map((table) =>
          rows(app.ctx.dataSource, `SELECT * FROM ${table}`),
        ),
      ),
    );
    for (const secret of secrets) expect(dump).not.toContain(secret);

    const [user] = await rows<{ password_hash: string }>(
      app.ctx.dataSource,
      'SELECT password_hash FROM identity_users',
    );
    expect(user?.password_hash).toMatch(/^scrypt\$/);
    for (const table of ['identity_email_verifications', 'identity_refresh_tokens']) {
      const hashes = await rows<{ token_hash: string }>(
        app.ctx.dataSource,
        `SELECT token_hash FROM ${table}`,
      );
      expect(hashes.length).toBeGreaterThan(0);
      for (const { token_hash } of hashes) expect(token_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    const stored = await rows<{ response_body: unknown }>(
      app.ctx.dataSource,
      'SELECT response_body FROM idempotency_keys',
    );
    expect(stored.length).toBeGreaterThan(0);
  });

  it('o cadastro com a chave repetida e outra senha não guarda nenhuma das duas', async () => {
    const key = newKey();
    const payload = registerPayload();
    await postRegister(app.ctx, { ...payload, password: 'Primeira-Senha-1' }, key);
    await postRegister(app.ctx, { ...payload, password: 'Segunda-Senha-2' }, key);
    const dump = JSON.stringify(await rows(app.ctx.dataSource, 'SELECT * FROM idempotency_keys'));
    expect(dump).not.toContain('Primeira-Senha-1');
    expect(dump).not.toContain('Segunda-Senha-2');
  });
});
