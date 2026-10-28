import type { UserRole } from '@stubb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { getAccessToken, getSessionUser, setAccessToken } from './auth-session';
import {
  ApiError,
  approveOrganizerRequest,
  confirmEmail,
  getMe,
  listAdminOrganizerRequests,
  listMyOrganizerRequests,
  login,
  logout,
  registerUser,
  rejectOrganizerRequest,
  requestOrganizerRole,
  resendVerification,
} from './identity';

const KEY = '0199c1a2-7b3e-7c4d-8a5f-aaaaaaaaaaaa';

function setup() {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  return { api, identity };
}

async function loginAs(identity: ReturnType<typeof setup>['identity'], roles: UserRole[]) {
  const user = identity.seedUser({ roles });
  await login({ email: user.email, password: user.password });
  return user;
}

beforeEach(() => setAccessToken(null));
afterEach(() => vi.unstubAllGlobals());

describe('api/identity', () => {
  it('registerUser envia o corpo e a Idempotency-Key e devolve { id }', async () => {
    const { api } = setup();
    const result = await registerUser(
      {
        fullName: 'Ana Souza',
        email: 'Ana@Exemplo.com',
        password: 'senha-segura-1',
        cpf: '123.456.789-09',
      },
      KEY,
    );
    expect(result.id).toMatch(/^0190a0a0/);
    const call = api.identityCalls[0]!;
    expect(call.path).toBe('/api/identity/users');
    expect(call.headers['idempotency-key']).toBe(KEY);
  });

  it('registerUser repassa 409 como ApiError com code', async () => {
    const { identity } = setup();
    identity.seedUser({ email: 'ana@exemplo.com' });
    const error: unknown = await registerUser(
      { fullName: 'Ana', email: 'ANA@exemplo.com', password: 'senha-segura-1', cpf: '98765432100' },
      KEY,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('confirmEmail e resendVerification respondem 202', async () => {
    const { identity } = setup();
    const user = identity.seedUser({ verified: false });
    await expect(resendVerification(user.email)).resolves.toBeUndefined();
    await expect(confirmEmail(`verify-${user.id}`)).resolves.toEqual({ id: user.id });
    expect(user.verified).toBe(true);
    await expect(confirmEmail('x')).rejects.toMatchObject({ code: 'VERIFICATION_TOKEN_INVALID' });
  });

  it('login grava o token e as claims; credenciais erradas viram ApiError 401 sem renovar', async () => {
    const { api, identity } = setup();
    const user = identity.seedUser({ roles: ['customer'] });
    await login({ email: user.email.toUpperCase(), password: user.password });
    expect(getAccessToken()).not.toBeNull();
    expect(getSessionUser()).toEqual({ id: user.id, roles: ['customer'] });

    setAccessToken(null);
    await expect(login({ email: user.email, password: 'errada' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(api.identityCalls.filter((c) => c.path.endsWith('/refresh'))).toHaveLength(0);
  });

  it('login de conta não verificada dá 403 EMAIL_NOT_VERIFIED', async () => {
    const { identity } = setup();
    const user = identity.seedUser({ verified: false });
    await expect(login({ email: user.email, password: user.password })).rejects.toMatchObject({
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('logout responde 204', async () => {
    const { api, identity } = setup();
    await loginAs(identity, ['customer']);
    await expect(logout()).resolves.toBeUndefined();
    expect(api.identityCalls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/api/identity/session',
    });
  });

  it('getMe devolve a conta com CPF mascarado', async () => {
    const { identity } = setup();
    const user = await loginAs(identity, ['customer']);
    expect(await getMe()).toMatchObject({ id: user.id, cpf: '***.456.789-**' });
  });

  it('getMe com token vencido renova a sessão e repete', async () => {
    const { api, identity } = setup();
    const user = identity.seedUser();
    identity.startSessionFor(user.id);
    expect((await getMe()).id).toBe(user.id);
    expect(api.identityCalls.map((c) => c.path)).toEqual([
      '/api/identity/me',
      '/api/identity/session/refresh',
      '/api/identity/me',
    ]);
  });

  it('requestOrganizerRole + listMyOrganizerRequests', async () => {
    const { identity } = setup();
    await loginAs(identity, ['customer']);
    const accepted = await requestOrganizerRole(
      { organizationName: 'Produtora X', cnpj: '11.222.333/0001-81', reason: 'Shows' },
      KEY,
    );
    const mine = await listMyOrganizerRequests();
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ id: accepted.id, status: 'pending' });
    await expect(
      requestOrganizerRole({ organizationName: 'Y', cnpj: '1', reason: 'z' }, KEY),
    ).rejects.toMatchObject({ code: 'ORGANIZER_REQUEST_PENDING' });
  });

  it('admin lista com paginação e filtro, aprova e recusa', async () => {
    const { api, identity } = setup();
    const a = identity.seedUser();
    const b = identity.seedUser({ cpf: '98765432100' });
    const pendingA = identity.seedOrganizerRequest(a.id);
    const pendingB = identity.seedOrganizerRequest(b.id);
    await loginAs(identity, ['customer', 'admin']);

    const list = await listAdminOrganizerRequests({ status: 'pending', page: 1, pageSize: 1 });
    expect(list).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(list.items[0]!.requester.id).toBe(a.id);
    expect(api.identityCalls.at(-1)!.query).toEqual({
      status: 'pending',
      page: '1',
      pageSize: '1',
    });

    await approveOrganizerRequest(pendingA.id, KEY);
    expect(a.roles).toContain('organizer');
    await rejectOrganizerRequest(pendingB.id, 'CNPJ não confere', KEY);
    expect(pendingB).toMatchObject({ status: 'rejected', rejectionMessage: 'CNPJ não confere' });
    expect((await listAdminOrganizerRequests({ status: 'rejected' })).items).toHaveLength(1);
    await expect(approveOrganizerRequest(pendingA.id, KEY)).rejects.toMatchObject({
      code: 'ORGANIZER_REQUEST_NOT_PENDING',
    });
  });

  it('lista do admin sem papel admin dá 403', async () => {
    const { identity } = setup();
    await loginAs(identity, ['customer']);
    await expect(listAdminOrganizerRequests()).rejects.toMatchObject({ status: 403 });
  });
});
