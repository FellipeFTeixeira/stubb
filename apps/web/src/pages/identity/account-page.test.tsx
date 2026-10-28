import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { getSessionUser } from '@/api/auth-session';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

type Identity = ReturnType<typeof installFakeIdentity>;
type Account = ReturnType<Identity['seedUser']>;

// `seed` roda antes da renderização: as consultas da tela já saem com os dados semeados.
function setup(
  roles: Array<'customer' | 'organizer' | 'admin'> = ['customer'],
  seed?: (identity: Identity, account: Account) => void,
) {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  const account = identity.seedUser({
    fullName: 'Ana Souza',
    cpf: '12345678909',
    roles: [...roles],
  });
  identity.startSessionFor(account.id);
  seed?.(identity, account);
  const rendered = renderRoutes(appRoutes, {
    initialEntries: ['/conta'],
    // O token carrega os papéis de quando a sessão começou, mesmo que o servidor já tenha mudado.
    session: { id: account.id, roles: [...roles] },
  });
  return { api, identity, account, ...rendered, user: userEvent.setup() };
}

const main = () => within(screen.getByRole('main'));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AccountPage', () => {
  it('mostra nome, e-mail, CPF mascarado e papéis em português', async () => {
    const { account } = setup(['customer']);
    expect(await main().findByText('Ana Souza')).toBeInTheDocument();
    expect(main().getByText(account.email)).toBeInTheDocument();
    expect(main().getByText('***.456.789-**')).toBeInTheDocument();
    expect(main().getByText('Cliente')).toBeInTheDocument();
    expect(main().queryByRole('link', { name: 'Área do produtor' })).not.toBeInTheDocument();
  });

  it('com organizer e admin lista os papéis e mostra o link Área do produtor', async () => {
    setup(['customer', 'organizer', 'admin']);
    expect(await main().findByText('Cliente, Produtor, Admin')).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Área do produtor' })).toHaveAttribute(
      'href',
      '/produtor/eventos',
    );
    expect(main().queryByRole('button', { name: 'Enviar pedido' })).not.toBeInTheDocument();
  });

  it('customer sem pedido vê o formulário e envia nome, CNPJ normalizado e motivo', async () => {
    const { api, user } = setup();
    await user.type(await main().findByLabelText('Nome da organização'), 'Produtora Aurora');
    await user.type(main().getByLabelText('CNPJ'), '11.222.333/0001-81');
    await user.type(main().getByLabelText('Motivo'), 'Quero vender ingressos de shows');
    await user.click(main().getByRole('button', { name: 'Enviar pedido' }));

    // O pedido enviado vira "Pendente" no histórico e o formulário some.
    expect(await main().findByText('Pendente')).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Enviar pedido' })).not.toBeInTheDocument();
    const post = api.identityCalls.find((c) => c.path === '/api/identity/organizer-requests');
    expect(post?.body).toEqual({
      organizationName: 'Produtora Aurora',
      cnpj: '11222333000181',
      reason: 'Quero vender ingressos de shows',
    });
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('CNPJ inválido aparece no campo e nada é enviado', async () => {
    const { api, user } = setup();
    await user.type(await main().findByLabelText('Nome da organização'), 'Produtora Aurora');
    await user.type(main().getByLabelText('CNPJ'), '11222333000180');
    await user.type(main().getByLabelText('Motivo'), 'x');
    await user.click(main().getByRole('button', { name: 'Enviar pedido' }));

    expect(await main().findByText('CNPJ inválido')).toBeInTheDocument();
    expect(api.identityCalls.some((c) => c.path === '/api/identity/organizer-requests')).toBe(
      false,
    );
  });

  it('com pedido pendente não mostra o formulário e consulta de novo a cada 10 s', async () => {
    // Timers falsos desde o início, para o setInterval do refetch nascer falso; o relógio real continua
    // andando (shouldAdvanceTime), então as esperas do Testing Library seguem funcionando.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = setup(['customer'], (identity, account) => {
      identity.seedOrganizerRequest(account.id, { status: 'pending' });
    });
    expect(await main().findByText('Pendente')).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Enviar pedido' })).not.toBeInTheDocument();
    expect(main().getByText(/Seu pedido está em análise/)).toBeInTheDocument();

    const listCalls = () =>
      api.identityCalls.filter((c) => c.path === '/api/identity/me/organizer-requests').length;
    expect(listCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await waitFor(() => expect(listCalls()).toBeGreaterThanOrEqual(2));
  });

  it('pedido recusado aparece com a mensagem e o formulário para novo pedido', async () => {
    setup(['customer'], (identity, account) => {
      identity.seedOrganizerRequest(account.id, {
        status: 'rejected',
        rejectionMessage: 'CNPJ não confere',
        decidedAt: new Date().toISOString(),
      });
    });
    expect(await main().findByText('Recusado')).toBeInTheDocument();
    expect(main().getByText('CNPJ não confere')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Enviar pedido' })).toBeInTheDocument();
  });

  it('histórico mostra CNPJ formatado e data em pt-BR', async () => {
    setup(['customer'], (identity, account) => {
      identity.seedOrganizerRequest(account.id, {
        status: 'rejected',
        cnpj: '11222333000181',
        rejectionMessage: null,
        createdAt: '2026-10-20T15:00:00.000Z',
        decidedAt: '2026-10-21T15:00:00.000Z',
      });
    });
    expect(await main().findByText(/CNPJ 11\.222\.333\/0001-81/)).toBeInTheDocument();
    expect(main().getByText(/Enviado em \d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
  });

  it('pedido aprovado com token sem o papel renova a sessão uma vez e mostra Área do produtor', async () => {
    const { api } = setup(['customer'], (identity, account) => {
      // Aprovado no servidor (o papel já está no banco), mas o token da sessão ainda não o tem.
      account.roles.push('organizer');
      identity.seedOrganizerRequest(account.id, {
        status: 'approved',
        decidedAt: new Date().toISOString(),
      });
    });

    expect(await main().findByRole('link', { name: 'Área do produtor' })).toBeInTheDocument();
    expect(getSessionUser()?.roles).toContain('organizer');
    expect(main().getByText('Aprovado')).toBeInTheDocument();
    expect(
      api.identityCalls.filter((c) => c.path === '/api/identity/session/refresh'),
    ).toHaveLength(1);
  });
});
