import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from './fake-api';

afterEach(() => vi.unstubAllGlobals());

describe('createFakeApi', () => {
  it('roteia por método e padrão com :param e registra as chamadas', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/things/:id', ({ params, query }) => ({
      status: 200,
      body: { id: params.id, q: query.q },
    }));
    api.on('POST', '/api/things', ({ body, headers }) => ({
      status: 202,
      body: { echoed: body, key: headers['idempotency-key'] },
    }));
    api.install();

    const get = await fetch('/api/things/abc%20d?q=1');
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ id: 'abc d', q: '1' });

    const post = await fetch('/api/things', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(post.status).toBe(202);
    expect(await post.json()).toEqual({ echoed: { a: 1 }, key: 'k1' });

    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/things/abc%20d',
      'POST /api/things',
    ]);
    expect(api.calls[1]!.body).toEqual({ a: 1 });
  });

  it('rota não registrada responde 404 padrão; método diferente não casa', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/x', () => ({ status: 200, body: {} }));
    api.install();
    const missing = await fetch('/api/nada');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      statusCode: 404,
      message: 'Not found',
      minVersionReached: false,
    });
    expect((await fetch('/api/x', { method: 'DELETE' })).status).toBe(404);
    expect(api.calls).toHaveLength(2);
  });

  it('handler registrado depois vence o anterior e pode ser assíncrono', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/x', () => ({ status: 200, body: 'old' }));
    api.on('GET', '/api/x', () => Promise.resolve({ status: 200, body: 'new' }));
    api.install();
    expect(await (await fetch('/api/x')).json()).toBe('new');
  });
});
