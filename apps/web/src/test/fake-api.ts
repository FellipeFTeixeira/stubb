import {
  identityRoutes,
  maskCpf,
  type AdminOrganizerRequestView,
  type OrganizerRequestStatus,
  type UserRole,
} from '@stubb/contracts';
import { vi } from 'vitest';

export type FakeRequest = {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
};

export type FakeResponse = { status: number; body?: unknown };
export type FakeHandler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;

export type FakeCall = FakeRequest & { method: string; path: string };

type Route = { method: string; segments: string[]; handler: FakeHandler };

function matchPath(segments: string[], path: string): Record<string, string> | null {
  const actual = path.split('/').filter(Boolean);
  if (actual.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of segments.entries()) {
    const value = actual[index]!;
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(value);
    else if (segment !== value) return null;
  }
  return params;
}

function normalizeHeaders(init: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

// Servidor HTTP falso por cima de `fetch`: roteia por método + caminho (padrões com `:param`).
// Rota registrada depois vence a anterior; rota sem handler responde 404 no formato do read-service.
export function createFakeApi() {
  const routes: Route[] = [];
  const calls: FakeCall[] = [];
  const identityCalls: FakeCall[] = [];

  const fetchFake = async (input: string | URL | Request, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const query = Object.fromEntries(url.searchParams.entries());
    const headers = normalizeHeaders(init?.headers);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;

    let handler: FakeHandler | null = null;
    let params: Record<string, string> = {};
    for (const route of [...routes].reverse()) {
      if (route.method !== method) continue;
      const matched = matchPath(route.segments, url.pathname);
      if (matched) {
        handler = route.handler;
        params = matched;
        break;
      }
    }

    const request: FakeRequest = { params, query, body, headers };
    // As chamadas da Identity (ex.: o `GET /me` do cabeçalho) ficam à parte para não poluir as
    // asserções de `calls` das telas que não tratam de sessão.
    const call: FakeCall = { ...request, method, path: url.pathname };
    if (url.pathname.startsWith('/api/identity/')) identityCalls.push(call);
    else calls.push(call);

    const response: FakeResponse = handler
      ? await handler(request)
      : {
          status: 404,
          body: { statusCode: 404, message: 'Not found', minVersionReached: false },
        };
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  };

  return {
    calls,
    identityCalls,
    on(method: string, pathPattern: string, handler: FakeHandler) {
      routes.push({
        method: method.toUpperCase(),
        segments: pathPattern.split('/').filter(Boolean),
        handler,
      });
    },
    install() {
      vi.stubGlobal('fetch', vi.fn(fetchFake));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Identity falsa: usuários, pedidos de produtor e sessão (cookie de refresh) em memória.
// ---------------------------------------------------------------------------------------------

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// JWT sem assinatura válida: o web só lê as claims, então basta o formato `header.payload.sig`.
export function fakeAccessToken(user: { id: string; roles: UserRole[] }): string {
  const iat = 1_800_000_000;
  const payload = {
    sub: user.id,
    roles: user.roles,
    iss: 'stubb-identity',
    aud: 'stubb-api',
    iat,
    exp: iat + 900,
  };
  return `${base64Url('{"alg":"EdDSA"}')}.${base64Url(JSON.stringify(payload))}.fake`;
}

export type FakeUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  cpf: string;
  roles: UserRole[];
  verified: boolean;
};

export type FakeOrganizerRequest = {
  id: string;
  userId: string;
  organizationName: string;
  cnpj: string;
  reason: string;
  status: OrganizerRequestStatus;
  rejectionMessage: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type FakeApi = ReturnType<typeof createFakeApi>;

export function installFakeIdentity(api: FakeApi) {
  const users: FakeUser[] = [];
  const requests: FakeOrganizerRequest[] = [];
  let refreshUserId: string | null = null;
  let counter = 100;
  const nextId = () => `0190a0a0-0000-7000-8000-${String(++counter).padStart(12, '0')}`;

  const err = (status: number, code: string): FakeResponse => ({
    status,
    body: { statusCode: status, code, message: code },
  });
  const sessionBody = (user: FakeUser): FakeResponse => ({
    status: 200,
    body: { accessToken: fakeAccessToken(user), expiresIn: 900 },
  });
  const authUser = (headers: Record<string, string>): FakeUser | null => {
    const token = headers.authorization?.replace(/^Bearer /, '');
    const payload = token?.split('.')[1];
    if (payload === undefined) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub: string;
    };
    return users.find((u) => u.id === claims.sub) ?? null;
  };
  const toView = (r: FakeOrganizerRequest): AdminOrganizerRequestView => {
    const requester = users.find((u) => u.id === r.userId)!;
    return {
      id: r.id,
      organizationName: r.organizationName,
      cnpj: r.cnpj,
      reason: r.reason,
      status: r.status,
      rejectionMessage: r.rejectionMessage,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      requester: { id: requester.id, fullName: requester.fullName, email: requester.email },
    };
  };
  const ownView = (r: FakeOrganizerRequest) =>
    Object.fromEntries(Object.entries(toView(r)).filter(([key]) => key !== 'requester'));

  api.on('POST', identityRoutes.users(), ({ body }) => {
    const input = body as { fullName: string; email: string; password: string; cpf: string };
    const email = input.email.toLowerCase();
    if (users.some((u) => u.email === email)) return err(409, 'EMAIL_ALREADY_REGISTERED');
    const cpf = input.cpf.replace(/\D/g, '');
    if (users.some((u) => u.cpf === cpf)) return err(409, 'CPF_ALREADY_REGISTERED');
    const user: FakeUser = {
      id: nextId(),
      email,
      password: input.password,
      fullName: input.fullName,
      cpf,
      roles: ['customer'],
      verified: false,
    };
    users.push(user);
    return { status: 202, body: { id: user.id } };
  });

  // O token de verificação do fake é `verify-<id da conta>`.
  api.on('POST', identityRoutes.confirmEmail(), ({ body }) => {
    const token = (body as { token: string }).token;
    const user = users.find((u) => `verify-${u.id}` === token);
    if (user === undefined) return err(422, 'VERIFICATION_TOKEN_INVALID');
    user.verified = true;
    return { status: 202, body: { id: user.id } };
  });

  api.on('POST', identityRoutes.emailVerifications(), () => ({ status: 202, body: {} }));

  api.on('POST', identityRoutes.session(), ({ body }) => {
    const input = body as { email: string; password: string };
    const user = users.find(
      (u) => u.email === input.email.toLowerCase() && u.password === input.password,
    );
    if (user === undefined) return err(401, 'INVALID_CREDENTIALS');
    if (!user.verified) return err(403, 'EMAIL_NOT_VERIFIED');
    refreshUserId = user.id;
    return sessionBody(user);
  });

  api.on('POST', identityRoutes.sessionRefresh(), () => {
    const user = users.find((u) => u.id === refreshUserId);
    return user === undefined ? err(401, 'SESSION_INVALID') : sessionBody(user);
  });

  api.on('DELETE', identityRoutes.session(), () => {
    refreshUserId = null;
    return { status: 204 };
  });

  api.on('GET', identityRoutes.me(), ({ headers }) => {
    const user = authUser(headers);
    if (user === null) return err(401, 'UNAUTHENTICATED');
    return {
      status: 200,
      body: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        cpf: maskCpf(user.cpf),
        roles: user.roles,
      },
    };
  });

  api.on('GET', identityRoutes.myOrganizerRequests(), ({ headers }) => {
    const user = authUser(headers);
    if (user === null) return err(401, 'UNAUTHENTICATED');
    const items = requests.filter((r) => r.userId === user.id).map(ownView);
    return { status: 200, body: { items } };
  });

  api.on('POST', identityRoutes.organizerRequests(), ({ headers, body }) => {
    const user = authUser(headers);
    if (user === null) return err(401, 'UNAUTHENTICATED');
    if (user.roles.includes('organizer')) return err(409, 'ALREADY_ORGANIZER');
    if (requests.some((r) => r.userId === user.id && r.status === 'pending')) {
      return err(409, 'ORGANIZER_REQUEST_PENDING');
    }
    const input = body as { organizationName: string; cnpj: string; reason: string };
    const request: FakeOrganizerRequest = {
      id: nextId(),
      userId: user.id,
      organizationName: input.organizationName,
      cnpj: input.cnpj,
      reason: input.reason,
      status: 'pending',
      rejectionMessage: null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    requests.push(request);
    return { status: 202, body: { id: request.id } };
  });

  api.on('GET', identityRoutes.adminOrganizerRequests(), ({ headers, query }) => {
    const user = authUser(headers);
    if (user === null) return err(401, 'UNAUTHENTICATED');
    if (!user.roles.includes('admin')) return err(403, 'FORBIDDEN');
    const status = query.status ?? 'pending';
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const matching = requests.filter((r) => r.status === status);
    const items = matching.slice((page - 1) * pageSize, page * pageSize).map(toView);
    return { status: 200, body: { items, page, pageSize, total: matching.length } };
  });

  const decide = (
    headers: Record<string, string>,
    id: string | undefined,
    next: 'approved' | 'rejected',
    message?: string,
  ): FakeResponse => {
    const user = authUser(headers);
    if (user === null) return err(401, 'UNAUTHENTICATED');
    if (!user.roles.includes('admin')) return err(403, 'FORBIDDEN');
    const request = requests.find((r) => r.id === id);
    if (request === undefined) return err(404, 'ORGANIZER_REQUEST_NOT_FOUND');
    if (request.status !== 'pending') return err(409, 'ORGANIZER_REQUEST_NOT_PENDING');
    request.status = next;
    request.decidedAt = new Date().toISOString();
    request.rejectionMessage = message ?? null;
    if (next === 'approved') {
      const owner = users.find((u) => u.id === request.userId)!;
      if (!owner.roles.includes('organizer')) owner.roles.push('organizer');
    }
    return { status: 202, body: { id: request.id } };
  };
  api.on('POST', identityRoutes.approveOrganizerRequest(':requestId'), ({ headers, params }) =>
    decide(headers, params.requestId, 'approved'),
  );
  api.on('POST', identityRoutes.rejectOrganizerRequest(':requestId'), ({ headers, params, body }) =>
    decide(headers, params.requestId, 'rejected', (body as { message?: string }).message),
  );

  return {
    users,
    requests,
    seedUser(partial: Partial<FakeUser> = {}): FakeUser {
      const user: FakeUser = {
        id: nextId(),
        email: `user${counter}@exemplo.com`,
        password: 'senha-segura-1',
        fullName: 'Ana Souza',
        cpf: '12345678909',
        roles: ['customer'],
        verified: true,
        ...partial,
      };
      users.push(user);
      return user;
    },
    seedOrganizerRequest(
      userId: string,
      partial: Partial<FakeOrganizerRequest> = {},
    ): FakeOrganizerRequest {
      const request: FakeOrganizerRequest = {
        id: nextId(),
        userId,
        organizationName: 'Produtora Demo',
        cnpj: '11222333000181',
        reason: 'Quero vender ingressos',
        status: 'pending',
        rejectionMessage: null,
        createdAt: new Date().toISOString(),
        decidedAt: null,
        ...partial,
      };
      requests.push(request);
      return request;
    },
    // Simula o cookie de refresh já presente no navegador (sessão que sobrevive ao reload).
    startSessionFor(userId: string) {
      refreshUserId = userId;
    },
  };
}
