import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '@/app/router';
import { createFakeApi, installFakeIdentity } from '@/test/fake-api';
import { renderRoutes } from '@/test/render';

function setup() {
  const api = createFakeApi();
  const identity = installFakeIdentity(api);
  api.install();
  renderRoutes(appRoutes, { initialEntries: ['/cadastro'], session: null });
  return { api, identity, user: userEvent.setup() };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  values: Partial<Record<'name' | 'email' | 'password' | 'cpf', string>> = {},
) {
  await user.type(screen.getByLabelText('Nome completo'), values.name ?? 'Ana Souza');
  await user.type(screen.getByLabelText('E-mail'), values.email ?? 'Ana@Exemplo.com');
  await user.type(screen.getByLabelText('Senha'), values.password ?? 'senha-segura-1');
  await user.type(screen.getByLabelText('CPF'), values.cpf ?? '123.456.789-09');
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Criar conta' }));

afterEach(() => vi.unstubAllGlobals());

describe('RegisterPage', () => {
  it('cadastro aceito: envia o corpo normalizado com Idempotency-Key e confirma o envio do e-mail', async () => {
    const { api, user } = setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeInTheDocument();
    await fill(user);
    await submit(user);

    expect(await screen.findByText(/Abra o e-mail para ativar a conta/)).toBeInTheDocument();
    expect(screen.getByText(/Enviamos um link para/)).toHaveTextContent('ana@exemplo.com');
    const post = api.identityCalls.find((c) => c.method === 'POST');
    expect(post?.path).toBe('/api/identity/users');
    expect(post?.body).toEqual({
      fullName: 'Ana Souza',
      email: 'ana@exemplo.com',
      password: 'senha-segura-1',
      cpf: '12345678909',
    });
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('Reenviar link chama o reenvio e mostra a mensagem neutra', async () => {
    const { api, user } = setup();
    await fill(user);
    await submit(user);
    await user.click(await screen.findByRole('button', { name: 'Reenviar link' }));

    expect(
      await screen.findByText(
        'Se a conta existir e não estiver confirmada, enviamos um novo link.',
      ),
    ).toBeInTheDocument();
    const resend = api.identityCalls.find((c) => c.path === '/api/identity/email-verifications');
    expect(resend?.body).toEqual({ email: 'ana@exemplo.com' });
  });

  it('CPF inválido e senha curta ficam nos campos e nada é enviado', async () => {
    const { api, user } = setup();
    await fill(user, { password: 'curta', cpf: '111.111.111-11' });
    await submit(user);

    expect(await screen.findByText('CPF inválido')).toBeInTheDocument();
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
    expect(api.identityCalls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('e-mail inválido mostra mensagem em português', async () => {
    const { user } = setup();
    await fill(user, { email: 'sem-arroba' });
    await submit(user);
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
  });

  it('409 de e-mail cadastrado aparece no campo de e-mail', async () => {
    const { identity, user } = setup();
    identity.seedUser({ email: 'ana@exemplo.com', cpf: '98765432100' });
    await fill(user);
    await submit(user);

    const email = screen.getByLabelText('E-mail');
    expect(await screen.findByText('Este e-mail já está cadastrado.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/Abra o e-mail/)).not.toBeInTheDocument();
  });

  it('409 de CPF cadastrado aparece no campo de CPF, e reenviar o mesmo corpo reusa a chave', async () => {
    const { api, identity, user } = setup();
    identity.seedUser({ email: 'outra@exemplo.com', cpf: '12345678909' });
    await fill(user);
    await submit(user);

    expect(await screen.findByText('Este CPF já está cadastrado.')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toHaveAttribute('aria-invalid', 'true');

    await submit(user);
    await screen.findByText('Este CPF já está cadastrado.');
    const keys = api.identityCalls
      .filter((c) => c.path === '/api/identity/users')
      .map((c) => c.headers['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
