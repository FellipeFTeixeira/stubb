import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { ID, venueView } from '@/features/organizer/test-support';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

const NOT_PROJECTED = { statusCode: 404, message: 'Not found', minVersionReached: false };

function domainError(status: number, code: string) {
  return { status, body: { statusCode: status, error: 'x', message: 'x', code } };
}

afterEach(() => vi.unstubAllGlobals());

describe('locais do produtor', () => {
  it('lista os locais com cidade/UF e número de setores', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/organizer/venues', () => ({
      status: 200,
      body: {
        items: [
          {
            id: ID.venue,
            name: 'Arena Manaus',
            city: 'Manaus',
            state: 'AM',
            timeZone: 'America/Manaus',
            sectorsCount: 2,
            version: 3,
          },
        ],
      },
    }));
    api.install();
    renderRoutes(appRoutes, { initialEntries: ['/produtor/locais'] });

    expect(screen.getByRole('heading', { level: 1, name: 'Locais' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Arena Manaus' });
    expect(link).toHaveAttribute('href', `/produtor/locais/${ID.venue}`);
    expect(screen.getByText('Manaus/AM · 2 setores')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Novo local' })).toHaveAttribute(
      'href',
      '/produtor/locais/novo',
    );
  });

  it('cadastro: aguarda a projeção (atrasada) e só então abre o local', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    let reads = 0;
    api.on('POST', '/api/catalog/venues', () => ({
      status: 202,
      body: { id: ID.venue, version: 1 },
    }));
    api.on('GET', '/api/catalog/organizer/venues/:venueId', () => {
      reads += 1;
      return reads <= 2
        ? { status: 404, body: NOT_PROJECTED }
        : {
            status: 200,
            body: { venue: venueView({ version: 1, sectors: [] }), minVersionReached: true },
          };
    });
    api.on('GET', '/api/catalog/organizer/venues', () => ({ status: 200, body: { items: [] } }));
    api.install();
    const { router } = renderRoutes(appRoutes, { initialEntries: ['/produtor/locais/novo'] });

    await user.type(screen.getByLabelText('Nome do local'), '  Arena Manaus ');
    await user.type(screen.getByLabelText('Endereço'), 'Av. Central, 100');
    await user.type(screen.getByLabelText('Cidade'), 'Manaus');
    await user.selectOptions(screen.getByLabelText('UF'), 'AM');
    await user.selectOptions(screen.getByLabelText('Fuso horário'), 'America/Manaus');
    await user.click(screen.getByRole('button', { name: 'Cadastrar local' }));

    expect(await screen.findByText('Aguardando projeção…')).toBeInTheDocument();
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      name: 'Arena Manaus',
      address: 'Av. Central, 100',
      city: 'Manaus',
      state: 'AM',
      timeZone: 'America/Manaus',
    });
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(router.state.location.pathname).toBe('/produtor/locais/novo');

    await waitFor(
      () => expect(router.state.location.pathname).toBe(`/produtor/locais/${ID.venue}`),
      { timeout: 4000 },
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Arena Manaus' })).toBeVisible();
    const waits = api.calls.filter((c) => c.method === 'GET' && c.query.min_version === '1');
    expect(waits.length).toBeGreaterThanOrEqual(3);
  });

  it('cadastro vazio mostra erros nos campos, com aria-invalid e foco no primeiro', async () => {
    const user = userEvent.setup();
    createFakeApi().install();
    renderRoutes(appRoutes, { initialEntries: ['/produtor/locais/novo'] });

    await user.click(screen.getByRole('button', { name: 'Cadastrar local' }));

    const name = screen.getByLabelText('Nome do local');
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription('Campo obrigatório');
    expect(screen.getByLabelText('UF')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escolha uma UF')).toBeInTheDocument();
  });

  it('setor marcado com duas filas envia rows e limpa o formulário', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.on('GET', '/api/catalog/organizer/venues/:venueId', () => ({
      status: 200,
      body: { venue: venueView({ sectors: [] }), minVersionReached: true },
    }));
    api.on('POST', '/api/catalog/venues/:venueId/sectors', () => ({
      status: 202,
      body: { id: ID.venue, version: 4, entityId: ID.entity },
    }));
    api.install();
    renderRoutes(appRoutes, { initialEntries: [`/produtor/locais/${ID.venue}`] });
    await screen.findByRole('heading', { level: 1, name: 'Arena Manaus' });

    await user.type(screen.getByLabelText('Nome do setor'), 'Camarote');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Assento marcado');
    expect(screen.queryByLabelText('Capacidade')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Rótulo da fila 1'), 'a');
    await user.type(screen.getByLabelText('Assentos da fila 1'), '10');
    await user.click(screen.getByRole('button', { name: 'Adicionar fila' }));
    await user.type(screen.getByLabelText('Rótulo da fila 2'), 'B');
    await user.type(screen.getByLabelText('Assentos da fila 2'), '12');
    await user.click(screen.getByRole('button', { name: 'Adicionar setor' }));

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.path).toBe(`/api/catalog/venues/${ID.venue}/sectors`);
    expect(post?.body).toEqual({
      name: 'Camarote',
      kind: 'seated',
      rows: [
        { label: 'A', seats: 10 },
        { label: 'B', seats: 12 },
      ],
    });
    await waitFor(() => expect(screen.getByLabelText('Nome do setor')).toHaveValue(''));
  });

  it('setor de pista exige capacidade e envia o número', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.on('GET', '/api/catalog/organizer/venues/:venueId', () => ({
      status: 200,
      body: { venue: venueView({ sectors: [] }), minVersionReached: true },
    }));
    api.on('POST', '/api/catalog/venues/:venueId/sectors', () => ({
      status: 202,
      body: { id: ID.venue, version: 4, entityId: ID.entity },
    }));
    api.install();
    renderRoutes(appRoutes, { initialEntries: [`/produtor/locais/${ID.venue}`] });
    await screen.findByRole('heading', { level: 1, name: 'Arena Manaus' });

    await user.type(screen.getByLabelText('Nome do setor'), 'Pista Premium');
    await user.click(screen.getByRole('button', { name: 'Adicionar setor' }));
    expect(await screen.findByText('Informe um número')).toBeInTheDocument();
    expect(screen.getByLabelText('Capacidade')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText('Capacidade'), '5000');
    await user.click(screen.getByRole('button', { name: 'Adicionar setor' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Pista Premium',
      kind: 'general_admission',
      capacity: 5000,
    });
  });

  it('422 VENUE_SECTOR_NAME_TAKEN aparece no campo nome do setor', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.on('GET', '/api/catalog/organizer/venues/:venueId', () => ({
      status: 200,
      body: { venue: venueView(), minVersionReached: true },
    }));
    api.on('POST', '/api/catalog/venues/:venueId/sectors', () =>
      domainError(422, 'VENUE_SECTOR_NAME_TAKEN'),
    );
    api.install();
    renderRoutes(appRoutes, { initialEntries: [`/produtor/locais/${ID.venue}`] });
    await screen.findByRole('heading', { level: 1, name: 'Arena Manaus' });

    await user.type(screen.getByLabelText('Nome do setor'), 'Pista');
    await user.type(screen.getByLabelText('Capacidade'), '100');
    await user.click(screen.getByRole('button', { name: 'Adicionar setor' }));

    const field = screen.getByLabelText('Nome do setor');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription('Já existe um setor com esse nome neste local.');
    expect(field).toHaveFocus();
  });

  it('remover setor envia DELETE, aguarda a projeção e mostra a planta nova', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    let removed = false;
    api.on('GET', '/api/catalog/organizer/venues/:venueId', ({ query }) => {
      const wanted = Number(query.min_version ?? 0);
      const version = removed ? 4 : 3;
      return {
        status: 200,
        body: {
          venue: venueView({ version, sectors: removed ? [] : venueView().sectors }),
          minVersionReached: version >= wanted,
        },
      };
    });
    api.on('DELETE', '/api/catalog/venues/:venueId/sectors/:venueSectorId', () => {
      removed = true;
      return { status: 202, body: { id: ID.venue, version: 4 } };
    });
    api.install();
    renderRoutes(appRoutes, { initialEntries: [`/produtor/locais/${ID.venue}`] });

    const sector = await screen.findByRole('region', { name: 'Pista' });
    expect(within(sector).getByText('Pista — capacidade 200')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover setor Pista' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pista' })).toBeNull());
    const del = api.calls.find((c) => c.method === 'DELETE');
    expect(del?.path).toBe(`/api/catalog/venues/${ID.venue}/sectors/${ID.venueSector}`);
    expect(del?.body).toBeUndefined();
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
  });

  it('409 na edição mostra o aviso, recarrega a leitura e reabre o formulário com a versão nova', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    let server = venueView({ version: 3, name: 'Arena Manaus' });
    api.on('GET', '/api/catalog/organizer/venues/:venueId', () => ({
      status: 200,
      body: { venue: server, minVersionReached: true },
    }));
    api.on('PATCH', '/api/catalog/venues/:venueId', () => {
      // Outra aba salvou antes: o servidor já está na versão 4 com outro nome.
      server = venueView({ version: 4, name: 'Arena Nova' });
      return domainError(409, 'CONCURRENCY_CONFLICT');
    });
    api.install();
    renderRoutes(appRoutes, { initialEntries: [`/produtor/locais/${ID.venue}`] });
    await screen.findByRole('heading', { level: 1, name: 'Arena Manaus' });

    const name = screen.getByLabelText('Nome do local');
    await user.clear(name);
    await user.type(name, 'Meu nome');
    await user.click(screen.getByRole('button', { name: 'Salvar dados do local' }));

    expect(
      await screen.findByText(/Os dados mudaram desde que você abriu o formulário/),
    ).toBeVisible();
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toMatchObject({ expectedVersion: 3, name: 'Meu nome' });
    await waitFor(() => expect(screen.getByLabelText('Nome do local')).toHaveValue('Arena Nova'));
    expect(screen.getByRole('heading', { level: 1, name: 'Arena Nova' })).toBeVisible();
  });

  it('local inexistente mostra "Local não encontrado"', async () => {
    createFakeApi().install();
    renderRoutes(appRoutes, { initialEntries: [`/produtor/locais/${ID.venue2}`] });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Local não encontrado' }),
    ).toBeVisible();
  });
});
