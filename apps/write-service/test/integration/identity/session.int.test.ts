import { createPublicKey } from 'node:crypto';
import {
  AccessTokenClaimsSchema,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type SessionResponse,
} from '@stubb/contracts';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, body, countRows, rows, truncateAll } from '../setup.js';
import {
  advance,
  bearer,
  cookieFrom,
  createIdentityApp,
  DAY,
  loginAs,
  PASSWORD,
  postLogin,
  postRegister,
  registerPayload,
  registerVerified,
  resetClock,
  type IdentityApp,
} from './helpers.js';

const setCookie = (res: { headers: Record<string, unknown> }) =>
  (res.headers['set-cookie'] as string[] | undefined) ?? [];

describe('sessão (CA-7 a CA-11)', () => {
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

  const refresh = (cookie?: string) => {
    const req = api(app.ctx).post('/api/identity/session/refresh');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('CA-7: credenciais erradas respondem 401 igual para as três causas e não emitem cookie', async () => {
    const verified = await registerVerified(app);
    const unverifiedPayload = registerPayload({ email: 'nao-verificada@exemplo.com' });
    await postRegister(app.ctx, unverifiedPayload);

    const wrongPassword = await postLogin(app.ctx, verified.email, 'senha-errada-1');
    const unknown = await postLogin(app.ctx, 'ninguem@exemplo.com');
    const unverifiedWrong = await postLogin(app.ctx, unverifiedPayload.email, 'senha-errada-1');

    for (const res of [wrongPassword, unknown, unverifiedWrong]) {
      expect(res.status).toBe(401);
      expect(body<{ code: string }>(res).code).toBe('INVALID_CREDENTIALS');
      expect(setCookie(res)).toEqual([]);
    }
    const messages = new Set(
      [wrongPassword, unknown, unverifiedWrong].map(
        (res) => body<{ message: string }>(res).message,
      ),
    );
    expect(messages).toEqual(new Set(['E-mail ou senha inválidos']));

    const unverified = await postLogin(
      app.ctx,
      unverifiedPayload.email,
      unverifiedPayload.password,
    );
    expect(unverified.status).toBe(403);
    expect(body<{ code: string }>(unverified).code).toBe('EMAIL_NOT_VERIFIED');
    expect(setCookie(unverified)).toEqual([]);
    expect(await countRows(app.ctx.dataSource, 'identity_refresh_tokens')).toBe(0);
  });

  it('CA-8: login aceito devolve token EdDSA com os claims esperados e o cookie com as flags exatas', async () => {
    const account = await registerVerified(app);
    const res = await postLogin(app.ctx, account.email.toUpperCase(), PASSWORD);

    expect(res.status).toBe(200);
    const session = body<SessionResponse>(res);
    expect(session.expiresIn).toBe(900);

    const cookie = setCookie(res).find((c) => c.startsWith('stubb_refresh='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/identity/session');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).not.toContain('Secure');

    // O par efêmero do test/support/auth.ts é o mesmo que o app usa para assinar.
    const publicKey = createPublicKey(
      Buffer.from(process.env.JWT_PUBLIC_KEY ?? '', 'base64').toString('utf8'),
    );
    expect(decodeProtectedHeader(session.accessToken).alg).toBe('EdDSA');
    const { payload } = await jwtVerify(session.accessToken, publicKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const claims = AccessTokenClaimsSchema.parse(payload);
    expect(claims.sub).toBe(account.id);
    expect(claims.roles).toEqual(['customer']);
    expect(claims.exp - claims.iat).toBe(900);
    const raw = Buffer.from(session.accessToken.split('.')[1] as string, 'base64url').toString();
    expect(raw).not.toContain(account.email);
    expect(raw).not.toContain(account.cpf);
  });

  it('CA-9: refresh rotaciona o cookie; reusar o antigo derruba a família inteira', async () => {
    const account = await registerVerified(app);
    const first = await loginAs(app.ctx, account);

    const second = await refresh(first.refreshCookie);
    expect(second.status).toBe(200);
    expect(body<SessionResponse>(second).accessToken).toBeTruthy();
    const secondCookie = cookieFrom(second);
    expect(secondCookie).not.toBe(first.refreshCookie);
    expect(setCookie(second).find((c) => c.startsWith('stubb_refresh='))).toContain(
      'Max-Age=604800',
    );

    const reuse = await refresh(first.refreshCookie);
    expect(reuse.status).toBe(401);
    expect(body<{ code: string }>(reuse).code).toBe('SESSION_INVALID');
    const cleared = setCookie(reuse).find((c) => c.startsWith('stubb_refresh=;'));
    expect(cleared).toContain('Max-Age=0');

    const familyDead = await refresh(secondCookie);
    expect(familyDead.status).toBe(401);
    expect(body<{ code: string }>(familyDead).code).toBe('SESSION_INVALID');
  });

  it('CA-9: sem cookie, cookie desconhecido ou refresh vencido respondem 401 SESSION_INVALID', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);

    for (const cookie of [undefined, 'stubb_refresh=desconhecido', 'outro=1']) {
      const res = await refresh(cookie);
      expect(res.status).toBe(401);
      expect(body<{ code: string }>(res).code).toBe('SESSION_INVALID');
    }

    advance(7 * DAY + 1000);
    const expired = await refresh(logged.refreshCookie);
    expect(expired.status).toBe(401);
    expect(body<{ code: string }>(expired).code).toBe('SESSION_INVALID');
  });

  it('CA-9: o refresh vale 7 dias a partir do último uso', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);
    advance(6 * DAY);
    const renewed = await refresh(logged.refreshCookie);
    expect(renewed.status).toBe(200);
    advance(6 * DAY);
    expect((await refresh(cookieFrom(renewed))).status).toBe(200);
  });

  it('CA-9: dois refreshes simultâneos com o mesmo cookie: no máximo um passa', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);
    const results = await Promise.all([
      refresh(logged.refreshCookie),
      refresh(logged.refreshCookie),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[1]).toBe(401);
    expect(statuses[0]).toBe(200);
  });

  it('CA-10: o refresh relê os papéis atuais da conta', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);
    await app.ctx.dataSource.query(
      `INSERT INTO identity_user_roles (user_id, role, granted_at) VALUES ($1, 'organizer', now())`,
      [account.id],
    );

    const res = await refresh(logged.refreshCookie);
    expect(res.status).toBe(200);
    const payload = JSON.parse(
      Buffer.from(
        body<SessionResponse>(res).accessToken.split('.')[1] as string,
        'base64url',
      ).toString(),
    ) as { roles: string[] };
    expect(payload.roles).toEqual(['customer', 'organizer']);
  });

  it('CA-11: logout responde 204, limpa o cookie e a família deixa de renovar', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);

    const res = await api(app.ctx)
      .delete('/api/identity/session')
      .set('Cookie', logged.refreshCookie);
    expect(res.status).toBe(204);
    const cleared = setCookie(res).find((c) => c.startsWith('stubb_refresh=;'));
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('Path=/api/identity/session');
    expect(cleared).toContain('HttpOnly');
    expect((await refresh(logged.refreshCookie)).status).toBe(401);
  });

  it('CA-11: logout sem cookie também responde 204; só encerra a sessão daquele dispositivo', async () => {
    const account = await registerVerified(app);
    const deviceA = await loginAs(app.ctx, account);
    const deviceB = await loginAs(app.ctx, account);

    expect((await api(app.ctx).delete('/api/identity/session')).status).toBe(204);
    expect(
      (await api(app.ctx).delete('/api/identity/session').set('Cookie', deviceA.refreshCookie))
        .status,
    ).toBe(204);
    expect((await refresh(deviceA.refreshCookie)).status).toBe(401);
    expect((await refresh(deviceB.refreshCookie)).status).toBe(200);
  });

  it('o access token emitido no login autentica GET /me', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);
    const res = await api(app.ctx).get('/api/identity/me').set(bearer(logged.accessToken));
    expect(res.status).toBe(200);
    expect(body<{ id: string }>(res).id).toBe(account.id);
  });

  it('as famílias de login ficam separadas (uma por login)', async () => {
    const account = await registerVerified(app);
    await loginAs(app.ctx, account);
    await loginAs(app.ctx, account);
    const families = await rows<{ n: number }>(
      app.ctx.dataSource,
      'SELECT count(DISTINCT family_id)::int AS n FROM identity_refresh_tokens',
    );
    expect(families[0]?.n).toBe(2);
  });
});
