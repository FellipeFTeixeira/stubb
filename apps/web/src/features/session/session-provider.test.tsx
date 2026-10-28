import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, setAccessToken } from '@/api/auth-session';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { createTestQueryClient } from '@/test/render';
import { SessionProvider, useSession } from './session-provider';

function Probe() {
  const { status, user, hasRole, signIn, signOut } = useSession();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.id ?? 'ninguém'}</p>
      <p data-testid="organizer">{String(hasRole('organizer'))}</p>
      <button
        type="button"
        onClick={() => void signIn({ email: 'b@exemplo.com', password: 'senha-segura-1' })}
      >
        entrar-b
      </button>
      <button type="button" onClick={() => void signOut()}>
        sair
      </button>
    </div>
  );
}

function setup() {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  const client = createTestQueryClient();
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  return { api, identity, client, view };
}

beforeEach(() => setAccessToken(null));
afterEach(() => vi.unstubAllGlobals());

describe('SessionProvider', () => {
  it('começa em loading e vira authenticated quando o refresh devolve um token (uma chamada só, mesmo no StrictMode)', async () => {
    const api = createFakeApi();
    const identity = installFakeIdentity(api);
    api.install();
    const user = identity.seedUser({ roles: ['customer', 'organizer'] });
    identity.startSessionFor(user.id);
    render(
      <StrictMode>
        <QueryClientProvider client={createTestQueryClient()}>
          <SessionProvider>
            <Probe />
          </SessionProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent(user.id);
    expect(screen.getByTestId('organizer')).toHaveTextContent('true');
    expect(api.identityCalls.filter((c) => c.path.endsWith('/refresh'))).toHaveLength(1);
  });

  it('vira anonymous quando o refresh dá 401', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('user')).toHaveTextContent('ninguém');
  });

  it('signIn de outra conta limpa o cache; signOut limpa token e cache', async () => {
    const { identity, client } = setup();
    const a = identity.seedUser({ email: 'b@exemplo.com', cpf: '98765432100' });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));

    client.setQueryData(['secret'], 'dados do anônimo');
    await userEvent.click(screen.getByRole('button', { name: 'entrar-b' }));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(a.id));
    expect(client.getQueryData(['secret'])).toBeUndefined();

    client.setQueryData(['secret'], 'dados da conta B');
    await userEvent.click(screen.getByRole('button', { name: 'sair' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(getAccessToken()).toBeNull();
    expect(client.getQueryData(['secret'])).toBeUndefined();
  });

  it('useSession fora do provider lança erro claro', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useSession precisa estar dentro de <SessionProvider>');
    spy.mockRestore();
  });
});
