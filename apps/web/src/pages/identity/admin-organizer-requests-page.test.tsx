import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { identityRoutes } from '@stubb/contracts';
import { appRoutes } from '@/app/router';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

type Identity = ReturnType<typeof installFakeIdentity>;

// `seed` roda antes da renderização, para a primeira consulta já ver os pedidos extras.
function setup(seed?: (identity: Identity, applicantId: string) => void) {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  const admin = identity.seedUser({
    fullName: 'Admin Stubb',
    roles: ['customer', 'organizer', 'admin'],
  });
  const applicant = identity.seedUser({
    fullName: 'Bia Lima',
    email: 'bia@exemplo.com',
    cpf: '98765432100',
  });
  const request = identity.seedOrganizerRequest(applicant.id, {
    organizationName: 'Produtora Aurora',
    cnpj: '12ABC34501DE35',
    reason: 'Quero vender ingressos',
  });
  seed?.(identity, applicant.id);
  const rendered = renderRoutes(appRoutes, {
    initialEntries: ['/admin/produtores'],
    session: { id: admin.id, roles: admin.roles },
  });
  return { api, identity, admin, applicant, request, ...rendered, user: userEvent.setup() };
}

const main = () => within(screen.getByRole('main'));
const decisionCalls = (api: ReturnType<typeof createFakeApi>, action: string) =>
  api.identityCalls.filter((c) => c.method === 'POST' && c.path.endsWith(`/${action}`));

afterEach(() => vi.unstubAllGlobals());

describe('AdminOrganizerRequestsPage', () => {
  it('lista os pendentes com nome, e-mail, organização, CNPJ formatado, motivo e data', async () => {
    setup();
    expect(await main().findByText('Bia Lima')).toBeInTheDocument();
    expect(main().getByText('bia@exemplo.com')).toBeInTheDocument();
    expect(main().getByText('Produtora Aurora')).toBeInTheDocument();
    expect(main().getByText('12.ABC.345/01DE-35')).toBeInTheDocument();
    expect(main().getByText('Quero vender ingressos')).toBeInTheDocument();
    expect(main().getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
    expect(main().getByRole('tab', { name: 'Pendentes', selected: true })).toBeInTheDocument();
  });

  it('Aprovar envia o command com Idempotency-Key e tira o pedido da lista de pendentes', async () => {
    const { api, applicant, request, user } = setup();
    await user.click(await main().findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(main().queryByText('Bia Lima')).not.toBeInTheDocument());
    const [call] = decisionCalls(api, 'approve');
    expect(call?.path).toBe(`/api/identity/admin/organizer-requests/${request.id}/approve`);
    expect(call?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(applicant.roles).toContain('organizer');
    expect(await main().findByText(/Nenhum pedido pendente/)).toBeInTheDocument();
  });

  it('Recusar abre o diálogo e envia a mensagem opcional', async () => {
    const { api, request, user } = setup();
    await user.click(await main().findByRole('button', { name: 'Recusar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar pedido' });
    await user.type(within(dialog).getByLabelText('Mensagem (opcional)'), '  CNPJ não confere ');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar recusa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [call] = decisionCalls(api, 'reject');
    expect(call?.path).toBe(`/api/identity/admin/organizer-requests/${request.id}/reject`);
    expect(call?.body).toEqual({ message: 'CNPJ não confere' });
    expect(await main().findByText(/Nenhum pedido pendente/)).toBeInTheDocument();
  });

  it('Recusar sem mensagem envia corpo vazio', async () => {
    const { api, user } = setup();
    await user.click(await main().findByRole('button', { name: 'Recusar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar recusa' }));

    await waitFor(() => expect(decisionCalls(api, 'reject')).toHaveLength(1));
    expect(decisionCalls(api, 'reject')[0]?.body).toEqual({});
  });

  it('cancelar o diálogo não envia nada', async () => {
    const { api, user } = setup();
    await user.click(await main().findByRole('button', { name: 'Recusar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(decisionCalls(api, 'reject')).toHaveLength(0);
  });

  it('409 NOT_PENDING mostra "Este pedido já foi decidido" e recarrega a lista', async () => {
    const { api, request, user } = setup();
    // Outro admin decidiu antes: o POST responde 409 enquanto a lista ainda mostra o pedido.
    api.on('POST', identityRoutes.approveOrganizerRequest(':requestId'), () => ({
      status: 409,
      body: {
        statusCode: 409,
        error: 'Conflict',
        message: 'x',
        code: 'ORGANIZER_REQUEST_NOT_PENDING',
      },
    }));
    await user.click(await main().findByRole('button', { name: 'Aprovar' }));

    expect(await main().findByText('Este pedido já foi decidido')).toBeInTheDocument();
    const lists = () =>
      api.identityCalls.filter(
        (c) => c.method === 'GET' && c.path === '/api/identity/admin/organizer-requests',
      );
    await waitFor(() => expect(lists().length).toBeGreaterThanOrEqual(2));
    expect(request.status).toBe('pending');
  });

  it('abas Aprovados e Recusados trocam o status da consulta', async () => {
    const { api, user } = setup((identity, applicantId) => {
      identity.seedOrganizerRequest(applicantId, {
        status: 'rejected',
        organizationName: 'Produtora Recusada',
        decidedAt: new Date().toISOString(),
      });
    });
    await main().findByText('Bia Lima');
    await user.click(main().getByRole('tab', { name: 'Recusados' }));

    expect(await main().findByText('Produtora Recusada')).toBeInTheDocument();
    const queries = api.identityCalls
      .filter((c) => c.method === 'GET' && c.path === '/api/identity/admin/organizer-requests')
      .map((c) => c.query.status);
    expect(queries).toContain('rejected');
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('paginação: Próxima e Anterior mudam a página consultada', async () => {
    const { api, user } = setup((identity, applicantId) => {
      for (let i = 0; i < 20; i += 1) identity.seedOrganizerRequest(applicantId);
    });
    await main().findAllByText('Produtora Demo');
    expect(main().getByText('Página 1 de 2')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await user.click(main().getByRole('button', { name: 'Próxima' }));
    expect(await main().findByText('Página 2 de 2')).toBeInTheDocument();
    expect(api.identityCalls.some((c) => c.method === 'GET' && c.query.page === '2')).toBe(true);
    expect(main().getByRole('button', { name: 'Próxima' })).toBeDisabled();

    await user.click(main().getByRole('button', { name: 'Anterior' }));
    expect(await main().findByText('Página 1 de 2')).toBeInTheDocument();
  });
});
