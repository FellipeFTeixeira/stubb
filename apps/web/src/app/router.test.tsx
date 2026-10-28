import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';
import { appRoutes } from './router';

afterEach(() => vi.unstubAllGlobals());

describe('router', () => {
  it('/ mostra a vitrine dentro do layout com os links principais', () => {
    renderRoutes(appRoutes, { initialEntries: ['/'] });
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Stubb' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Área do produtor' })).toHaveAttribute(
      'href',
      '/produtor/eventos',
    );
    expect(within(nav).getByRole('link', { name: 'Diagnóstico' })).toHaveAttribute(
      'href',
      '/diagnostico',
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('/diagnostico mostra o diagnóstico', () => {
    renderRoutes(appRoutes, { initialEntries: ['/diagnostico'] });
    expect(screen.getByRole('heading', { name: 'Diagnóstico do Stubb' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('/produtor/* usa o layout do produtor com a navegação', () => {
    renderRoutes(appRoutes, { initialEntries: ['/produtor/locais'] });
    expect(screen.getByRole('heading', { name: 'Locais' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Área do produtor' });
    expect(within(nav).getByRole('link', { name: 'Meus eventos' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Locais' })).toBeInTheDocument();
  });

  it.each([
    ['/eventos/abc', 'Evento'],
    ['/produtor/eventos', 'Meus eventos'],
    ['/produtor/eventos/novo', 'Novo evento'],
    ['/produtor/eventos/abc', 'Gerenciar evento'],
    ['/produtor/locais/novo', 'Novo local'],
    ['/produtor/locais/abc', 'Local'],
  ])('%s resolve para um stub', (path, title) => {
    renderRoutes(appRoutes, { initialEntries: [path] });
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('rota desconhecida mostra Página não encontrada com link para a vitrine', () => {
    renderRoutes(appRoutes, { initialEntries: ['/nao-existe'] });
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a vitrine' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  describe('rotas da Identity e guards', () => {
    function stubIdentity() {
      const api = createFakeApi();
      const identity = installFakeIdentity(api);
      api.install();
      return { api, identity };
    }
    // As contas existem no fake: o GET /me e as listas precisam de um usuário real.
    const seedCustomer = (identity: ReturnType<typeof stubIdentity>['identity']) => {
      const user = identity.seedUser({ roles: ['customer'] });
      return { id: user.id, roles: user.roles };
    };
    const seedAdmin = (identity: ReturnType<typeof stubIdentity>['identity']) => {
      const user = identity.seedUser({ roles: ['customer', 'organizer', 'admin'] });
      return { id: user.id, roles: user.roles };
    };

    it.each([
      ['/entrar', 'Entrar'],
      ['/cadastro', 'Criar conta'],
      ['/verificar-email', 'Link inválido ou vencido'],
    ])('%s é pública (sessão nula)', (path, title) => {
      stubIdentity();
      renderRoutes(appRoutes, { initialEntries: [path], session: null });
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getAllByRole('main')).toHaveLength(1);
    });

    it.each(['/conta', '/admin/produtores', '/produtor/eventos'])(
      'sem sessão, %s redireciona para /entrar com o destino em redirect',
      (path) => {
        stubIdentity();
        const { router } = renderRoutes(appRoutes, { initialEntries: [path], session: null });
        expect(router.state.location.pathname).toBe('/entrar');
        expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe(path);
        expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
      },
    );

    it('customer abre /conta', async () => {
      const { identity } = stubIdentity();
      renderRoutes(appRoutes, { initialEntries: ['/conta'], session: seedCustomer(identity) });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Minha conta' }),
      ).toBeInTheDocument();
    });

    it.each(['/produtor/eventos', '/admin/produtores'])(
      'customer em %s vê Acesso negado e nenhuma API restrita é chamada',
      (path) => {
        const { api, identity } = stubIdentity();
        renderRoutes(appRoutes, { initialEntries: [path], session: seedCustomer(identity) });
        expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
        expect(api.calls.filter((c) => c.path.startsWith('/api/catalog/organizer'))).toHaveLength(
          0,
        );
        expect(
          api.identityCalls.filter((c) => c.path.includes('/admin/organizer-requests')),
        ).toHaveLength(0);
      },
    );

    it('admin abre /admin/produtores', async () => {
      const { identity } = stubIdentity();
      renderRoutes(appRoutes, {
        initialEntries: ['/admin/produtores'],
        session: seedAdmin(identity),
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Pedidos de produtor' }),
      ).toBeInTheDocument();
    });
  });
});
