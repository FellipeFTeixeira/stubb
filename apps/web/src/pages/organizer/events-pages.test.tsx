import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { ID, eventView } from '@/features/organizer/test-support';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

afterEach(() => vi.unstubAllGlobals());

function summary(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `0190a0a0-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
    title: `Evento ${n}`,
    category: 'show',
    status: 'draft',
    sessionsCount: 0,
    publishedSessionsCount: 0,
    createdAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('lista Meus eventos', () => {
  it('mostra título, categoria, selo e sessões; "Carregar mais" acrescenta a próxima página e some', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.on('GET', '/api/catalog/organizer/events', ({ query }) => {
      const page = Number(query.page ?? 1);
      return {
        status: 200,
        body:
          page === 1
            ? {
                items: [
                  summary(1, { status: 'published', sessionsCount: 2, publishedSessionsCount: 1 }),
                  summary(2),
                ],
                page: 1,
                pageSize: 2,
                total: 3,
              }
            : { items: [summary(3, { category: 'stand_up' })], page: 2, pageSize: 2, total: 3 },
      };
    });
    api.install();
    renderRoutes(appRoutes, { initialEntries: ['/produtor/eventos'] });

    expect(screen.getByRole('heading', { level: 1, name: 'Meus eventos' })).toBeInTheDocument();
    const first = await screen.findByRole('link', { name: 'Evento 1' });
    expect(first).toHaveAttribute('href', '/produtor/eventos/0190a0a0-0000-7000-8000-000000000101');
    expect(screen.getByText('Shows · 2 sessões (1 publicada)')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getAllByText('Rascunho')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Novo evento' })).toHaveAttribute(
      'href',
      '/produtor/eventos/novo',
    );

    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('link', { name: 'Evento 3' })).toBeInTheDocument();
    expect(screen.getByText('Stand-up · 0 sessões (0 publicadas)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    expect(api.calls.map((c) => c.query.page)).toEqual(['1', '2']);
  });

  it('sem eventos mostra a mensagem vazia', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/organizer/events', () => ({
      status: 200,
      body: { items: [], page: 1, pageSize: 12, total: 0 },
    }));
    api.install();
    renderRoutes(appRoutes, { initialEntries: ['/produtor/eventos'] });
    expect(await screen.findByText('Você ainda não criou nenhum evento.')).toBeInTheDocument();
  });
});

describe('novo evento', () => {
  it('cria, aguarda a projeção (atrasada) e abre a gestão', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    let reads = 0;
    api.on('POST', '/api/catalog/events', () => ({
      status: 202,
      body: { id: ID.event, version: 1 },
    }));
    api.on('GET', '/api/catalog/organizer/events/:eventId', () => {
      reads += 1;
      return reads <= 2
        ? {
            status: 404,
            body: { statusCode: 404, message: 'Not found', minVersionReached: false },
          }
        : {
            status: 200,
            body: { event: eventView({ version: 1 }), minVersionReached: true },
          };
    });
    api.on('GET', '/api/catalog/organizer/venues', () => ({ status: 200, body: { items: [] } }));
    api.install();
    const { router } = renderRoutes(appRoutes, { initialEntries: ['/produtor/eventos/novo'] });

    await user.type(screen.getByLabelText('Título'), '  Show de Teste ');
    await user.type(screen.getByLabelText('Descrição'), 'Uma descrição');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Shows');
    await user.selectOptions(screen.getByLabelText('Classificação indicativa'), 'Livre');
    await user.click(screen.getByRole('button', { name: 'Criar evento' }));

    expect(await screen.findByText('Aguardando projeção…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      title: 'Show de Teste',
      description: 'Uma descrição',
      category: 'show',
      ageRating: 'L',
      imageUrl: null,
    });

    await waitFor(
      () => expect(router.state.location.pathname).toBe(`/produtor/eventos/${ID.event}`),
      {
        timeout: 4000,
      },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Show de Teste' }),
    ).toBeInTheDocument();
  });

  it('formulário vazio: erros por campo com aria-invalid e foco no primeiro; URL http é recusada', async () => {
    const user = userEvent.setup();
    createFakeApi().install();
    renderRoutes(appRoutes, { initialEntries: ['/produtor/eventos/novo'] });

    expect(screen.getByRole('heading', { level: 1, name: 'Novo evento' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('URL da imagem (opcional)'), 'http://x.com/a.png');
    await user.click(screen.getByRole('button', { name: 'Criar evento' }));

    const title = screen.getByLabelText('Título');
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'));
    expect(title).toHaveFocus();
    expect(title).toHaveAccessibleDescription('Campo obrigatório');
    expect(screen.getByLabelText('Categoria')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escolha a classificação')).toBeInTheDocument();
    expect(screen.getByLabelText('URL da imagem (opcional)')).toHaveAccessibleDescription(
      'Use um endereço https://',
    );
  });

  it('400 do servidor com issues cai nos campos e o alerta do topo pede para conferir', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.on('POST', '/api/catalog/events', () => ({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        code: 'VALIDATION_FAILED',
        issues: [{ path: 'title', message: 'Título recusado pelo servidor' }],
      },
    }));
    api.install();
    renderRoutes(appRoutes, { initialEntries: ['/produtor/eventos/novo'] });

    await user.type(screen.getByLabelText('Título'), 'X');
    await user.type(screen.getByLabelText('Descrição'), 'Y');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Shows');
    await user.selectOptions(screen.getByLabelText('Classificação indicativa'), 'Livre');
    await user.click(screen.getByRole('button', { name: 'Criar evento' }));

    expect(await screen.findByText('Confira os campos destacados.')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveAccessibleDescription(
      'Título recusado pelo servidor',
    );
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
  });
});
