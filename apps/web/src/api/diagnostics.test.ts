import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createPing, getPing, incrementPing } from './diagnostics';

const ID = '0199c1a2-7b3e-7c4d-8a5f-123456789abc';
const KEY = '0199c1a2-7b3e-7c4d-8a5f-aaaaaaaaaaaa';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api/diagnostics', () => {
  it('createPing envia POST com header de idempotência e corpo', async () => {
    const fetchMock = mockFetch(202, { id: ID, version: 1 });
    const result = await createPing({ label: 'abc', idempotencyKey: KEY });
    expect(result).toEqual({ id: ID, version: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/diagnostics/pings');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': KEY,
    });
    expect(JSON.parse(init.body as string)).toEqual({ label: 'abc' });
  });

  it('incrementPing usa a rota do ping', async () => {
    const fetchMock = mockFetch(202, { id: ID, version: 2 });
    await incrementPing({ id: ID, idempotencyKey: KEY });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      `/api/diagnostics/pings/${ID}/increment`,
    );
  });

  it('409 vira ApiError com o status', async () => {
    mockFetch(409, { statusCode: 409 });
    const error: unknown = await createPing({ label: 'a', idempotencyKey: KEY }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });

  it('getPing inclui min_version só quando informado', async () => {
    const view = {
      ping: {
        id: ID,
        label: 'a',
        count: 0,
        version: 1,
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
      },
      minVersionReached: true,
    };
    const fetchMock = mockFetch(200, view);
    const found = await getPing({ id: ID, minVersion: 1 });
    expect(found).toEqual({ status: 'found', ...view });
    await getPing({ id: ID });
    const urls = fetchMock.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls).toEqual([
      `/api/diagnostics/pings/${ID}?min_version=1`,
      `/api/diagnostics/pings/${ID}`,
    ]);
  });

  it('getPing 404 vira not-found e 500 vira ApiError', async () => {
    mockFetch(404, { statusCode: 404, message: 'x', minVersionReached: false });
    expect(await getPing({ id: ID })).toEqual({ status: 'not-found' });
    mockFetch(500, {});
    await expect(getPing({ id: ID })).rejects.toBeInstanceOf(ApiError);
  });
});
