import { IDEMPOTENCY_KEY_HEADER } from '@stubb/contracts';
import type { ZodType } from 'zod';
import { getAccessToken, refreshSession } from './auth-session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    if (typeof this.body !== 'object' || this.body === null) return undefined;
    const code = (this.body as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// Envia com o Bearer atual. Em 401, tenta renovar a sessão uma vez (refresh único em voo) e repete
// a requisição; se o refresh falhar, devolve o 401 original. `refreshOn401: false` é para as rotas
// da própria sessão (login, logout), onde um 401 é resposta de negócio, não token vencido.
async function authedFetch(
  url: string,
  init: RequestInit & { headers: Record<string, string> },
  refreshOn401 = true,
): Promise<Response> {
  const send = () => {
    const token = getAccessToken();
    return fetch(url, {
      ...init,
      headers:
        token === null ? init.headers : { ...init.headers, Authorization: `Bearer ${token}` },
    });
  };
  const response = await send();
  if (response.status === 401 && refreshOn401 && (await refreshSession())) return send();
  return response;
}

function jsonRequest(
  method: string,
  headers: Record<string, string>,
  body: unknown,
): RequestInit & { headers: Record<string, string> } {
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
}

export async function sendCommand<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  idempotencyKey: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const response = await authedFetch(
    url,
    jsonRequest(method, { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }, body),
  );
  const json = await readBody(response);
  if (response.status !== 202) throw new ApiError(response.status, json);
  return schema.parse(json);
}

export type SendJsonOptions = {
  idempotencyKey?: string;
  expectedStatus: number;
  refreshOn401?: boolean;
};

// Para as respostas da Identity (200, 202, 204), que não seguem o 202 fixo de `sendCommand`.
// Em 204 não há corpo: o `schema` recebe `null` (use `z.null()`).
export async function sendJson<T>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body: unknown,
  schema: ZodType<T>,
  options: SendJsonOptions,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.idempotencyKey !== undefined) {
    headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
  }
  const response = await authedFetch(
    url,
    jsonRequest(method, headers, body),
    options.refreshOn401 ?? true,
  );
  const json = await readBody(response);
  if (response.status !== options.expectedStatus) throw new ApiError(response.status, json);
  return schema.parse(json);
}

export type JsonResult<T> =
  { status: 'found'; data: T } | { status: 'not-found'; minVersionReached: boolean };

export async function getJson<T>(url: string, schema: ZodType<T>): Promise<JsonResult<T>> {
  const response = await authedFetch(url, { headers: {} });
  const json = await readBody(response);
  if (response.status === 200) return { status: 'found', data: schema.parse(json) };
  if (response.status === 404) {
    const reached =
      typeof json === 'object' && json !== null
        ? (json as { minVersionReached?: unknown }).minVersionReached
        : undefined;
    return { status: 'not-found', minVersionReached: reached === true };
  }
  throw new ApiError(response.status, json);
}

export function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}
