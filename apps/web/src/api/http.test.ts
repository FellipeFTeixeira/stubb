import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAccessToken } from '@/test/fake-api';
import { getAccessToken, setAccessToken } from './auth-session';
import { ApiError, getJson, sendCommand, sendJson, withQuery } from './http';

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

const TOKEN_A = fakeAccessToken({
  id: '0193a4f0-0000-7000-8000-000000000001',
  roles: ['customer'],
});
const TOKEN_B = fakeAccessToken({
  id: '0193a4f0-0000-7000-8000-000000000001',
  roles: ['customer', 'organizer'],
});

function authHeaderOf(init: RequestInit) {
  return (init.headers as Record<string, string>).Authorization;
}

describe('Bearer e renovação em 401', () => {
  beforeEach(() => setAccessToken(null));
  afterAll(() => setAccessToken(null));

  it('anexa Authorization quando há token (sendCommand, getJson e sendJson)', async () => {
    setAccessToken(TOKEN_A);
    const fn = mockFetch(202, { id: 'a', version: 1 });
    await sendCommand('POST', '/x', KEY, {}, accepted);
    await sendJson('POST', '/y', {}, accepted, { expectedStatus: 202 });
    expect(authHeaderOf(callOf(fn)[1])).toBe(`Bearer ${TOKEN_A}`);
    const second = fn.mock.calls[1] as unknown as [string, RequestInit];
    expect(authHeaderOf(second[1])).toBe(`Bearer ${TOKEN_A}`);
    const get = mockFetch(200, { id: 'a', version: 1 });
    await getJson('/z', accepted);
    expect(authHeaderOf(callOf(get)[1])).toBe(`Bearer ${TOKEN_A}`);
  });

  it('sem token não envia Authorization', async () => {
    const fn = mockFetch(200, { id: 'a', version: 1 });
    await getJson('/z', accepted);
    expect(authHeaderOf(callOf(fn)[1])).toBeUndefined();
  });

  function sequence(responses: Array<() => Response>) {
    const fn = vi.fn((input: string) => {
      if (input === '/api/identity/session/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: TOKEN_B, expiresIn: 900 }), { status: 200 }),
        );
      }
      return Promise.resolve(responses.shift()!());
    });
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('401 -> refresh único -> repete a requisição com o token novo (mesma Idempotency-Key)', async () => {
    setAccessToken(TOKEN_A);
    const fn = sequence([
      () => new Response('{}', { status: 401 }),
      () => new Response(JSON.stringify({ id: 'a', version: 2 }), { status: 202 }),
    ]);
    const result = await sendCommand('POST', '/x', KEY, {}, accepted);
    expect(result).toEqual({ id: 'a', version: 2 });
    const urls = fn.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(['/x', '/api/identity/session/refresh', '/x']);
    const retry = fn.mock.calls[2] as unknown as [string, RequestInit];
    expect(authHeaderOf(retry[1])).toBe(`Bearer ${TOKEN_B}`);
    expect((retry[1].headers as Record<string, string>)['Idempotency-Key']).toBe(KEY);
  });

  it('refresh que falha devolve o ApiError 401 original', async () => {
    setAccessToken(TOKEN_A);
    const fn = vi.fn((input: string) =>
      Promise.resolve(
        input === '/api/identity/session/refresh'
          ? new Response('{"code":"SESSION_INVALID"}', { status: 401 })
          : new Response('{"code":"UNAUTHENTICATED"}', { status: 401 }),
      ),
    );
    vi.stubGlobal('fetch', fn);
    const error: unknown = await getJson('/x', accepted).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).code).toBe('UNAUTHENTICATED');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
  });

  it('refreshOn401: false não tenta renovar', async () => {
    const fn = mockFetch(401, { code: 'INVALID_CREDENTIALS' });
    await expect(
      sendJson('POST', '/login', {}, accepted, { expectedStatus: 200, refreshOn401: false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('sendJson', () => {
  it('valida o status esperado e o schema; envia Idempotency-Key só se informada', async () => {
    const fn = mockFetch(200, { id: 'a', version: 1 });
    expect(await sendJson('GET', '/me', undefined, accepted, { expectedStatus: 200 })).toEqual({
      id: 'a',
      version: 1,
    });
    expect(callOf(fn)[1].headers).toEqual({});
    const keyed = mockFetch(202, { id: 'a', version: 1 });
    await sendJson('POST', '/x', { a: 1 }, accepted, { expectedStatus: 202, idempotencyKey: KEY });
    expect(callOf(keyed)[1].headers).toEqual({
      'Idempotency-Key': KEY,
      'Content-Type': 'application/json',
    });
  });

  it('204 sem corpo passa com z.null(); status diferente do esperado vira ApiError', async () => {
    mockFetch(204, undefined);
    expect(await sendJson('DELETE', '/s', undefined, z.null(), { expectedStatus: 204 })).toBeNull();
    mockFetch(409, { code: 'ALREADY_ORGANIZER' });
    const error: unknown = await sendJson('POST', '/x', {}, accepted, {
      expectedStatus: 202,
    }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('ALREADY_ORGANIZER');
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
