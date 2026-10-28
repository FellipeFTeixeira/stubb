import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { getAccessToken } from '@/api/auth-session';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

function setup(entry = '/entrar') {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  const rendered = renderRoutes(appRoutes, { initialEntries: [entry], session: null });
  return { api, identity, ...rendered, user: userEvent.setup() };
}

async function signIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('sucesso sem redirect vai para a vitrine e grava o token', async () => {
    const { identity, router, user } = setup();
    identity.seedUser({ email: 'ana@exemplo.com', password: 'senha-segura-1' });
    await signIn(user, 'Ana@Exemplo.com', 'senha-segura-1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(getAccessToken()).not.toBeNull();
  });

  it('sucesso volta para a rota pedida em redirect', async () => {
    const { identity, router, user } = setup('/entrar?redirect=%2Fconta');
    identity.seedUser({ email: 'ana@exemplo.com', password: 'senha-segura-1' });
    await signIn(user, 'ana@exemplo.com', 'senha-segura-1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/conta'));
  });

  it('redirect externo ou protocolo-relativo é ignorado', async () => {
    const { identity, router, user } = setup('/entrar?redirect=%2F%2Fevil.com');
    identity.seedUser({ email: 'ana@exemplo.com', password: 'senha-segura-1' });
    await signIn(user, 'ana@exemplo.com', 'senha-segura-1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
  });

  it('401 mostra E-mail ou senha inválidos, sem navegar', async () => {
    const { identity, router, user } = setup();
    identity.seedUser({ email: 'ana@exemplo.com', password: 'senha-segura-1' });
    await signIn(user, 'ana@exemplo.com', 'errada');

    expect(await screen.findByText('E-mail ou senha inválidos')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(getAccessToken()).toBeNull();
  });

  it('403 de e-mail não verificado mostra o aviso e Reenviar link, que usa o e-mail digitado', async () => {
    const { api, identity, user } = setup();
    identity.seedUser({ email: 'ana@exemplo.com', password: 'senha-segura-1', verified: false });
    await signIn(user, 'Ana@Exemplo.com', 'senha-segura-1');

    expect(await screen.findByText('Confirme seu e-mail antes de entrar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reenviar link' }));

    expect(
      await screen.findByText(
        'Se a conta existir e não estiver confirmada, enviamos um novo link.',
      ),
    ).toBeInTheDocument();
    const resend = api.identityCalls.find((c) => c.path === '/api/identity/email-verifications');
    expect(resend?.body).toEqual({ email: 'ana@exemplo.com' });
  });

  it('tem link para o cadastro', () => {
    setup();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Criar conta' }),
    ).toHaveAttribute('href', '/cadastro');
  });
});
