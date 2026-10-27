import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';

export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

export function renderWithClient(ui: ReactElement, client = createTestQueryClient()) {
  return render(ui, { wrapper: wrapperFor(client) });
}

export function renderRoutes(
  routes: RouteObject[],
  options: { initialEntries: string[]; client?: QueryClient },
) {
  const client = options.client ?? createTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: options.initialEntries });
  const result = render(<RouterProvider router={router} />, { wrapper: wrapperFor(client) });
  return { ...result, router, client };
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}
