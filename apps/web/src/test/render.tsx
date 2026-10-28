import type { UserRole } from '@stubb/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { setAccessToken } from '@/api/auth-session';
import { SessionProvider } from '@/features/session/session-provider';
import { fakeAccessToken } from './fake-api';

export type TestSession = { id: string; roles: UserRole[] };

// Produtor semeado: os testes da área do produtor existentes continuam passando sem declarar sessão.
export const DEFAULT_TEST_SESSION: TestSession = {
  id: '0193a4f0-0000-7000-8000-000000000001',
  roles: ['customer', 'organizer'],
};

export type RenderOptions = { session?: TestSession | null };

export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
}

// Semeia o token do módulo `auth-session` (estado global) e dispensa o refresh inicial do provider.
// `null` deixa a sessão anônima.
function seedSession(session: TestSession | null) {
  setAccessToken(session === null ? null : fakeAccessToken(session));
}

export function wrapperFor(client: QueryClient, options: RenderOptions = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {options.session === undefined ? (
          children
        ) : (
          <SessionProvider skipInitialRefresh>{children}</SessionProvider>
        )}
      </QueryClientProvider>
    );
  };
}

export function renderWithClient(
  ui: ReactElement,
  client = createTestQueryClient(),
  options: RenderOptions = {},
) {
  const session = options.session === undefined ? DEFAULT_TEST_SESSION : options.session;
  seedSession(session);
  return render(ui, { wrapper: wrapperFor(client, { session }) });
}

export function renderRoutes(
  routes: RouteObject[],
  options: { initialEntries: string[]; client?: QueryClient } & RenderOptions,
) {
  const client = options.client ?? createTestQueryClient();
  const session = options.session === undefined ? DEFAULT_TEST_SESSION : options.session;
  seedSession(session);
  const router = createMemoryRouter(routes, { initialEntries: options.initialEntries });
  const result = render(<RouterProvider router={router} />, {
    wrapper: wrapperFor(client, { session }),
  });
  return { ...result, router, client };
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}
