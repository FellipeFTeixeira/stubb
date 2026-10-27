import type { OrganizerEventView } from '@stubb/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { ID, eventView, sessionView, venueView } from '@/features/organizer/test-support';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const NOT_FOUND = { statusCode: 404, message: 'Not found' };

function venueSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: ID.venue,
    name: 'Arena Manaus',
    city: 'Manaus',
    state: 'AM',
    timeZone: 'America/Manaus',
    sectorsCount: 1,
    version: 3,
    ...overrides,
  };
}

// Servidor falso do produtor. `event` é o estado do write; `projected` é o que o read model já
// mostra. Cada command registrado atualiza `event` e só projeta depois de `lag` leituras.
function setup(initial: OrganizerEventView, options: { lag?: number; venues?: unknown[] } = {}) {
  const api = createFakeApi();
  const state = {
    event: initial,
    projected: initial,
    readsSinceCommand: 0,
    lag: options.lag ?? 0,
    gone: false,
  };
  const venues = options.venues ?? [venueSummary()];

  const commit = (next: OrganizerEventView) => {
    state.event = next;
    state.readsSinceCommand = 0;
    if (state.lag === 0) state.projected = next;
  };

  api.on('GET', '/api/catalog/organizer/events/:eventId', ({ query }) => {
    const wanted = Number(query.min_version ?? 0);
    state.readsSinceCommand += 1;
    if (state.lag > 0 && state.readsSinceCommand > state.lag) state.projected = state.event;
    if (state.gone && state.projected === state.event) {
      return {
        status: 404,
        body: { ...NOT_FOUND, minVersionReached: state.projected.version >= wanted },
      };
    }
    return {
      status: 200,
      body: { event: state.projected, minVersionReached: state.projected.version >= wanted },
    };
  });
  api.on('GET', '/api/catalog/organizer/venues', () => ({ status: 200, body: { items: venues } }));
  api.on('GET', '/api/catalog/organizer/venues/:venueId', () => ({
    status: 200,
    body: {
      venue: venueView({
        sectors: [
          ...venueView().sectors,
          {
            id: ID.venueSector2,
            name: 'Camarote',
            kind: 'seated',
            capacity: 20,
            rows: [{ label: 'A', seats: 20 }],
          },
        ],
      }),
      minVersionReached: true,
    },
  }));
  api.on('GET', '/api/catalog/organizer/events', () => ({
    status: 200,
    body: { items: [], page: 1, pageSize: 12, total: 0 },
  }));
  api.install();
  return { api, state, commit };
}

function open(path = `/produtor/eventos/${ID.event}`) {
  return renderRoutes(appRoutes, { initialEntries: [path] });
}

function sessionRegion(startsAtLabel: string) {
  return screen.findByRole('region', { name: `Sessão de ${startsAtLabel}` });
}

describe('gestão do evento', () => {
  it('mostra o evento, as sessões e os selos de lote e de sessão', async () => {
    const session = sessionView({ status: 'published', salesOpen: true });
    session.sectors[0]!.batches = [
      {
        id: ID.batch,
        name: 'Lote 1',
        priceCents: 8000,
        quantity: 100,
        endsAt: '2026-11-20T04:00:00.000Z',
        badge: 'current',
      },
      {
        id: ID.entity,
        name: 'Lote 2',
        priceCents: 12000,
        quantity: null,
        endsAt: null,
        badge: 'upcoming',
      },
    ];
    setup(eventView({ status: 'published', sessions: [session] }));
    open();

    expect(await screen.findByRole('heading', { level: 1, name: 'Show de Teste' })).toBeVisible();
    const region = await sessionRegion('10/12/2026 20:00');
    expect(within(region).getByText('Publicada')).toBeInTheDocument();
    const sector = within(region).getByRole('region', { name: 'Pista' });
    expect(within(sector).getByText('Vigente')).toBeInTheDocument();
    expect(within(sector).getByText('Em breve')).toBeInTheDocument();
    expect(within(sector).getByText('R$ 80,00')).toBeInTheDocument();
    expect(within(sector).getByText('R$ 120,00')).toBeInTheDocument();
    expect(within(sector).getByText('até 20/11/2026 00:00')).toBeInTheDocument();
    // sessão publicada é congelada: nada de formulário nem de remoção
    expect(within(region).queryByRole('button', { name: 'Publicar sessão' })).toBeNull();
    expect(within(region).queryByRole('button', { name: 'Remover sessão' })).toBeNull();
    expect(within(region).queryByRole('button', { name: /^Remover lote/ })).toBeNull();
    expect(within(region).queryByLabelText('Nome do lote')).toBeNull();
    // evento publicado não pode ser descartado
    expect(screen.queryByRole('button', { name: 'Descartar evento' })).toBeNull();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
  });

  it('agendar converte a data digitada no fuso do local e envia o fuso no corpo', async () => {
    const user = userEvent.setup();
    const { api, commit, state } = setup(eventView());
    api.on('POST', '/api/catalog/events/:eventId/sessions', () => {
      commit(eventView({ version: 3, sessions: [sessionView()] }));
      return { status: 202, body: { id: ID.event, version: 3, entityId: ID.session } };
    });
    open();
    await screen.findByRole('heading', { level: 1, name: 'Show de Teste' });
    await screen.findByRole('option', { name: 'Arena Manaus — Manaus/AM' });

    await user.selectOptions(screen.getByLabelText('Local'), ID.venue);
    expect(screen.getByText('Horários no fuso America/Manaus.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Início da sessão'), {
      target: { value: '2026-12-10T20:00' },
    });
    fireEvent.change(screen.getByLabelText('Início das vendas'), {
      target: { value: '2026-11-01T10:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Agendar sessão' }));

    const region = await sessionRegion('10/12/2026 20:00');
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.path).toBe(`/api/catalog/events/${ID.event}/sessions`);
    expect(post?.body).toEqual({
      venueId: ID.venue,
      startsAt: '2026-12-11T00:00:00.000Z',
      salesStartsAt: '2026-11-01T14:00:00.000Z',
      timeZone: 'America/Manaus',
    });
    expect(within(region).getByText('Rascunho')).toBeInTheDocument();
    expect(state.event.version).toBe(3);
    // depois do sucesso o formulário é limpo
    await waitFor(() => expect(screen.getByLabelText('Início da sessão')).toHaveValue(''));
  });

  it('agendar com início das vendas depois do início da sessão acusa o campo', async () => {
    const user = userEvent.setup();
    const { api } = setup(eventView());
    open();
    await screen.findByRole('option', { name: 'Arena Manaus — Manaus/AM' });

    await user.selectOptions(screen.getByLabelText('Local'), ID.venue);
    fireEvent.change(screen.getByLabelText('Início da sessão'), {
      target: { value: '2026-12-10T20:00' },
    });
    fireEvent.change(screen.getByLabelText('Início das vendas'), {
      target: { value: '2026-12-10T21:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Agendar sessão' }));

    const field = screen.getByLabelText('Início das vendas');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(
      'O início das vendas precisa ser antes do início da sessão',
    );
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('VENUE_TIME_ZONE_CHANGED recarrega o local e pede para conferir os horários', async () => {
    const user = userEvent.setup();
    const { api } = setup(eventView());
    api.on('POST', '/api/catalog/events/:eventId/sessions', () => ({
      status: 422,
      body: {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'x',
        code: 'VENUE_TIME_ZONE_CHANGED',
      },
    }));
    open();
    await screen.findByRole('option', { name: 'Arena Manaus — Manaus/AM' });
    const venueReads = () =>
      api.calls.filter((c) => c.method === 'GET' && c.path === '/api/catalog/organizer/venues')
        .length;
    const before = venueReads();

    await user.selectOptions(screen.getByLabelText('Local'), ID.venue);
    fireEvent.change(screen.getByLabelText('Início da sessão'), {
      target: { value: '2026-12-10T20:00' },
    });
    fireEvent.change(screen.getByLabelText('Início das vendas'), {
      target: { value: '2026-11-01T10:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Agendar sessão' }));

    expect(
      await screen.findByText('O fuso do local mudou. Confira os horários e envie de novo.'),
    ).toBeVisible();
    await waitFor(() => expect(venueReads()).toBeGreaterThan(before));
  });

  it('lote: preço 1.234,56 vira 123456 e o fim vale no fuso da sessão; preço inválido acusa o campo', async () => {
    const user = userEvent.setup();
    const { api, commit } = setup(eventView({ sessions: [sessionView()] }));
    api.on(
      'POST',
      '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches',
      () => {
        commit(eventView({ version: 3, sessions: [sessionView()] }));
        return { status: 202, body: { id: ID.event, version: 3, entityId: ID.batch } };
      },
    );
    open();
    const region = await sessionRegion('10/12/2026 20:00');
    const sector = within(region).getByRole('region', { name: 'Pista' });

    await user.type(within(sector).getByLabelText('Nome do lote'), 'Lote 1');
    await user.type(within(sector).getByLabelText('Preço'), 'abc');
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));
    const price = within(sector).getByLabelText('Preço');
    await waitFor(() => expect(price).toHaveAttribute('aria-invalid', 'true'));
    expect(price).toHaveAccessibleDescription('Informe um preço como 1.234,56');
    expect(price).toHaveFocus();

    await user.clear(price);
    await user.type(price, '1.234,56');
    fireEvent.change(within(sector).getByLabelText('Fim do lote (opcional)'), {
      target: { value: '2026-12-01T10:00' },
    });
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.path).toBe(
      `/api/catalog/events/${ID.event}/sessions/${ID.session}/sectors/${ID.sessionSector}/batches`,
    );
    expect(post?.body).toEqual({
      name: 'Lote 1',
      priceCents: 123456,
      quantity: null,
      endsAt: '2026-12-01T14:00:00.000Z',
    });
  });

  it('erro de regra do lote (422 BATCH_QUANTITY_EXCEEDS_CAPACITY) aparece no campo quantidade', async () => {
    const user = userEvent.setup();
    const { api } = setup(eventView({ sessions: [sessionView()] }));
    api.on(
      'POST',
      '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches',
      () => ({
        status: 422,
        body: {
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'x',
          code: 'BATCH_QUANTITY_EXCEEDS_CAPACITY',
        },
      }),
    );
    open();
    const sector = within(await sessionRegion('10/12/2026 20:00')).getByRole('region', {
      name: 'Pista',
    });

    await user.type(within(sector).getByLabelText('Nome do lote'), 'Lote 1');
    await user.type(within(sector).getByLabelText('Preço'), '0,29');
    await user.type(within(sector).getByLabelText('Quantidade (opcional)'), '999');
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));

    const quantity = within(sector).getByLabelText('Quantidade (opcional)');
    await waitFor(() => expect(quantity).toHaveAttribute('aria-invalid', 'true'));
    expect(quantity).toHaveAccessibleDescription(
      'A soma das quantidades dos lotes passa da capacidade do setor.',
    );
    expect(api.calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      priceCents: 29,
      quantity: 999,
    });
  });

  it('publicar mostra a espera da projeção e depois o selo "Publicada"', async () => {
    const user = userEvent.setup();
    const draft = sessionView();
    draft.sectors[0]!.batches = [
      {
        id: ID.batch,
        name: 'Lote 1',
        priceCents: 8000,
        quantity: null,
        endsAt: null,
        badge: 'upcoming',
      },
    ];
    const published = { ...draft, status: 'published' as const };
    const { api, commit } = setup(eventView({ sessions: [draft] }), { lag: 3 });
    api.on('POST', '/api/catalog/events/:eventId/sessions/:sessionId/publish', () => {
      commit(eventView({ version: 3, status: 'published', sessions: [published] }));
      return { status: 202, body: { id: ID.event, version: 3 } };
    });
    open();
    const region = await sessionRegion('10/12/2026 20:00');
    expect(within(region).getByText('Rascunho')).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Publicar sessão' }));

    expect(await screen.findByText('Aguardando projeção…')).toBeInTheDocument();
    expect(within(region).getByText('Rascunho')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Salvo.')).toBeInTheDocument(), { timeout: 4000 });
    const after = await sessionRegion('10/12/2026 20:00');
    expect(within(after).getByText('Publicada')).toBeInTheDocument();
    expect(within(after).queryByRole('button', { name: 'Publicar sessão' })).toBeNull();
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({});
    expect(post?.headers['idempotency-key']).toBeTruthy();
    expect(
      api.calls.filter((c) => c.method === 'GET' && c.query.min_version === '3').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('publicar com setor sem lote mostra o erro da regra', async () => {
    const user = userEvent.setup();
    const { api } = setup(eventView({ sessions: [sessionView()] }));
    api.on('POST', '/api/catalog/events/:eventId/sessions/:sessionId/publish', () => ({
      status: 422,
      body: {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'x',
        code: 'SECTOR_WITHOUT_BATCH',
      },
    }));
    open();
    const region = await sessionRegion('10/12/2026 20:00');
    await user.click(within(region).getByRole('button', { name: 'Publicar sessão' }));
    expect(
      await within(region).findByText(
        'Todo setor da sessão precisa de pelo menos um lote para publicar.',
      ),
    ).toBeVisible();
  });

  it('adiciona à sessão só os setores da planta que ainda não estão nela', async () => {
    const user = userEvent.setup();
    const { api, commit } = setup(eventView({ sessions: [sessionView()] }));
    api.on('POST', '/api/catalog/events/:eventId/sessions/:sessionId/sectors', () => {
      commit(eventView({ version: 3, sessions: [sessionView()] }));
      return { status: 202, body: { id: ID.event, version: 3, entityId: ID.entity } };
    });
    open();
    const region = await sessionRegion('10/12/2026 20:00');

    const select = await within(region).findByLabelText('Setor da planta');
    await waitFor(() =>
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Escolha', 'Camarote']),
    );
    await user.selectOptions(select, 'Camarote');
    await user.click(within(region).getByRole('button', { name: 'Adicionar setor à sessão' }));

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      venueSectorId: ID.venueSector2,
    });
  });

  it('remover sessão, setor e lote envia DELETE sem corpo', async () => {
    const user = userEvent.setup();
    const session = sessionView();
    session.sectors[0]!.batches = [
      {
        id: ID.batch,
        name: 'Lote 1',
        priceCents: 8000,
        quantity: null,
        endsAt: null,
        badge: 'upcoming',
      },
    ];
    const { api } = setup(eventView({ sessions: [session] }));
    api.on('DELETE', '/api/catalog/events/:eventId/sessions/:sessionId', () => ({
      status: 202,
      body: { id: ID.event, version: 3 },
    }));
    api.on('DELETE', '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId', () => ({
      status: 202,
      body: { id: ID.event, version: 3 },
    }));
    api.on(
      'DELETE',
      '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches/:batchId',
      () => ({ status: 202, body: { id: ID.event, version: 3 } }),
    );
    open();
    const region = await sessionRegion('10/12/2026 20:00');

    await user.click(within(region).getByRole('button', { name: 'Remover lote Lote 1' }));
    await user.click(within(region).getByRole('button', { name: 'Remover setor Pista' }));
    await user.click(within(region).getByRole('button', { name: 'Remover sessão' }));

    await waitFor(() => expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(3));
    const base = `/api/catalog/events/${ID.event}/sessions/${ID.session}`;
    expect(api.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      `${base}/sectors/${ID.sessionSector}/batches/${ID.batch}`,
      `${base}/sectors/${ID.sessionSector}`,
      base,
    ]);
    expect(api.calls.filter((c) => c.method === 'DELETE').every((c) => c.body === undefined)).toBe(
      true,
    );
  });

  it('descartar pede confirmação, espera a lápide (404 com minVersionReached) e volta para a lista', async () => {
    const user = userEvent.setup();
    const { api, state } = setup(eventView(), { lag: 2 });
    api.on('DELETE', '/api/catalog/events/:eventId', () => {
      state.gone = true;
      state.event = { ...state.event, version: 3 };
      state.readsSinceCommand = 0;
      return { status: 202, body: { id: ID.event, version: 3 } };
    });
    const { router } = open();
    await screen.findByRole('heading', { level: 1, name: 'Show de Teste' });

    await user.click(screen.getByRole('button', { name: 'Descartar evento' }));
    expect(screen.getByRole('button', { name: 'Confirmar descarte' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Confirmar descarte' })).toBeNull();
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Descartar evento' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar descarte' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/produtor/eventos'), {
      timeout: 4000,
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Meus eventos' })).toBeVisible();
    expect(api.calls.find((c) => c.method === 'DELETE')?.body).toBeUndefined();
  });

  it('409 ao salvar os dados do evento recarrega e reabre o formulário com os dados novos', async () => {
    const user = userEvent.setup();
    const { api, state } = setup(eventView({ version: 2 }));
    api.on('PATCH', '/api/catalog/events/:eventId', () => {
      state.event = eventView({ version: 3, title: 'Título da outra aba' });
      state.projected = state.event;
      return {
        status: 409,
        body: {
          statusCode: 409,
          error: 'Conflict',
          message: 'x',
          code: 'CONCURRENCY_CONFLICT',
        },
      };
    });
    open();
    await screen.findByRole('heading', { level: 1, name: 'Show de Teste' });

    const title = screen.getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Meu título');
    await user.click(screen.getByRole('button', { name: 'Salvar dados do evento' }));

    expect(
      await screen.findByText(/Os dados mudaram desde que você abriu o formulário/),
    ).toBeVisible();
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      expectedVersion: 2,
      title: 'Meu título',
      imageUrl: null,
    });
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Título da outra aba'));
  });

  it('sucesso ao salvar os dados envia expectedVersion e remove a imagem com null', async () => {
    const user = userEvent.setup();
    const { api, commit } = setup(eventView({ version: 2, imageUrl: 'https://x.com/a.png' }));
    api.on('PATCH', '/api/catalog/events/:eventId', () => {
      commit(eventView({ version: 3, imageUrl: null }));
      return { status: 202, body: { id: ID.event, version: 3 } };
    });
    open();
    await screen.findByRole('heading', { level: 1, name: 'Show de Teste' });

    const image = screen.getByLabelText('URL da imagem (opcional)');
    expect(image).toHaveValue('https://x.com/a.png');
    await user.clear(image);
    await user.click(screen.getByRole('button', { name: 'Salvar dados do evento' }));

    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      expectedVersion: 2,
      title: 'Show de Teste',
      description: 'Uma descrição',
      category: 'show',
      ageRating: 'L',
      imageUrl: null,
    });
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
  });

  it('Idempotency-Key por intenção: reenvio igual reusa a chave; payload novo ou novo envio após sucesso troca', async () => {
    const user = userEvent.setup();
    const { api, commit } = setup(eventView({ sessions: [sessionView()] }));
    let failures = 3;
    api.on(
      'POST',
      '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches',
      () => {
        if (failures > 0) {
          failures -= 1;
          throw new TypeError('Failed to fetch');
        }
        commit(eventView({ version: 3, sessions: [sessionView()] }));
        return { status: 202, body: { id: ID.event, version: 3, entityId: ID.batch } };
      },
    );
    open();
    const sector = within(await sessionRegion('10/12/2026 20:00')).getByRole('region', {
      name: 'Pista',
    });
    const keys = () =>
      api.calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);

    await user.type(within(sector).getByLabelText('Nome do lote'), 'Lote 1');
    await user.type(within(sector).getByLabelText('Preço'), '80');
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));

    // 1 envio + 2 retries automáticos, todos com a mesma chave, e depois o erro de rede
    expect(
      await within(sector).findByText('Sem conexão com o servidor. Tente novamente.', undefined, {
        timeout: 4000,
      }),
    ).toBeVisible();
    expect(keys()).toHaveLength(3);
    expect(new Set(keys()).size).toBe(1);
    const first = keys()[0];

    // reenvio sem mudar nada: mesma chave
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));
    await waitFor(() => expect(keys()).toHaveLength(4));
    expect(keys()[3]).toBe(first);
    await waitFor(() => expect(within(sector).getByLabelText('Nome do lote')).toHaveValue(''));

    // depois do sucesso, a mesma intenção digitada de novo é uma intenção nova
    await user.type(within(sector).getByLabelText('Nome do lote'), 'Lote 1');
    await user.type(within(sector).getByLabelText('Preço'), '80');
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));
    await waitFor(() => expect(keys()).toHaveLength(5));
    expect(keys()[4]).not.toBe(first);
  });

  it('payload diferente depois de uma falha usa chave nova', async () => {
    const user = userEvent.setup();
    const { api } = setup(eventView({ sessions: [sessionView()] }));
    api.on(
      'POST',
      '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches',
      () => ({
        status: 422,
        body: {
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'x',
          code: 'BATCH_NAME_TAKEN',
        },
      }),
    );
    open();
    const sector = within(await sessionRegion('10/12/2026 20:00')).getByRole('region', {
      name: 'Pista',
    });
    const keys = () =>
      api.calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);

    await user.type(within(sector).getByLabelText('Nome do lote'), 'Lote 1');
    await user.type(within(sector).getByLabelText('Preço'), '80');
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));
    await waitFor(() => expect(keys()).toHaveLength(1));
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));
    await waitFor(() => expect(keys()).toHaveLength(2));
    expect(keys()[1]).toBe(keys()[0]);

    await user.type(within(sector).getByLabelText('Nome do lote'), ' B');
    await user.click(within(sector).getByRole('button', { name: 'Adicionar lote' }));
    await waitFor(() => expect(keys()).toHaveLength(3));
    expect(keys()[2]).not.toBe(keys()[0]);
  });

  it('10 s sem a projeção mostram "Salvo. Os dados podem demorar a aparecer." e "Atualizar" reinicia a espera', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const draft = sessionView();
    draft.sectors[0]!.batches = [
      {
        id: ID.batch,
        name: 'Lote 1',
        priceCents: 8000,
        quantity: null,
        endsAt: null,
        badge: 'upcoming',
      },
    ];
    const { api } = setup(eventView({ sessions: [draft] }), { lag: 100000 });
    api.on('POST', '/api/catalog/events/:eventId/sessions/:sessionId/publish', () => ({
      status: 202,
      body: { id: ID.event, version: 3 },
    }));
    open();
    const region = await sessionRegion('10/12/2026 20:00');

    await user.click(within(region).getByRole('button', { name: 'Publicar sessão' }));
    expect(await screen.findByText('Aguardando projeção…')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(10_500);
    const notice = await screen.findByText('Salvo. Os dados podem demorar a aparecer.');
    expect(notice).toBeInTheDocument();
    const readsAtTimeout = api.calls.filter((c) => c.query.min_version === '3').length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.calls.filter((c) => c.query.min_version === '3').length).toBeLessThanOrEqual(
      readsAtTimeout + 1,
    );

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Aguardando projeção…')).toBeInTheDocument();
  });

  it('evento inexistente (404) mostra "Evento não encontrado"', async () => {
    createFakeApi().install();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Evento não encontrado' }),
    ).toBeVisible();
  });

  it('acessibilidade: a página tem um h1, os campos têm label e o status usa aria-live', async () => {
    setup(eventView({ sessions: [sessionView()] }));
    open();
    await screen.findByRole('heading', { level: 1, name: 'Show de Teste' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const label of [
      'Título',
      'Descrição',
      'Categoria',
      'Classificação indicativa',
      'URL da imagem (opcional)',
      'Local',
      'Início da sessão',
      'Início das vendas',
      'Nome do lote',
      'Preço',
      'Quantidade (opcional)',
      'Fim do lote (opcional)',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
