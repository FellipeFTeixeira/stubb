import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoutes } from '@/test/render';
import { appRoutes } from './router';

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
});
