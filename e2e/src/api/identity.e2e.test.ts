import { createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import {
  AccessTokenClaimsSchema,
  DomainErrorResponseSchema,
  IdentityCommandAcceptedSchema,
  ListAdminOrganizerRequestsResponseSchema,
  ListMyOrganizerRequestsResponseSchema,
  ListOrganizerEventsResponseSchema,
  ListVenuesResponseSchema,
  MeResponseSchema,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  SessionResponseSchema,
  ValidationErrorResponseSchema,
  catalogRoutes,
  identityRoutes,
  maskCpf,
} from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import {
  createEvent,
  createVenueWithPlan,
  readOrganizerEventAt,
  readVenueAt,
  send,
  venueDraft,
} from '../support/catalog.ts';
import { query } from '../support/db.ts';
import { env } from '../support/env.ts';
import { api } from '../support/http.ts';
import {
  VALID_ALPHANUMERIC_CNPJ,
  VALID_CNPJ,
  adminToken,
  approveRaw,
  login,
  loginRaw,
  organizerToken,
  randomCpf,
  refresh,
  refreshCookieFrom,
  registerBody,
  registerOrganizer,
  registerRaw,
  registerVerifiedUser,
  rejectRaw,
  requestOrganizerRole,
  requestOrganizerRoleRaw,
  uniqueEmail,
} from '../support/identity.ts';
import { countMessagesTo, waitForVerificationToken } from '../support/mailpit.ts';

const SEED_ORGANIZER_ID = '0193a4f0-0000-7000-8000-000000000001';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const errorCode = (body: unknown) => DomainErrorResponseSchema.parse(body).code;

function decodeJwt(token: string): { header: Record<string, unknown>; payload: unknown } {
  const [header, payload] = token.split('.');
  const parse = (part: string | undefined) =>
    JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8')) as unknown;
  return { header: parse(header) as Record<string, unknown>, payload: parse(payload) };
}

async function getMe(token: string) {
  const res = await api('GET', identityRoutes.me(), { token });
  expect(res.status).toBe(200);
  return MeResponseSchema.parse(res.body);
}

async function getMyRequests(token: string) {
  const res = await api('GET', identityRoutes.myOrganizerRequests(), { token });
  expect(res.status).toBe(200);
  return ListMyOrganizerRequestsResponseSchema.parse(res.body).items;
}

async function listAdmin(params: string) {
  const res = await api('GET', `${identityRoutes.adminOrganizerRequests()}${params}`, {
    token: await adminToken(),
  });
  expect(res.status).toBe(200);
  return ListAdminOrganizerRequestsResponseSchema.parse(res.body);
}

const confirm = (token: string) => api('POST', identityRoutes.confirmEmail(), { body: { token } });

const resend = (email: string) =>
  api('POST', identityRoutes.emailVerifications(), { body: { email } });

describe('identity via gateway', () => {
  it('CA-1: cadastro válido guarda e-mail e CPF normalizados, hash scrypt e envia o e-mail', async () => {
    const email = uniqueEmail();
    const local = email.split('@')[0] ?? '';
    const cpf = randomCpf();
    const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const res = await registerRaw({
      fullName: 'Ana Exemplo',
      email: `${local.toUpperCase()}@Stubb.local`,
      password: 'senha-12345',
      cpf: masked,
    });
    expect(res.status).toBe(202);
    const { id } = IdentityCommandAcceptedSchema.parse(res.body);

    const [user] = await query<{
      email: string;
      cpf: string;
      password_hash: string;
      email_verified_at: Date | null;
    }>('SELECT email, cpf, password_hash, email_verified_at FROM identity_users WHERE id = $1', [
      id,
    ]);
    expect(user?.email).toBe(email);
    expect(user?.cpf).toBe(cpf);
    expect(user?.email_verified_at).toBeNull();
    expect(user?.password_hash.startsWith('scrypt$')).toBe(true);
    expect(user?.password_hash).not.toContain('senha-12345');
    const roles = await query<{ role: string }>(
      'SELECT role FROM identity_user_roles WHERE user_id = $1',
      [id],
    );
    expect(roles.map((r) => r.role)).toEqual(['customer']);

    const token = await waitForVerificationToken(email);
    expect(token.length).toBeGreaterThan(20);
  });

  it('CA-2: cadastro inválido responde 400 apontando o campo e não cria conta', async () => {
    const cases: { field: string; override: Record<string, unknown> }[] = [
      { field: 'cpf', override: { cpf: '12345678900' } },
      { field: 'cpf', override: { cpf: '111.111.111-11' } },
      { field: 'password', override: { password: 'a'.repeat(7) } },
      { field: 'password', override: { password: 'a'.repeat(129) } },
      { field: 'email', override: { email: 'nao-e-email' } },
      { field: 'fullName', override: { fullName: 'Al' } },
      { field: 'fullName', override: { fullName: 'a'.repeat(121) } },
      { field: 'cpf', override: { cpf: undefined } },
    ];
    for (const { field, override } of cases) {
      const body = { ...registerBody(), ...override };
      const res = await registerRaw(body);
      expect(res.status, JSON.stringify(override)).toBe(400);
      const parsed = ValidationErrorResponseSchema.parse(res.body);
      expect(parsed.issues.map((i) => i.path)).toContain(field);
      const rows = await query('SELECT 1 FROM identity_users WHERE email = $1', [body.email]);
      expect(rows).toHaveLength(0);
    }
  });

  it('CA-3: e-mail (sem diferenciar caixa) e CPF repetidos respondem 409 sem e-mail novo', async () => {
    const first = await registerVerifiedUser();

    const sameEmail = registerBody({ email: first.email.toUpperCase() });
    const emailRes = await registerRaw(sameEmail);
    expect(emailRes.status).toBe(409);
    expect(errorCode(emailRes.body)).toBe('EMAIL_ALREADY_REGISTERED');

    const sameCpf = registerBody({ cpf: first.cpf });
    const cpfRes = await registerRaw(sameCpf);
    expect(cpfRes.status).toBe(409);
    expect(errorCode(cpfRes.body)).toBe('CPF_ALREADY_REGISTERED');

    await sleep(1000);
    expect(await countMessagesTo(sameCpf.email)).toBe(0);
    expect(await countMessagesTo(first.email)).toBe(1);
    const rows = await query('SELECT 1 FROM identity_users WHERE cpf = $1', [first.cpf]);
    expect(rows).toHaveLength(1);
  });

  it('CA-4: a mesma Idempotency-Key repete a resposta, sem segunda conta nem segundo e-mail', async () => {
    const body = registerBody();
    const key = randomUUID();
    const first = await registerRaw(body, key);
    expect(first.status).toBe(202);
    await waitForVerificationToken(body.email);

    const again = await registerRaw(body, key);
    expect(again.status).toBe(202);
    expect(again.body).toEqual(first.body);

    // O hash da requisição não inclui a senha: outra senha com a mesma chave devolve a mesma resposta.
    const otherPassword = await registerRaw({ ...body, password: 'outra-senha-123' }, key);
    expect(otherPassword.status).toBe(202);
    expect(otherPassword.body).toEqual(first.body);

    const otherEmail = await registerRaw({ ...body, email: uniqueEmail() }, key);
    expect(otherEmail.status).toBe(422);
    expect(errorCode(otherEmail.body)).toBe('IDEMPOTENCY_KEY_MISMATCH');

    await sleep(1000);
    expect(await countMessagesTo(body.email)).toBe(1);
    const rows = await query('SELECT 1 FROM identity_users WHERE email = $1', [body.email]);
    expect(rows).toHaveLength(1);
  });

  it('CA-5: confirmação verifica a conta, é repetível e recusa token inexistente', async () => {
    const body = registerBody();
    const registered = await registerRaw(body);
    const { id } = IdentityCommandAcceptedSchema.parse(registered.body);
    const token = await waitForVerificationToken(body.email);

    const before = await loginRaw(body.email, body.password);
    expect(before.status).toBe(403);

    const confirmed = await confirm(token);
    expect(confirmed.status).toBe(202);
    expect(IdentityCommandAcceptedSchema.parse(confirmed.body).id).toBe(id);

    const repeated = await confirm(token);
    expect(repeated.status).toBe(202);
    expect(IdentityCommandAcceptedSchema.parse(repeated.body).id).toBe(id);

    const unknown = await confirm('token-que-nao-existe');
    expect(unknown.status).toBe(422);
    expect(errorCode(unknown.body)).toBe('VERIFICATION_TOKEN_INVALID');

    expect((await loginRaw(body.email, body.password)).status).toBe(200);
  });

  it('CA-6: reenvio invalida o link anterior e respeita o intervalo de 60 s', async () => {
    const body = registerBody();
    await registerRaw(body);
    const first = await waitForVerificationToken(body.email);

    // Antes de 60 s: 202, mas nenhum e-mail novo.
    const early = await resend(body.email);
    expect(early.status).toBe(202);
    await sleep(1500);
    expect(await countMessagesTo(body.email)).toBe(1);

    // E-mail inexistente: mesma resposta, sem vazar nada.
    const unknown = await resend(uniqueEmail());
    expect(unknown.status).toBe(202);

    // Passados 60 s do primeiro envio, sai um e-mail novo e o link antigo morre.
    await sleep(61_000);
    expect((await resend(body.email)).status).toBe(202);
    const second = await waitForVerificationToken(body.email, { minCount: 2 });
    expect(second).not.toBe(first);
    const oldLink = await confirm(first);
    expect(oldLink.status).toBe(422);
    expect(errorCode(oldLink.body)).toBe('VERIFICATION_TOKEN_INVALID');

    // Logo depois do reenvio, outro pedido não gera e-mail.
    expect((await resend(body.email)).status).toBe(202);
    await sleep(1500);
    expect(await countMessagesTo(body.email)).toBe(2);

    expect((await confirm(second)).status).toBe(202);
    // Conta já verificada: 202 e nenhum e-mail.
    expect((await resend(body.email)).status).toBe(202);
    await sleep(1500);
    expect(await countMessagesTo(body.email)).toBe(2);
  }, 90_000);

  it('CA-7: login recusado não diz se o e-mail existe e não emite cookie', async () => {
    const verified = await registerVerifiedUser();
    const unverified = registerBody();
    await registerRaw(unverified);

    const wrongPassword = await loginRaw(verified.email, 'senha-errada-123');
    const unknownEmail = await loginRaw(uniqueEmail(), 'senha-errada-123');
    const unverifiedWrong = await loginRaw(unverified.email, 'senha-errada-123');
    for (const res of [wrongPassword, unknownEmail, unverifiedWrong]) {
      expect(res.status).toBe(401);
      expect(errorCode(res.body)).toBe('INVALID_CREDENTIALS');
      expect(res.setCookies).toEqual([]);
    }
    const messages = new Set(
      [wrongPassword, unknownEmail, unverifiedWrong].map(
        (res) => DomainErrorResponseSchema.parse(res.body).message,
      ),
    );
    expect(messages.size).toBe(1);

    const unverifiedRight = await loginRaw(unverified.email, unverified.password);
    expect(unverifiedRight.status).toBe(403);
    expect(errorCode(unverifiedRight.body)).toBe('EMAIL_NOT_VERIFIED');
    expect(unverifiedRight.setCookies).toEqual([]);
  });

  it('CA-8: login aceito devolve JWT EdDSA sem dados pessoais e o cookie de refresh', async () => {
    const user = await registerVerifiedUser();
    const res = await loginRaw(user.email.toUpperCase(), user.password);
    expect(res.status).toBe(200);
    const session = SessionResponseSchema.parse(res.body);
    expect(session.expiresIn).toBe(900);

    const cookie = res.setCookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toContain(`Path=${REFRESH_COOKIE_PATH}`);
    expect(cookie).toMatch(/Max-Age=604800/i);

    const { header, payload } = decodeJwt(session.accessToken);
    expect(header.alg).toBe('EdDSA');
    const claims = AccessTokenClaimsSchema.parse(payload);
    expect(claims.sub).toBe(user.id);
    expect(claims.roles).toEqual(['customer']);
    expect(claims.exp - claims.iat).toBe(900);
    const raw = JSON.stringify(payload);
    expect(raw).not.toContain(user.cpf);
    expect(raw).not.toContain(user.email);

    // Conferência da assinatura só quando a chave pública foi informada (E2E_JWT_PUBLIC_KEY).
    if (env.JWT_PUBLIC_KEY) {
      const [h, p, s] = session.accessToken.split('.');
      const publicKey = createPublicKey(Buffer.from(env.JWT_PUBLIC_KEY, 'base64'));
      expect(
        verify(null, Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s ?? '', 'base64url')),
      ).toBe(true);
    }
  });

  it('CA-9: refresh rotaciona, e reusar o refresh antigo revoga a família', async () => {
    const user = await registerVerifiedUser();
    const { refreshCookie: r1 } = await login(user.email, user.password);

    const rotated = await api('POST', identityRoutes.sessionRefresh(), { cookie: r1 });
    expect(rotated.status).toBe(200);
    SessionResponseSchema.parse(rotated.body);
    const r2 = refreshCookieFrom(rotated);
    expect(r2).not.toBe(r1);

    const reused = await api('POST', identityRoutes.sessionRefresh(), { cookie: r1 });
    expect(reused.status).toBe(401);
    expect(errorCode(reused.body)).toBe('SESSION_INVALID');
    expect(reused.setCookies.join(';')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    const revoked = await api('POST', identityRoutes.sessionRefresh(), { cookie: r2 });
    expect(revoked.status).toBe(401);
    expect(errorCode(revoked.body)).toBe('SESSION_INVALID');

    const noCookie = await api('POST', identityRoutes.sessionRefresh());
    expect(noCookie.status).toBe(401);
    expect(errorCode(noCookie.body)).toBe('SESSION_INVALID');
  });

  it('CA-10 e CA-16: aprovar concede o papel, o refresh relê os papéis e o produtor cria local', async () => {
    const user = await registerVerifiedUser();
    const { refreshCookie } = await login(user.email, user.password);
    expect((await getMe(user.accessToken)).roles).toEqual(['customer']);

    const requestId = await requestOrganizerRole(user.accessToken);
    const approved = await approveRaw(await adminToken(), requestId);
    expect(approved.status).toBe(202);
    IdentityCommandAcceptedSchema.parse(approved.body);

    const [request] = await getMyRequests(user.accessToken);
    expect(request).toMatchObject({ id: requestId, status: 'approved' });
    expect(request?.decidedAt).not.toBeNull();

    // O token antigo ainda não tem o papel; o refresh traz.
    const before = await send(
      'POST',
      catalogRoutes.venues,
      venueDraft(),
      randomUUID(),
      user.accessToken,
    );
    expect(before.status).toBe(403);

    const renewed = await refresh(refreshCookie);
    const { payload } = decodeJwt(renewed.accessToken);
    const claims = AccessTokenClaimsSchema.parse(payload);
    expect(claims.roles).toContain('customer');
    expect(claims.roles).toContain('organizer');

    const created = await send(
      'POST',
      catalogRoutes.venues,
      venueDraft(),
      randomUUID(),
      renewed.accessToken,
    );
    expect(created.status).toBe(202);
    const { id: venueId } = IdentityCommandAcceptedSchema.parse(created.body);
    const [owner] = await query<{ organizer_id: string }>(
      "SELECT payload->'payload'->>'organizerId' AS organizer_id FROM outbox WHERE aggregate_id = $1 AND payload->'payload' ? 'organizerId'",
      [venueId],
    );
    expect(owner?.organizer_id).toBe(user.id);
  });

  it('CA-11: logout limpa o cookie, revoga a família e funciona sem cookie', async () => {
    const user = await registerVerifiedUser();
    const { refreshCookie } = await login(user.email, user.password);

    const out = await api('DELETE', identityRoutes.session(), { cookie: refreshCookie });
    expect(out.status).toBe(204);
    expect(out.setCookies.join(';')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    const after = await api('POST', identityRoutes.sessionRefresh(), { cookie: refreshCookie });
    expect(after.status).toBe(401);

    const noCookie = await api('DELETE', identityRoutes.session());
    expect(noCookie.status).toBe(204);
  });

  it('CA-12: /me devolve CPF mascarado e recusa token ausente, adulterado ou de outra chave', async () => {
    const user = await registerVerifiedUser();
    const me = await getMe(user.accessToken);
    expect(me).toEqual({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      cpf: maskCpf(user.cpf),
      roles: ['customer'],
    });
    expect(me.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);

    const anonymous = await api('GET', identityRoutes.me());
    expect(anonymous.status).toBe(401);
    expect(errorCode(anonymous.body)).toBe('UNAUTHENTICATED');

    const [h, p, s = ''] = user.accessToken.split('.');
    const tampered = `${h}.${p}.${s[0] === 'A' ? 'B' : 'A'}${s.slice(1)}`;
    const bad = await api('GET', identityRoutes.me(), { token: tampered });
    expect(bad.status).toBe(401);
    expect(errorCode(bad.body)).toBe('UNAUTHENTICATED');

    const garbage = await api('GET', identityRoutes.me(), { token: 'isto.nao.e-jwt' });
    expect(garbage.status).toBe(401);
    expect(errorCode(garbage.body)).toBe('UNAUTHENTICATED');

    const forged = await api('GET', identityRoutes.me(), { token: forgeToken(user.id) });
    expect(forged.status).toBe(401);
    expect(errorCode(forged.body)).toBe('UNAUTHENTICATED');
  });

  it('CA-13: pedido de produtor aceita CNPJ numérico e alfanumérico e recusa CNPJ inválido', async () => {
    const numeric = await registerVerifiedUser();
    const numericId = await requestOrganizerRole(numeric.accessToken, { cnpj: VALID_CNPJ });
    const [numericRequest] = await getMyRequests(numeric.accessToken);
    expect(numericRequest).toMatchObject({
      id: numericId,
      status: 'pending',
      cnpj: '11222333000181',
      rejectionMessage: null,
      decidedAt: null,
    });
    expect((await getMe(numeric.accessToken)).roles).toEqual(['customer']);

    const alpha = await registerVerifiedUser();
    const alphaId = await requestOrganizerRole(alpha.accessToken, {
      cnpj: VALID_ALPHANUMERIC_CNPJ,
    });
    expect((await getMyRequests(alpha.accessToken))[0]?.cnpj).toBe('12ABC34501DE35');

    const invalidUser = await registerVerifiedUser();
    for (const cnpj of ['11.222.333/0001-80', '11.111.111/1111-11']) {
      const res = await requestOrganizerRoleRaw(invalidUser.accessToken, { cnpj });
      expect(res.status, cnpj).toBe(400);
      expect(ValidationErrorResponseSchema.parse(res.body).issues.map((i) => i.path)).toContain(
        'cnpj',
      );
    }
    expect(await getMyRequests(invalidUser.accessToken)).toHaveLength(0);

    // Limpa a fila do admin para os testes seguintes.
    for (const id of [numericId, alphaId]) await rejectRaw(await adminToken(), id);
  });

  it('CA-14: pedido bloqueado por pendente, por papel já concedido e sob concorrência', async () => {
    const pending = await registerVerifiedUser();
    const pendingId = await requestOrganizerRole(pending.accessToken);
    const again = await requestOrganizerRoleRaw(pending.accessToken);
    expect(again.status).toBe(409);
    expect(errorCode(again.body)).toBe('ORGANIZER_REQUEST_PENDING');

    const racer = await registerVerifiedUser();
    const [a, b] = await Promise.all([
      requestOrganizerRoleRaw(racer.accessToken),
      requestOrganizerRoleRaw(racer.accessToken),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const loser = a.status === 409 ? a : b;
    expect(errorCode(loser.body)).toBe('ORGANIZER_REQUEST_PENDING');
    const racerRequests = await getMyRequests(racer.accessToken);
    expect(racerRequests.filter((r) => r.status === 'pending')).toHaveLength(1);

    const already = await requestOrganizerRoleRaw(await organizerToken());
    expect(already.status).toBe(409);
    expect(errorCode(already.body)).toBe('ALREADY_ORGANIZER');

    const admin = await adminToken();
    await rejectRaw(admin, pendingId);
    const [racerPending] = racerRequests;
    if (racerPending) await rejectRaw(admin, racerPending.id);
  });

  it('CA-15: lista do admin filtra por status, ordena e exige o papel admin', async () => {
    const admin = await adminToken();
    const rejectedUser = await registerVerifiedUser();
    const rejectedId = await requestOrganizerRole(rejectedUser.accessToken);
    expect((await rejectRaw(admin, rejectedId, 'Não confere')).status).toBe(202);
    const pendingUser = await registerVerifiedUser();
    const pendingId = await requestOrganizerRole(pendingUser.accessToken);

    const defaults = await listAdmin('');
    expect(defaults.page).toBe(1);
    expect(defaults.pageSize).toBe(20);
    expect(defaults.total).toBeGreaterThanOrEqual(defaults.items.length);
    expect(defaults.items.every((i) => i.status === 'pending')).toBe(true);
    const created = defaults.items.map((i) => i.createdAt);
    expect(created).toEqual([...created].sort());

    const pendingPage = await listAdmin('?status=pending&pageSize=50');
    const mine = pendingPage.items.find((i) => i.id === pendingId);
    expect(mine?.requester).toEqual({
      id: pendingUser.id,
      fullName: pendingUser.fullName,
      email: pendingUser.email,
    });
    expect(pendingPage.items.some((i) => i.id === rejectedId)).toBe(false);

    const rejected = await listAdmin('?status=rejected');
    expect(rejected.items.every((i) => i.status === 'rejected')).toBe(true);
    const decided = rejected.items.map((i) => i.decidedAt ?? '');
    expect(decided).toEqual([...decided].sort().reverse());
    expect(rejected.items[0]?.id).toBe(rejectedId);

    const forbidden = await api('GET', identityRoutes.adminOrganizerRequests(), {
      token: pendingUser.accessToken,
    });
    expect(forbidden.status).toBe(403);
    expect(errorCode(forbidden.body)).toBe('FORBIDDEN');
    const anonymous = await api('GET', identityRoutes.adminOrganizerRequests());
    expect(anonymous.status).toBe(401);
    expect(errorCode(anonymous.body)).toBe('UNAUTHENTICATED');

    await rejectRaw(admin, pendingId);
  });

  it('CA-17 e CA-19: recusa mostra a mensagem, permite novo pedido e o histórico vem do mais novo', async () => {
    const admin = await adminToken();
    const user = await registerVerifiedUser();
    const firstId = await requestOrganizerRole(user.accessToken);
    const rejected = await rejectRaw(admin, firstId, 'CNPJ não confere');
    expect(rejected.status).toBe(202);

    const [first] = await getMyRequests(user.accessToken);
    expect(first).toMatchObject({
      id: firstId,
      status: 'rejected',
      rejectionMessage: 'CNPJ não confere',
    });
    expect(first?.decidedAt).not.toBeNull();
    expect((await getMe(user.accessToken)).roles).toEqual(['customer']);

    const secondId = await requestOrganizerRole(user.accessToken);
    const history = await getMyRequests(user.accessToken);
    expect(history.map((r) => r.id)).toEqual([secondId, firstId]);
    expect(history.map((r) => r.status)).toEqual(['pending', 'rejected']);
    expect(history[0]?.rejectionMessage).toBeNull();
    expect(history[1]?.rejectionMessage).toBe('CNPJ não confere');

    // Recusa sem mensagem guarda null.
    expect((await rejectRaw(admin, secondId)).status).toBe(202);
    expect((await getMyRequests(user.accessToken))[0]).toMatchObject({
      id: secondId,
      status: 'rejected',
      rejectionMessage: null,
    });
  });

  it('CA-18: decisão inválida responde 409 e 404, e aprovações simultâneas decidem uma vez', async () => {
    const admin = await adminToken();
    const user = await registerVerifiedUser();
    const decidedId = await requestOrganizerRole(user.accessToken);
    expect((await approveRaw(admin, decidedId)).status).toBe(202);

    const approveAgain = await approveRaw(admin, decidedId);
    expect(approveAgain.status).toBe(409);
    expect(errorCode(approveAgain.body)).toBe('ORGANIZER_REQUEST_NOT_PENDING');
    const rejectDecided = await rejectRaw(admin, decidedId);
    expect(rejectDecided.status).toBe(409);
    expect(errorCode(rejectDecided.body)).toBe('ORGANIZER_REQUEST_NOT_PENDING');

    const missing = randomUUID();
    const approveMissing = await approveRaw(admin, missing);
    expect(approveMissing.status).toBe(404);
    expect(errorCode(approveMissing.body)).toBe('ORGANIZER_REQUEST_NOT_FOUND');
    const rejectMissing = await rejectRaw(admin, missing);
    expect(rejectMissing.status).toBe(404);
    expect(errorCode(rejectMissing.body)).toBe('ORGANIZER_REQUEST_NOT_FOUND');

    const racer = await registerVerifiedUser();
    const racerId = await requestOrganizerRole(racer.accessToken);
    const [a, b] = await Promise.all([approveRaw(admin, racerId), approveRaw(admin, racerId)]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const loser = a.status === 409 ? a : b;
    expect(errorCode(loser.body)).toBe('ORGANIZER_REQUEST_NOT_PENDING');
  });

  it('CA-20: Catalog recusa token ausente e conta sem papel, sem reservar a chave', async () => {
    const customer = await registerVerifiedUser();
    const before = await query<{ total: string }>('SELECT count(*) AS total FROM idempotency_keys');

    const anonymous = await api('POST', catalogRoutes.venues, {
      body: venueDraft(),
      idempotencyKey: randomUUID(),
    });
    expect(anonymous.status).toBe(401);
    expect(errorCode(anonymous.body)).toBe('UNAUTHENTICATED');

    const forbidden = await send(
      'POST',
      catalogRoutes.venues,
      venueDraft(),
      randomUUID(),
      customer.accessToken,
    );
    expect(forbidden.status).toBe(403);
    expect(errorCode(forbidden.body)).toBe('FORBIDDEN');

    const after = await query<{ total: string }>('SELECT count(*) AS total FROM idempotency_keys');
    expect(after[0]?.total).toBe(before[0]?.total);
  });

  it('CA-21, CA-22 e CA-23: posse, idempotência por usuário e leituras com dois produtores reais', async () => {
    const a = await registerOrganizer();
    const b = await registerOrganizer();

    const venueA = await createVenueWithPlan({}, a.accessToken);
    const eventA = await createEvent({}, a.accessToken);
    const eventB = await createEvent({}, b.accessToken);
    const venueB = await createVenueWithPlan({}, b.accessToken);

    // CA-21: B não alcança local nem evento de A (404, nunca 409, mesmo com expectedVersion errada).
    const patchVenue = await send(
      'PATCH',
      catalogRoutes.venue(venueA.id),
      { ...venueA.details, expectedVersion: 99 },
      randomUUID(),
      b.accessToken,
    );
    expect(patchVenue.status).toBe(404);
    expect(errorCode(patchVenue.body)).toBe('AGGREGATE_NOT_FOUND');

    const patchEvent = await send(
      'PATCH',
      catalogRoutes.event(eventA.id),
      { ...eventA.details, expectedVersion: 99 },
      randomUUID(),
      b.accessToken,
    );
    expect(patchEvent.status).toBe(404);
    expect(errorCode(patchEvent.body)).toBe('AGGREGATE_NOT_FOUND');

    const discard = await send(
      'DELETE',
      catalogRoutes.event(eventA.id),
      undefined,
      randomUUID(),
      b.accessToken,
    );
    expect(discard.status).toBe(404);
    expect(errorCode(discard.body)).toBe('AGGREGATE_NOT_FOUND');

    // Agendar sessão no próprio evento com o local de A: local inexistente.
    const schedule = await send(
      'POST',
      catalogRoutes.sessions(eventB.id),
      {
        venueId: venueA.id,
        timeZone: venueA.details.timeZone,
        startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        salesStartsAt: new Date(Date.now() - 60_000).toISOString(),
      },
      randomUUID(),
      b.accessToken,
    );
    expect(schedule.status).toBe(422);
    expect(errorCode(schedule.body)).toBe('VENUE_NOT_FOUND');

    // Nada de A mudou: o dono ainda lê a versão original.
    await readVenueAt(venueA.id, venueA.version, a.accessToken);
    await readOrganizerEventAt(eventA.id, eventA.version, a.accessToken);

    // O dono dos agregados é o sub do token (outbox).
    for (const [id, owner] of [
      [venueA.id, a.id],
      [eventA.id, a.id],
      [venueB.id, b.id],
    ] as const) {
      const [row] = await query<{ organizer_id: string }>(
        "SELECT payload->'payload'->>'organizerId' AS organizer_id FROM outbox WHERE aggregate_id = $1 AND payload->'payload' ? 'organizerId'",
        [id],
      );
      expect(row?.organizer_id).toBe(owner);
    }

    // CA-22: mesma chave e mesmo corpo por A e B geram dois locais.
    const key = randomUUID();
    const shared = venueDraft();
    const [sentA, sentB] = await Promise.all([
      send('POST', catalogRoutes.venues, shared, key, a.accessToken),
      send('POST', catalogRoutes.venues, shared, key, b.accessToken),
    ]);
    expect(sentA.status).toBe(202);
    expect(sentB.status).toBe(202);
    const idA = IdentityCommandAcceptedSchema.parse(sentA.body).id;
    const idB = IdentityCommandAcceptedSchema.parse(sentB.body).id;
    expect(idA).not.toBe(idB);

    // CA-23: leituras do produtor só mostram o que é dele.
    const eventsOfA = ListOrganizerEventsResponseSchema.parse(
      (
        await api('GET', `${catalogRoutes.organizerEvents}?pageSize=48`, {
          token: a.accessToken,
        })
      ).body,
    ).items.map((i) => i.id);
    expect(eventsOfA).toContain(eventA.id);
    expect(eventsOfA).not.toContain(eventB.id);

    const venuesOfA = ListVenuesResponseSchema.parse(
      (await api('GET', catalogRoutes.organizerVenues, { token: a.accessToken })).body,
    ).items.map((i) => i.id);
    expect(venuesOfA).toContain(venueA.id);
    expect(venuesOfA).not.toContain(venueB.id);

    const alienEvent = await api('GET', catalogRoutes.organizerEvent(eventB.id), {
      token: a.accessToken,
    });
    expect(alienEvent.status).toBe(404);
    const alienVenue = await api('GET', catalogRoutes.organizerVenue(venueB.id), {
      token: a.accessToken,
    });
    expect(alienVenue.status).toBe(404);

    const routes = [
      catalogRoutes.organizerEvents,
      catalogRoutes.organizerVenues,
      catalogRoutes.organizerEvent(eventA.id),
      catalogRoutes.organizerVenue(venueA.id),
    ];
    const customer = await registerVerifiedUser();
    for (const route of routes) {
      const anonymous = await api('GET', route);
      expect(anonymous.status, route).toBe(401);
      const noRole = await api('GET', route, { token: customer.accessToken });
      expect(noRole.status, route).toBe(403);
    }

    // A vitrine segue pública.
    const publicList = await api('GET', catalogRoutes.events);
    expect(publicList.status).toBe(200);
  });

  it('CA-25: admin e produtor seed entram com as senhas configuradas', async () => {
    const admin = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
    const adminMe = await getMe(admin.accessToken);
    expect(adminMe.email).toBe(env.ADMIN_EMAIL);
    expect([...adminMe.roles].sort()).toEqual(['admin', 'customer', 'organizer']);

    const organizer = await login(env.ORGANIZER_EMAIL, env.ORGANIZER_PASSWORD);
    const organizerMe = await getMe(organizer.accessToken);
    expect(organizerMe.email).toBe(env.ORGANIZER_EMAIL);
    expect(organizerMe.id).toBe(SEED_ORGANIZER_ID);
    expect([...organizerMe.roles].sort()).toEqual(['customer', 'organizer']);
    const requests = await getMyRequests(organizer.accessToken);
    expect(requests.some((r) => r.status === 'approved')).toBe(true);
  });
});

/** JWT com claims válidas, mas assinado por uma chave que a stack não conhece. */
function forgeToken(sub: string): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'EdDSA', typ: 'JWT' });
  const body = encode({
    sub,
    roles: ['customer', 'organizer', 'admin'],
    iss: 'stubb-identity',
    aud: 'stubb-api',
    iat: now,
    exp: now + 900,
  });
  const signature = sign(null, Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
  return `${head}.${body}.${signature}`;
}
