import type { PublicEventView } from '@stubb/contracts';
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';
import { EventPage } from './event-page';

const ID = '0190a0a0-0000-7000-8000-000000000001';
const AS_OF = '2026-10-26T12:00:00.000Z';

type Session = PublicEventView['sessions'][number];

function session(n: number, overrides: Partial<Session> = {}): Session {
  return {
    id: `0190b0b0-0000-7000-8000-${String(n).padStart(12, '0')}`,
    startsAt: '2026-12-11T00:00:00.000Z',
    timeZone: 'America/Manaus',
    ended: false,
    venue: { name: 'Arena Norte', address: 'Rua A, 10', city: 'Manaus', state: 'AM' },
    sectors: [
      {
        id: `0190c0c0-0000-7000-8000-${String(n).padStart(12, '0')}`,
        name: 'Pista',
        kind: 'general_admission',
        sales: { status: 'open', batch: { name: '1º lote', priceCents: 12345 } },
      },
    ],
    ...overrides,
  };
}

function view(overrides: Partial<PublicEventView> = {}): PublicEventView {
  return {
    id: ID,
    version: 4,
    title: 'Show de Rock',
    description: 'Primeira linha\nSegunda linha',
    category: 'show',
    ageRating: 'L',
    imageUrl: null,
    ended: false,
    asOf: AS_OF,
    sessions: [session(1)],
    ...overrides,
  };
}

function renderEvent(event: PublicEventView | null) {
  const api = createFakeApi();
  api.on('GET', '/api/catalog/events/:eventId', () =>
    event === null
      ? { status: 404, body: { statusCode: 404, message: 'x', minVersionReached: false } }
      : { status: 200, body: { event, minVersionReached: true } },
  );
  api.install();
  renderRoutes([{ path: '/eventos/:eventId', element: <EventPage /> }], {
    initialEntries: [`/eventos/${ID}`],
  });
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EventPage', () => {
  it('mostra título, descrição com quebras, categoria, classificação e sessão no fuso dela', async () => {
    renderEvent(view({ ageRating: '16' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Show de Rock' })).toBeVisible();
    const description = screen.getByText(/Primeira linha/);
    expect(description).toHaveTextContent('Primeira linha Segunda linha');
    expect(description).toHaveClass('whitespace-pre-line');
    expect(screen.getByText('Shows')).toBeInTheDocument();
    expect(screen.getByText('16 anos')).toBeInTheDocument();

    const section = screen.getByRole('region', { name: 'Sessão de 10/12/2026 20:00' });
    expect(within(section).getByText(/Arena Norte · Rua A, 10 · Manaus\/AM/)).toBeInTheDocument();
    expect(within(section).getByText('Pista')).toBeInTheDocument();
    expect(within(section).getByText('(Pista)')).toBeInTheDocument();
    expect(within(section).getByText(/1º lote: R\$\s123,45/)).toBeInTheDocument();
    expect(screen.queryByText('Sessão encerrada')).not.toBeInTheDocument();
    expect(screen.queryByText('Evento encerrado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mostra "Livre" para classificação L e tipo "Assento marcado"', async () => {
    renderEvent(
      view({
        sessions: [
          session(1, {
            sectors: [
              {
                id: '0190c0c0-0000-7000-8000-000000000009',
                name: 'Plateia',
                kind: 'seated',
                sales: { status: 'open', batch: { name: 'Lote único', priceCents: 5000 } },
              },
            ],
          }),
        ],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Show de Rock' });
    expect(screen.getByText('Livre')).toBeInTheDocument();
    expect(screen.getByText('(Assento marcado)')).toBeInTheDocument();
  });

  it('setor com vendas futuras e encerradas', async () => {
    renderEvent(
      view({
        sessions: [
          session(1, {
            sectors: [
              {
                id: '0190c0c0-0000-7000-8000-000000000001',
                name: 'Camarote',
                kind: 'seated',
                sales: { status: 'upcoming', salesStartsAt: '2026-11-05T15:30:00.000Z' },
              },
              {
                id: '0190c0c0-0000-7000-8000-000000000002',
                name: 'Pista',
                kind: 'general_admission',
                sales: { status: 'ended' },
              },
            ],
          }),
        ],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Show de Rock' });
    // 15:30Z em Manaus (UTC-4) = 11:30
    expect(screen.getByText('Vendas a partir de 05/11 11:30')).toBeInTheDocument();
    expect(screen.getByText('Vendas encerradas')).toBeInTheDocument();
  });

  it('sessão encerrada não mostra lotes, e o evento encerrado é sinalizado', async () => {
    renderEvent(
      view({
        ended: true,
        sessions: [session(1, { ended: true, sectors: [] })],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Show de Rock' });
    const section = screen.getByRole('region', { name: 'Sessão de 10/12/2026 20:00' });
    expect(within(section).getByText('Sessão encerrada')).toBeInTheDocument();
    expect(within(section).queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Evento encerrado')).toBeInTheDocument();
  });

  it('lista várias sessões, cada uma no seu fuso', async () => {
    renderEvent(
      view({
        sessions: [
          session(1),
          session(2, {
            startsAt: '2026-12-12T01:00:00.000Z',
            timeZone: 'America/Sao_Paulo',
            venue: { name: 'Teatro Sul', address: 'Av. B, 5', city: 'Porto Alegre', state: 'RS' },
          }),
        ],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Show de Rock' });
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Sessão de 11/12/2026 22:00' })).toBeInTheDocument();
  });

  it('404 mostra "Evento não encontrado"', async () => {
    renderEvent(null);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Evento não encontrado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a vitrine' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('falha de servidor mostra alerta com h1', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events/:eventId', () => ({ status: 500, body: {} }));
    api.install();
    renderRoutes([{ path: '/eventos/:eventId', element: <EventPage /> }], {
      initialEntries: [`/eventos/${ID}`],
    });

    expect(await screen.findByText('Não foi possível carregar o evento.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
