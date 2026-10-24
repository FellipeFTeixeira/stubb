import { IDEMPOTENCY_KEY_HEADER } from '@stubb/contracts';
import { env } from './env.ts';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  elapsedMs: number;
}

interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
}

export async function api<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey !== undefined)
    headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
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
    // corpo não JSON (ex.: HTML do web): devolve o texto
  }
  return { status: response.status, body: body as T, elapsedMs };
}

export async function fetchText(path: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${env.BASE_URL}${path}`);
  return { status: response.status, text: await response.text() };
}
