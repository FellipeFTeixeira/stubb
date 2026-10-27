import { IDEMPOTENCY_KEY_HEADER } from '@stubb/contracts';
import type { ZodType } from 'zod';

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

export async function sendCommand<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  idempotencyKey: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const headers: Record<string, string> = { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await readBody(response);
  if (response.status !== 202) throw new ApiError(response.status, json);
  return schema.parse(json);
}

export type JsonResult<T> =
  { status: 'found'; data: T } | { status: 'not-found'; minVersionReached: boolean };

export async function getJson<T>(url: string, schema: ZodType<T>): Promise<JsonResult<T>> {
  const response = await fetch(url);
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
