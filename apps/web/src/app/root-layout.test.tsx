import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';
import { RootLayout } from './root-layout';

const routes = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <p>vitrine</p> },
      { path: 'conta', element: <p>conta</p> },
    ],
  },
];

function setup() {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  return { api, identity };
}

const nav = () => screen.getByRole('navigation', { name: 'Principal' });

afterEach(() => vi.unstubAllGlobals());

describe('RootLayout', () => {
  it('anônimo: Entrar e Criar conta; sem área do produtor, conta, admin ou Sair', () => {
    setup();
    renderRoutes(routes, { initialEntries: ['/'], session: null });
    expect(within(nav()).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
    expect(within(nav()).getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/cadastro',
    );
    expect(within(nav()).queryByRole('link', { name: 'Área do produtor' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Minha conta' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Diagnóstico' })).toBeInTheDocument();
  });

  it('customer: nome do getMe, Minha conta e Sair; sem produtor nem admin', async () => {
    const { identity } = setup();
    const user = identity.seedUser({ fullName: 'Ana Souza', roles: ['customer'] });
    renderRoutes(routes, { initialEntries: ['/'], session: { id: user.id, roles: ['customer'] } });
    expect(await within(nav()).findByText('Ana Souza')).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Minha conta' })).toHaveAttribute(
      'href',
      '/conta',
    );
    expect(within(nav()).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Área do produtor' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('admin: vê Administração; com organizer, vê Área do produtor', async () => {
    const { identity } = setup();
    const user = identity.seedUser({ roles: ['customer', 'organizer', 'admin'] });
    renderRoutes(routes, { initialEntries: ['/'], session: { id: user.id, roles: user.roles } });
    expect(await within(nav()).findByText(user.fullName)).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Administração' })).toHaveAttribute(
      'href',
      '/admin/produtores',
    );
    expect(within(nav()).getByRole('link', { name: 'Área do produtor' })).toHaveAttribute(
      'href',
      '/produtor/eventos',
    );
  });

  it('Sair chama o logout, volta para / e mostra o estado anônimo', async () => {
    const { api, identity } = setup();
    const user = identity.seedUser({ roles: ['customer'] });
    const { router } = renderRoutes(routes, {
      initialEntries: ['/conta'],
      session: { id: user.id, roles: ['customer'] },
    });
    await userEvent.click(within(nav()).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.identityCalls.some((c) => c.method === 'DELETE')).toBe(true);
    expect(await within(nav()).findByRole('link', { name: 'Entrar' })).toBeInTheDocument();
  });
});
