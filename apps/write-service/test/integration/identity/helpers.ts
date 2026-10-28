import { cpfCheckDigits } from '@stubb/contracts';
import { Clock } from '../../../src/shared/clock/clock.js';
import { authHeader } from '../../support/auth.js';
import { FakeMailer } from '../../support/fake-mailer.js';
import { api, body, createTestApp, newKey, type TestApp } from '../setup.js';

export const NOW = new Date('2026-11-01T12:00:00.000Z');
export const clockState = { now: NOW };
export const resetClock = () => {
  clockState.now = NOW;
};
export const advance = (ms: number) => {
  clockState.now = new Date(clockState.now.getTime() + ms);
};
export const SECOND = 1000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const PASSWORD = 'senha-segura-1';

export interface IdentityApp {
  ctx: TestApp;
  mailer: FakeMailer;
}

export async function createIdentityApp(): Promise<IdentityApp> {
  const { Mailer } = await import('../../../src/identity/infrastructure/mailer.js');
  const mailer = new FakeMailer();
  const ctx = await createTestApp([
    { provide: Clock, useValue: { now: () => clockState.now } },
    { provide: Mailer, useValue: mailer },
  ]);
  resetClock();
  return { ctx, mailer };
}

let counter = 0;

// CPFs válidos distintos por chamada: base de 9 dígitos + dígitos verificadores.
export function nextCpf(): string {
  counter += 1;
  const base = String(100_000_000 + counter * 7919).slice(0, 9);
  return base + cpfCheckDigits(base);
}

export interface RegisterOverrides {
  fullName?: string;
  email?: string;
  password?: string;
  cpf?: string;
  key?: string;
}

export function registerPayload(overrides: RegisterOverrides = {}) {
  counter += 1;
  return {
    fullName: overrides.fullName ?? 'Ana Souza',
    email: overrides.email ?? `ana${counter}@exemplo.com`,
    password: overrides.password ?? PASSWORD,
    cpf: overrides.cpf ?? nextCpf(),
  };
}

export function postRegister(ctx: TestApp, payload: object, key: string = newKey()) {
  return api(ctx).post('/api/identity/users').set('Idempotency-Key', key).send(payload);
}

export function postConfirm(ctx: TestApp, token: string) {
  return api(ctx).post('/api/identity/email-verifications/confirm').send({ token });
}

export function postResend(ctx: TestApp, email: string) {
  return api(ctx).post('/api/identity/email-verifications').send({ email });
}

export function postLogin(ctx: TestApp, email: string, password = PASSWORD) {
  return api(ctx).post('/api/identity/session').send({ email, password });
}

export interface Account {
  id: string;
  email: string;
  password: string;
  cpf: string;
}

// Cadastra e confirma o e-mail pelo link que o FakeMailer capturou.
export async function registerVerified(
  { ctx, mailer }: IdentityApp,
  overrides: RegisterOverrides = {},
): Promise<Account> {
  const payload = registerPayload(overrides);
  const res = await postRegister(ctx, payload, overrides.key);
  if (res.status !== 202) throw new Error(`register -> ${res.status} ${JSON.stringify(res.body)}`);
  const email = payload.email.toLowerCase();
  const sent = mailer.to(email).at(-1);
  if (!sent) throw new Error('e-mail de verificação não enviado');
  const confirmed = await postConfirm(ctx, mailer.extractToken(sent));
  if (confirmed.status !== 202) throw new Error(`confirm -> ${confirmed.status}`);
  return { id: body<{ id: string }>(res).id, email, password: payload.password, cpf: payload.cpf };
}

export interface LoggedIn extends Account {
  accessToken: string;
  refreshCookie: string;
}

// Valor `stubb_refresh=<token>` do Set-Cookie, para reenviar no header Cookie.
export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const header = res.headers['set-cookie'] as string[] | undefined;
  const line = header?.find((entry) => entry.startsWith('stubb_refresh='));
  if (!line) throw new Error('Set-Cookie stubb_refresh ausente');
  return line.split(';')[0] as string;
}

export async function loginAs(ctx: TestApp, account: Account): Promise<LoggedIn> {
  const res = await postLogin(ctx, account.email, account.password);
  if (res.status !== 200) throw new Error(`login -> ${res.status} ${JSON.stringify(res.body)}`);
  return {
    ...account,
    accessToken: body<{ accessToken: string }>(res).accessToken,
    refreshCookie: cookieFrom(res),
  };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// Admin sem passar pelo seed: insere conta verificada com os três papéis.
export async function insertAdmin(ctx: TestApp, id: string): Promise<{ Authorization: string }> {
  const now = clockState.now;
  await ctx.dataSource.query(
    `INSERT INTO identity_users (id, email, password_hash, full_name, cpf, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, 'scrypt$x', 'Admin Teste', $3, $4, $4, $4)`,
    [id, `admin-${id}@exemplo.com`, nextCpf(), now],
  );
  for (const role of ['customer', 'organizer', 'admin']) {
    await ctx.dataSource.query(
      'INSERT INTO identity_user_roles (user_id, role, granted_at) VALUES ($1, $2, $3)',
      [id, role, now],
    );
  }
  return authHeader(id, ['customer', 'organizer', 'admin']);
}

export const ADMIN_ID = '0193a4f0-0000-7000-8000-0000000000ad';
