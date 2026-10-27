import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, getJson, sendCommand, withQuery } from './http';

const KEY = '0199c1a2-7b3e-7c4d-8a5f-aaaaaaaaaaaa';
const accepted = z.object({ id: z.string(), version: z.number() });

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(() =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const callOf = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe('sendCommand', () => {
  it.each(['POST', 'PATCH'] as const)(
    '%s envia header, Content-Type e corpo JSON',
    async (method) => {
      const fn = mockFetch(202, { id: 'a', version: 2 });
      const result = await sendCommand(method, '/api/x', KEY, { a: 1 }, accepted);
      expect(result).toEqual({ id: 'a', version: 2 });
      const [url, init] = callOf(fn);
      expect(url).toBe('/api/x');
      expect(init.method).toBe(method);
      expect(init.headers).toEqual({ 'Idempotency-Key': KEY, 'Content-Type': 'application/json' });
      expect(init.body).toBe('{"a":1}');
    },
  );

  it('DELETE com corpo undefined não envia corpo nem Content-Type', async () => {
    const fn = mockFetch(202, { id: 'a', version: 3 });
    await sendCommand('DELETE', '/api/x/1', KEY, undefined, accepted);
    const [, init] = callOf(fn);
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ 'Idempotency-Key': KEY });
    expect(init.body).toBeUndefined();
  });

  it('exige 202: outro status vira ApiError com status, corpo e code', async () => {
    mockFetch(422, { statusCode: 422, code: 'BATCH_NAME_TAKEN' });
    const error: unknown = await sendCommand('POST', '/x', KEY, {}, accepted).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).code).toBe('BATCH_NAME_TAKEN');
  });

  it('200 também é rejeitado e corpo ilegível dá code indefinido', async () => {
    mockFetch(200, undefined);
    const error: unknown = await sendCommand('POST', '/x', KEY, {}, accepted).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBeUndefined();
  });
});

describe('getJson', () => {
  it('200 valida com o schema', async () => {
    mockFetch(200, { id: 'a', version: 1 });
    expect(await getJson('/x', accepted)).toEqual({
      status: 'found',
      data: { id: 'a', version: 1 },
    });
  });

  it('404 devolve not-found com minVersionReached do corpo (falso se ausente)', async () => {
    mockFetch(404, { statusCode: 404, message: 'x', minVersionReached: true });
    expect(await getJson('/x', accepted)).toEqual({ status: 'not-found', minVersionReached: true });
    mockFetch(404, { statusCode: 404 });
    expect(await getJson('/x', accepted)).toEqual({
      status: 'not-found',
      minVersionReached: false,
    });
  });

  it('outros status viram ApiError', async () => {
    mockFetch(500, {});
    await expect(getJson('/x', accepted)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('withQuery', () => {
  it('ignora undefined e codifica valores', () => {
    expect(withQuery('/a', { q: 'são paulo', page: 2, city: undefined })).toBe(
      '/a?q=s%C3%A3o+paulo&page=2',
    );
    expect(withQuery('/a', { q: undefined })).toBe('/a');
  });
});
