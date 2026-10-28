import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoutes } from '@/test/render';
import { RequireAuth, RequireRole, safeRedirect } from './route-guards';

function LoginProbe() {
  return <p>tela de login</p>;
}

const routes = [
  { path: '/entrar', element: <LoginProbe /> },
  {
    path: '/conta',
    element: (
      <RequireAuth>
        <p>minha conta</p>
      </RequireAuth>
    ),
  },
  {
    path: '/admin/produtores',
    element: (
      <RequireRole role="admin">
        <p>painel admin</p>
      </RequireRole>
    ),
  },
  { path: '/', element: <p>vitrine</p> },
];

describe('RequireAuth', () => {
  it('anônimo é redirecionado para /entrar com o destino em redirect (path + search)', () => {
    const { router } = renderRoutes(routes, {
      initialEntries: ['/conta?aba=pedidos'],
      session: null,
    });
    expect(screen.getByText('tela de login')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe(
      '/conta?aba=pedidos',
    );
  });

  it('autenticado vê o conteúdo', () => {
    renderRoutes(routes, { initialEntries: ['/conta'] });
    expect(screen.getByText('minha conta')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('sem o papel mostra Acesso negado com link para a vitrine', () => {
    renderRoutes(routes, { initialEntries: ['/admin/produtores'] });
    expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a vitrine' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByText('painel admin')).not.toBeInTheDocument();
  });

  it('com o papel mostra o conteúdo', () => {
    renderRoutes(routes, {
      initialEntries: ['/admin/produtores'],
      session: { id: '0193a4f0-0000-7000-8000-000000000009', roles: ['customer', 'admin'] },
    });
    expect(screen.getByText('painel admin')).toBeInTheDocument();
  });

  it('anônimo é redirecionado antes de checar o papel', () => {
    const { router } = renderRoutes(routes, {
      initialEntries: ['/admin/produtores'],
      session: null,
    });
    expect(router.state.location.pathname).toBe('/entrar');
  });
});

describe('safeRedirect', () => {
  it.each([
    ['/conta', '/conta'],
    ['/produtor/eventos?x=1', '/produtor/eventos?x=1'],
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['http://evil.com/x', '/'],
    ['/\\evil.com', '/'],
    ['conta', '/'],
    ['', '/'],
    [null, '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
