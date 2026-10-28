import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAccessToken } from '@/test/fake-api';
import {
  getAccessToken,
  getSessionUser,
  refreshSession,
  setAccessToken,
  subscribe,
} from './auth-session';

const USER = {
  id: '0193a4f0-0000-7000-8000-000000000001',
  roles: ['customer', 'organizer'] as const,
};

function mockFetch(handler: () => Promise<Response>) {
  const fn = vi.fn(handler);
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => setAccessToken(null));
afterEach(() => vi.unstubAllGlobals());

describe('token e usuário da sessão', () => {
  it('decodifica id e papéis do payload e guarda só em memória', () => {
    const token = fakeAccessToken({ id: USER.id, roles: [...USER.roles] });
    setAccessToken(token);
    expect(getAccessToken()).toBe(token);
    expect(getSessionUser()).toEqual({ id: USER.id, roles: ['customer', 'organizer'] });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('null limpa token e usuário; token ilegível não cria sessão', () => {
    setAccessToken(fakeAccessToken({ id: USER.id, roles: ['customer'] }));
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
    setAccessToken('lixo');
    expect(getAccessToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  it('mantém a mesma referência de usuário se id e papéis não mudam e notifica quem assina', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setAccessToken(fakeAccessToken({ id: USER.id, roles: ['customer'] }));
    const first = getSessionUser();
    setAccessToken(fakeAccessToken({ id: USER.id, roles: ['customer'] }));
    expect(getSessionUser()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setAccessToken(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('refreshSession', () => {
  it('duas chamadas simultâneas fazem um único fetch, com POST e cookie same-origin', async () => {
    const token = fakeAccessToken({ id: USER.id, roles: ['customer'] });
    const fn = mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ accessToken: token, expiresIn: 900 }))),
    );
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect([a, b]).toEqual([true, true]);
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/identity/session/refresh');
    expect(init).toEqual({ method: 'POST', credentials: 'same-origin' });
    expect(getAccessToken()).toBe(token);
  });

  it('depois de terminar, uma nova chamada faz um novo fetch', async () => {
    const fn = mockFetch(() => Promise.resolve(new Response('{}', { status: 401 })));
    await refreshSession();
    await refreshSession();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('401 limpa o token e devolve false', async () => {
    setAccessToken(fakeAccessToken({ id: USER.id, roles: ['customer'] }));
    mockFetch(() => Promise.resolve(new Response('{"code":"SESSION_INVALID"}', { status: 401 })));
    expect(await refreshSession()).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  it('falha de rede devolve false sem derrubar o token atual', async () => {
    const token = fakeAccessToken({ id: USER.id, roles: ['customer'] });
    setAccessToken(token);
    mockFetch(() => Promise.reject(new TypeError('network')));
    expect(await refreshSession()).toBe(false);
    expect(getAccessToken()).toBe(token);
  });
});
