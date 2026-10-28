import { randomBytes, randomUUID } from 'node:crypto';
import {
  IdentityCommandAcceptedSchema,
  REFRESH_COOKIE_NAME,
  SessionResponseSchema,
  cpfCheckDigits,
  identityRoutes,
  isValidCpf,
} from '@stubb/contracts';
import { v7 as uuidv7 } from 'uuid';
import { env } from './env.ts';
import { api, type ApiResponse } from './http.ts';
import { waitForVerificationToken } from './mailpit.ts';

export const DEFAULT_PASSWORD = 'senha-de-teste-e2e';
export const VALID_CNPJ = '11.222.333/0001-81';
export const VALID_ALPHANUMERIC_CNPJ = '12.ABC.345/01DE-35';

/** Reaproveita o token do seed por até 10 min; o access token vale 15. */
const TOKEN_REUSE_MS = 10 * 60 * 1000;

export const uniqueEmail = () => `e2e-${uuidv7()}@stubb.local`;

/** CPF válido de 9 dígitos aleatórios mais os dígitos verificadores. */
export function randomCpf(): string {
  for (;;) {
    const base = Array.from(randomBytes(9), (byte) => byte % 10).join('');
    const cpf = `${base}${cpfCheckDigits(base)}`;
    if (isValidCpf(cpf)) return cpf;
  }
}

export interface RegisterBody {
  fullName: string;
  email: string;
  password: string;
  cpf: string;
}

export function registerBody(overrides: Partial<RegisterBody> = {}): RegisterBody {
  return {
    fullName: 'Pessoa de Teste',
    email: uniqueEmail(),
    password: DEFAULT_PASSWORD,
    cpf: randomCpf(),
    ...overrides,
  };
}

export function registerRaw(
  body: unknown,
  idempotencyKey: string = randomUUID(),
): Promise<ApiResponse> {
  return api('POST', identityRoutes.users(), { body, idempotencyKey });
}

export function loginRaw(email: string, password: string): Promise<ApiResponse> {
  return api('POST', identityRoutes.session(), { body: { email, password } });
}

/** `stubb_refresh=<valor>`, pronto para o header `Cookie`. Falha se a resposta não emitiu o cookie. */
export function refreshCookieFrom(response: ApiResponse): string {
  const header = response.setCookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  const pair = header?.split(';')[0];
  if (!pair) throw new Error(`resposta sem cookie ${REFRESH_COOKIE_NAME}`);
  return pair;
}

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshCookie: string }> {
  const res = await loginRaw(email, password);
  if (res.status !== 200)
    throw new Error(`login ${email} → ${res.status} ${JSON.stringify(res.body)}`);
  const { accessToken } = SessionResponseSchema.parse(res.body);
  return { accessToken, refreshCookie: refreshCookieFrom(res) };
}

export interface VerifiedUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  cpf: string;
  accessToken: string;
}

/** Cadastra, confirma o e-mail pelo Mailpit e entra. Papel: só `customer`. */
export async function registerVerifiedUser(
  overrides: Partial<RegisterBody> = {},
): Promise<VerifiedUser> {
  const body = registerBody(overrides);
  const registered = await registerRaw(body);
  if (registered.status !== 202) {
    throw new Error(`cadastro → ${registered.status} ${JSON.stringify(registered.body)}`);
  }
  const { id } = IdentityCommandAcceptedSchema.parse(registered.body);
  const token = await waitForVerificationToken(body.email);
  const confirmed = await api('POST', identityRoutes.confirmEmail(), { body: { token } });
  if (confirmed.status !== 202) {
    throw new Error(`confirmação → ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  }
  const { accessToken } = await login(body.email, body.password);
  return {
    id,
    email: body.email,
    password: body.password,
    fullName: body.fullName,
    cpf: body.cpf,
    accessToken,
  };
}

/** Envia o pedido de produtor (resposta crua). */
export function requestOrganizerRoleRaw(
  token: string,
  overrides: Partial<{ organizationName: string; cnpj: string; reason: string }> = {},
  idempotencyKey: string = randomUUID(),
): Promise<ApiResponse> {
  return api('POST', identityRoutes.organizerRequests(), {
    token,
    idempotencyKey,
    body: {
      organizationName: 'Produtora E2E',
      cnpj: VALID_CNPJ,
      reason: 'Quero vender ingressos dos meus eventos.',
      ...overrides,
    },
  });
}

export async function requestOrganizerRole(
  token: string,
  overrides: Partial<{ organizationName: string; cnpj: string; reason: string }> = {},
): Promise<string> {
  const res = await requestOrganizerRoleRaw(token, overrides);
  if (res.status !== 202) {
    throw new Error(`pedido de produtor → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return IdentityCommandAcceptedSchema.parse(res.body).id;
}

export function approveRaw(
  adminAccessToken: string,
  requestId: string,
  idempotencyKey: string = randomUUID(),
): Promise<ApiResponse> {
  return api('POST', identityRoutes.approveOrganizerRequest(requestId), {
    token: adminAccessToken,
    idempotencyKey,
    body: {},
  });
}

export function rejectRaw(
  adminAccessToken: string,
  requestId: string,
  message?: string,
  idempotencyKey: string = randomUUID(),
): Promise<ApiResponse> {
  return api('POST', identityRoutes.rejectOrganizerRequest(requestId), {
    token: adminAccessToken,
    idempotencyKey,
    body: message === undefined ? {} : { message },
  });
}

/** Renova a sessão pelo cookie; devolve o novo access token e o cookie rotacionado. */
export async function refresh(
  refreshCookie: string,
): Promise<{ accessToken: string; refreshCookie: string }> {
  const res = await api('POST', identityRoutes.sessionRefresh(), { cookie: refreshCookie });
  if (res.status !== 200) throw new Error(`refresh → ${res.status} ${JSON.stringify(res.body)}`);
  return {
    accessToken: SessionResponseSchema.parse(res.body).accessToken,
    refreshCookie: refreshCookieFrom(res),
  };
}

/** Conta nova que pediu o papel de produtor, foi aprovada pelo admin e já tem o token com `organizer`. */
export async function registerOrganizer(): Promise<VerifiedUser> {
  const user = await registerVerifiedUser();
  const requestId = await requestOrganizerRole(user.accessToken);
  const approved = await approveRaw(await adminToken(), requestId);
  if (approved.status !== 202) {
    throw new Error(`aprovação → ${approved.status} ${JSON.stringify(approved.body)}`);
  }
  const { accessToken } = await login(user.email, user.password);
  return { ...user, accessToken };
}

interface CachedToken {
  token: string;
  at: number;
}

function cachedLogin(email: string, password: string): () => Promise<string> {
  let cached: Promise<CachedToken> | undefined;
  return async () => {
    if (cached) {
      const current = await cached;
      if (Date.now() - current.at < TOKEN_REUSE_MS) return current.token;
    }
    cached = login(email, password).then(({ accessToken }) => ({
      token: accessToken,
      at: Date.now(),
    }));
    return (await cached).token;
  };
}

/** Access token do produtor seed (o dono dos dados de demonstração). Cacheado por processo. */
export const organizerToken = cachedLogin(env.ORGANIZER_EMAIL, env.ORGANIZER_PASSWORD);

/** Access token do admin seed. Cacheado por processo. */
export const adminToken = cachedLogin(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
