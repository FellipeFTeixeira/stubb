import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  PASSWORD,
  createVerifiedUser,
  loginViaUi,
  randomCpf,
  submitOrganizerRequest,
  uniqueEmail,
  waitForToken,
} from './identity-support';

const word = () => `Org${randomBytes(4).toString('hex')}`;

test('cadastro, verificação por e-mail, login e cabeçalho', async ({ page, request }) => {
  const email = uniqueEmail();
  await page.goto('/cadastro');
  await page.getByLabel('Nome completo').fill('Maria Playwright');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByLabel('CPF').fill(randomCpf());
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Abra o e-mail para ativar a conta')).toBeVisible();

  const token = await waitForToken(request, email);
  await page.goto(`/verificar-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();

  await loginViaUi(page, { email, password: PASSWORD });
  await expect(page.getByTestId('session-name')).toHaveText('Maria Playwright');
  await expect(page.getByRole('link', { name: 'Área do produtor' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Administração' })).toHaveCount(0);
});

test('login antes de verificar o e-mail oferece o reenvio', async ({ page, request }) => {
  const email = uniqueEmail();
  const created = await request.post('/api/identity/users', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { fullName: 'Sem Verificar', email, password: PASSWORD, cpf: randomCpf() },
  });
  expect(created.status()).toBe(202);

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Confirme seu e-mail antes de entrar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reenviar link' })).toBeVisible();
});

test('reload mantém a sessão sem token no storage e logout encerra', async ({ page, request }) => {
  const user = await createVerifiedUser(request);
  await loginViaUi(page, user);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Minha conta' })).toBeVisible();
  await expect(page.getByTestId('session-name')).toHaveText(user.fullName);

  const stored = await page.evaluate(() => [
    ...Object.entries(localStorage),
    ...Object.entries(sessionStorage),
  ]);
  expect(JSON.stringify(stored)).not.toMatch(/eyJ/);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Minha conta' })).toHaveCount(0);
});

test('guards: anônimo vai ao login, cliente não acessa produtor nem admin', async ({
  page,
  request,
}) => {
  await page.goto('/produtor/eventos');
  await expect(page).toHaveURL(/\/entrar\?redirect=/);
  await page.goto('/conta');
  await expect(page).toHaveURL(/\/entrar\?redirect=/);
  await page.goto('/admin/produtores');
  await expect(page).toHaveURL(/\/entrar\?redirect=/);

  const user = await createVerifiedUser(request);
  await loginViaUi(page, user);
  await page.goto('/produtor/eventos');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  await page.goto('/admin/produtores');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
});

test('pedido de produtor aprovado pelo admin libera a área do produtor', async ({
  page,
  request,
  browser,
}) => {
  const user = await createVerifiedUser(request);
  const organization = word();
  await loginViaUi(page, user);
  await submitOrganizerRequest(page, organization);
  await expect(page.getByRole('link', { name: 'Área do produtor' })).toHaveCount(0);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaUi(adminPage, ADMIN);
  await adminPage.goto('/admin/produtores');
  const card = adminPage.locator('[data-slot="card"]').filter({ hasText: organization });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Aprovar' }).click();
  await expect(card).toHaveCount(0);
  await adminContext.close();

  // A tela do solicitante atualiza sozinha; o novo papel entra no próximo refresh do token.
  await expect(page.getByText('Aprovado').first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Área do produtor' }).first()).toBeVisible();
});

test('recusa com mensagem aparece para o solicitante', async ({ page, request, browser }) => {
  const user = await createVerifiedUser(request);
  const organization = word();
  await loginViaUi(page, user);
  await submitOrganizerRequest(page, organization);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaUi(adminPage, ADMIN);
  await adminPage.goto('/admin/produtores');
  const card = adminPage.locator('[data-slot="card"]').filter({ hasText: organization });
  await card.getByRole('button', { name: 'Recusar' }).click();
  await adminPage.getByLabel('Mensagem (opcional)').fill('CNPJ sem eventos comprovados.');
  await adminPage.getByRole('button', { name: 'Confirmar recusa' }).click();
  await expect(card).toHaveCount(0);
  await adminContext.close();

  await page.reload();
  await expect(page.getByText('Recusado').first()).toBeVisible();
  await expect(page.getByText('CNPJ sem eventos comprovados.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Área do produtor' })).toHaveCount(0);
});
