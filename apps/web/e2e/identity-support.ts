import { randomBytes, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@stubb.local',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'stubb-admin-dev',
};
export const SEED_ORGANIZER = {
  email: process.env.E2E_ORGANIZER_EMAIL ?? 'produtor@stubb.local',
  password: process.env.E2E_ORGANIZER_PASSWORD ?? 'stubb-produtor-dev',
};
export const PASSWORD = 'senha-de-teste-123';
export const CNPJ = '11.222.333/0001-81';

export const uniqueEmail = () => `pw-${randomUUID()}@stubb.local`;

function cpfDigit(digits: number[]): number {
  const factor = digits.length + 1;
  const sum = digits.reduce((acc, d, i) => acc + d * (factor - i), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

export function randomCpf(): string {
  for (;;) {
    const base = Array.from(randomBytes(9), (byte) => byte % 10);
    if (new Set(base).size === 1) continue;
    const d1 = cpfDigit(base);
    const d2 = cpfDigit([...base, d1]);
    return [...base, d1, d2].join('');
  }
}

interface MailMessage {
  ID: string;
  To: { Address: string }[];
}

/** Espera o e-mail enviado ao endereço e devolve o token do link de verificação. */
export async function waitForToken(request: APIRequestContext, email: string): Promise<string> {
  let token = '';
  await expect(async () => {
    const list = await request.get(`${MAILPIT_URL}/api/v1/messages?limit=200`);
    expect(list.ok()).toBe(true);
    const { messages } = (await list.json()) as { messages: MailMessage[] };
    const mail = messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email));
    expect(mail).toBeDefined();
    const detail = await request.get(`${MAILPIT_URL}/api/v1/message/${mail?.ID}`);
    const { Text } = (await detail.json()) as { Text: string };
    const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(Text);
    expect(match).not.toBeNull();
    token = match?.[1] ?? '';
  }).toPass({ timeout: 15_000 });
  return token;
}

/** Cadastra e confirma o e-mail pela API (atalho; o fluxo pela UI tem o próprio teste). */
export async function createVerifiedUser(
  request: APIRequestContext,
): Promise<{ email: string; password: string; fullName: string }> {
  const email = uniqueEmail();
  const fullName = 'Pessoa Playwright';
  const created = await request.post('/api/identity/users', {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { fullName, email, password: PASSWORD, cpf: randomCpf() },
  });
  expect(created.status()).toBe(202);
  const token = await waitForToken(request, email);
  const confirmed = await request.post('/api/identity/email-verifications/confirm', {
    data: { token },
  });
  expect(confirmed.status()).toBe(202);
  return { email, password: PASSWORD, fullName };
}

/** Bearer do produtor seed, obtido pela API (para specs que preparam dados sem a UI). */
export async function sellerAuthHeaders(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  const res = await request.post('/api/identity/session', { data: SEED_ORGANIZER });
  expect(res.status()).toBe(200);
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

/** Login pela tela; espera o cabeçalho autenticado. */
export async function loginViaUi(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(credentials.email);
  await page.getByLabel('Senha').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Minha conta' })).toBeVisible();
}

export async function submitOrganizerRequest(page: Page, organization: string): Promise<void> {
  await page.goto('/conta');
  await page.getByLabel('Nome da organização').fill(organization);
  await page.getByLabel('CNPJ').fill(CNPJ);
  await page.getByLabel('Motivo').fill('Quero vender ingressos dos meus eventos.');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText('Seu pedido está em análise')).toBeVisible();
}
