import { IDEMPOTENCY_KEY_HEADER } from '@stubb/contracts';
import { env } from './env.ts';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  elapsedMs: number;
  headers: Headers;
  /** Cada `Set-Cookie` da resposta, inteiro (nome, valor e atributos). */
  setCookies: string[];
}

interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  /** Gera `Authorization: Bearer <token>`. */
  token?: string;
  /** Valor do header `Cookie` (ex.: `stubb_refresh=...`). */
  cookie?: string;
}

export async function api<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey !== undefined)
    headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
  if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie !== undefined) headers.Cookie = options.cookie;
  const startedAt = performance.now();
  const response = await fetch(`${env.BASE_URL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const elapsedMs = performance.now() - startedAt;
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // corpo não JSON (ex.: HTML do web, 204 vazio): devolve o texto
  }
  return {
    status: response.status,
    body: body as T,
    elapsedMs,
    headers: response.headers,
    setCookies: response.headers.getSetCookie(),
  };
}

export async function fetchText(path: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${env.BASE_URL}${path}`);
  return { status: response.status, text: await response.text() };
}
