import { configure, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

function setup() {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  return { api, identity };
}

afterEach(() => vi.unstubAllGlobals());

describe('VerifyEmailPage', () => {
  it('confirma uma vez só e mostra E-mail confirmado com link para Entrar', async () => {
    const { api, identity } = setup();
    const account = identity.seedUser({ verified: false });
    renderRoutes(appRoutes, {
      initialEntries: [`/verificar-email?token=verify-${account.id}`],
      session: null,
    });

    expect(await screen.findByRole('heading', { name: 'E-mail confirmado' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/entrar',
    );
    expect(account.verified).toBe(true);
    expect(
      api.identityCalls.filter((c) => c.path === '/api/identity/email-verifications/confirm'),
    ).toHaveLength(1);
  });

  it('não confirma duas vezes no StrictMode', async () => {
    configure({ reactStrictMode: true });
    onTestFinished(() => configure({ reactStrictMode: false }));
    const { api, identity } = setup();
    const account = identity.seedUser({ verified: false });
    renderRoutes(appRoutes, {
      initialEntries: [`/verificar-email?token=verify-${account.id}`],
      session: null,
    });

    await screen.findByRole('heading', { name: 'E-mail confirmado' });
    expect(
      api.identityCalls.filter((c) => c.path === '/api/identity/email-verifications/confirm'),
    ).toHaveLength(1);
  });

  it('422 mostra Link inválido ou vencido e o formulário de reenvio por e-mail', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderRoutes(appRoutes, { initialEntries: ['/verificar-email?token=lixo'], session: null });

    expect(
      await screen.findByRole('heading', { name: 'Link inválido ou vencido' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('E-mail'), 'Ana@Exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Reenviar link' }));

    expect(
      await screen.findByText(
        'Se a conta existir e não estiver confirmada, enviamos um novo link.',
      ),
    ).toBeInTheDocument();
    const resend = api.identityCalls.find((c) => c.path === '/api/identity/email-verifications');
    expect(resend?.body).toEqual({ email: 'ana@exemplo.com' });
  });

  it('sem token na URL não chama a API e oferece o reenvio', async () => {
    const { api } = setup();
    renderRoutes(appRoutes, { initialEntries: ['/verificar-email'], session: null });

    expect(
      await screen.findByRole('heading', { name: 'Link inválido ou vencido' }),
    ).toBeInTheDocument();
    expect(api.identityCalls).toHaveLength(0);
  });
});
