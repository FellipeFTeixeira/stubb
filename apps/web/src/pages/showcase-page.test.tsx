import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventCard, ListEventsResponse } from '@stubb/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';
import { ShowcasePage } from './showcase-page';

const AS_OF = '2026-10-26T12:00:00.000Z';

function card(n: number, overrides: Partial<EventCard> = {}): EventCard {
  return {
    id: `0190a0a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
    title: `Evento ${n}`,
    category: 'show',
    imageUrl: null,
    nextSession: {
      id: `0190b0b0-0000-7000-8000-${String(n).padStart(12, '0')}`,
      startsAt: '2026-12-11T00:00:00.000Z',
      timeZone: 'America/Manaus',
      venue: { name: 'Arena Norte', city: 'Manaus', state: 'AM' },
    },
    otherUpcomingSessionsCount: 0,
    price: { kind: 'from', priceCents: 8000 },
    ...overrides,
  };
}

function page(items: EventCard[], pageNumber: number, total: number): ListEventsResponse {
  return { items, page: pageNumber, pageSize: 12, total, asOf: AS_OF };
}

function renderShowcase(initial = '/') {
  return renderRoutes([{ path: '/', element: <ShowcasePage /> }], { initialEntries: [initial] });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShowcasePage', () => {
  it('mostra o card completo com local, data no fuso da sessão, +N datas e preço', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({
      status: 200,
      body: page([card(1, { otherUpcomingSessionsCount: 2 })], 1, 1),
    }));
    api.install();
    renderShowcase();

    const article = await screen.findByRole('article');
    expect(screen.getByRole('heading', { level: 1, name: 'Eventos' })).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'Evento 1' })).toHaveAttribute(
      'href',
      '/eventos/0190a0a0-0000-7000-8000-000000000001',
    );
    expect(within(article).getByText('Shows')).toBeInTheDocument();
    expect(within(article).getByText(/Arena Norte · Manaus\/AM/)).toBeInTheDocument();
    expect(within(article).getByText(/10\/12\/2026 20:00/)).toBeInTheDocument();
    expect(within(article).getByText('+2 datas')).toBeInTheDocument();
    expect(within(article).getByText(/A partir de R\$\s80,00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('usa o placeholder da categoria sem imagem e quando a imagem falha', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({
      status: 200,
      body: page(
        [
          card(1, { category: 'stand_up' }),
          card(2, { imageUrl: 'https://img.example/quebrada.png' }),
        ],
        1,
        2,
      ),
    }));
    api.install();
    renderShowcase();

    const images = await screen.findAllByRole('img');
    expect(images[0]).toHaveAttribute('src', '/placeholders/stand_up.svg');
    expect(images[0]).toHaveAttribute('alt', 'Evento 1');
    expect(images[1]).toHaveAttribute('src', 'https://img.example/quebrada.png');

    images[1]!.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(screen.getAllByRole('img')[1]).toHaveAttribute('src', '/placeholders/show.svg'),
    );
  });

  it('formata os três tipos de preço', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({
      status: 200,
      body: page(
        [
          card(1, { price: { kind: 'sales_start', salesStartsAt: '2026-11-05T15:00:00.000Z' } }),
          card(2, { price: { kind: 'sales_ended' } }),
        ],
        1,
        2,
      ),
    }));
    api.install();
    renderShowcase();

    const [first, second] = await screen.findAllByRole('article');
    expect(within(first!).getByText('Vendas a partir de 05/11')).toBeInTheDocument();
    expect(within(second!).getByText('Vendas encerradas')).toBeInTheDocument();
  });

  it('envia os filtros para a URL e para a requisição', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({ status: 200, body: page([card(1)], 1, 1) }));
    api.install();
    const { router } = renderShowcase();
    const user = userEvent.setup();
    await screen.findByRole('article');

    await user.type(screen.getByLabelText('Buscar por título'), 'rock');
    await user.type(screen.getByLabelText('Cidade'), 'Manaus');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'festival');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(router.state.location.search).toContain('busca=rock'));
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get('cidade')).toBe('Manaus');
    expect(search.get('categoria')).toBe('festival');
    await waitFor(() => {
      const last = api.calls[api.calls.length - 1]!;
      expect(last.query).toMatchObject({
        q: 'rock',
        city: 'Manaus',
        category: 'festival',
        page: '1',
      });
    });
  });

  it('lê os filtros da URL ao abrir', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({ status: 200, body: page([], 1, 0) }));
    api.install();
    renderShowcase('/?busca=jazz&cidade=Recife&categoria=show');

    await screen.findByText('Nenhum evento encontrado.');
    expect(screen.getByLabelText('Buscar por título')).toHaveValue('jazz');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Recife');
    expect(screen.getByLabelText('Categoria')).toHaveValue('show');
    expect(api.calls[0]?.query).toMatchObject({ q: 'jazz', city: 'Recife', category: 'show' });
  });

  it('ignora categoria inválida na URL', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({ status: 200, body: page([], 1, 0) }));
    api.install();
    renderShowcase('/?categoria=inexistente');

    await screen.findByText('Nenhum evento encontrado.');
    expect(api.calls[0]?.query).not.toHaveProperty('category');
  });

  it('"Carregar mais" acrescenta a próxima página e some quando acabou', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', ({ query }) =>
      query.page === '2'
        ? { status: 200, body: page([card(2)], 2, 2) }
        : { status: 200, body: page([card(1)], 1, 2) },
    );
    api.install();
    renderShowcase();
    const user = userEvent.setup();

    await screen.findByRole('link', { name: 'Evento 1' });
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await screen.findByRole('link', { name: 'Evento 2' });
    expect(screen.getByRole('link', { name: 'Evento 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    expect(api.calls.map((c) => c.query.page)).toEqual(['1', '2']);
  });

  it('sem resultados mostra "Nenhum evento encontrado."', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({ status: 200, body: page([], 1, 0) }));
    api.install();
    renderShowcase();

    expect(await screen.findByText('Nenhum evento encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('mostra erro quando a API falha', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({ status: 500, body: { statusCode: 500 } }));
    api.install();
    renderShowcase();

    expect(await screen.findByText(/Não foi possível carregar os eventos/)).toBeInTheDocument();
  });
});
