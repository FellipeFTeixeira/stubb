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
    calls.push({ ...request, method, path: url.pathname });

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
