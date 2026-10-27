import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

// A projeção é assíncrona: toda espera pelo read model usa o prazo longo.
const PROJECTION = { timeout: 15_000 };

test('produtor cadastra local e evento, publica a sessão e a encontra na vitrine', async ({
  page,
}) => {
  const word = `e2e${randomBytes(4).toString('hex')}`;
  const venueName = `Teatro ${word}`;
  const title = `Peça ${word}`;
  const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const salesDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [year, month, day] = startDate.split('-');
  const sessionName = `Sessão de ${day}/${month}/${year} 20:00`;

  // Local com uma pista e um setor marcado.
  await page.goto('/produtor/locais/novo');
  await expect(page.getByRole('heading', { level: 1, name: 'Novo local' })).toBeVisible();
  await page.getByLabel('Nome do local').fill(venueName);
  await page.getByLabel('Endereço').fill('Rua dos Testes, 100 - Centro');
  await page.getByLabel('Cidade').fill('São Paulo');
  await page.getByLabel('UF').selectOption('SP');
  await page.getByRole('button', { name: 'Cadastrar local' }).click();
  await expect(page.getByRole('heading', { level: 1, name: venueName })).toBeVisible(PROJECTION);

  await page.getByLabel('Nome do setor').fill('Pista');
  await page.getByLabel('Capacidade').fill('100');
  await page.getByRole('button', { name: 'Adicionar setor' }).click();
  await expect(page.getByRole('region', { name: 'Pista', exact: true })).toBeVisible(PROJECTION);

  await page.getByLabel('Nome do setor').fill('Plateia');
  await page.getByLabel('Tipo').selectOption({ label: 'Assento marcado' });
  await page.getByLabel('Rótulo da fila 1').fill('A');
  await page.getByLabel('Assentos da fila 1').fill('5');
  await page.getByRole('button', { name: 'Adicionar setor' }).click();
  await expect(page.getByRole('region', { name: 'Plateia', exact: true })).toBeVisible(PROJECTION);

  // Evento em Rascunho.
  await page.goto('/produtor/eventos/novo');
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Descrição').fill('Criado pelo teste de ponta a ponta.');
  await page.getByLabel('Categoria').selectOption({ label: 'Teatro e espetáculos' });
  await page.getByLabel('Classificação indicativa').selectOption({ label: '14 anos' });
  await page.getByRole('button', { name: 'Criar evento' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible(PROJECTION);

  // Sessão no fuso do local; os setores da planta são copiados.
  await page.getByLabel('Local').selectOption({ label: `${venueName} — São Paulo/SP` });
  await page.getByLabel('Início da sessão').fill(`${startDate}T20:00`);
  await page.getByLabel('Início das vendas').fill(`${salesDate}T00:00`);
  await page.getByRole('button', { name: 'Agendar sessão' }).click();
  const session = page.getByRole('region', { name: sessionName });
  await expect(session).toBeVisible(PROJECTION);
  await expect(session.getByText('Rascunho')).toBeVisible();

  // Um lote por setor.
  for (const [sector, price] of [
    ['Pista', '80,00'],
    ['Plateia', '120,00'],
  ] as const) {
    const section = session.getByRole('region', { name: sector, exact: true });
    await section.getByLabel('Nome do lote').fill('1º lote');
    await section.getByLabel('Preço').fill(price);
    await section.getByRole('button', { name: 'Adicionar lote' }).click();
    await expect(section.getByRole('button', { name: 'Remover lote 1º lote' })).toBeVisible(
      PROJECTION,
    );
  }

  // Publicação.
  await session.getByRole('button', { name: 'Publicar sessão' }).click();
  await expect(session.getByText('Publicada')).toBeVisible(PROJECTION);
  await expect(session.getByText('Vigente').first()).toBeVisible();

  // Vitrine: busca pelo título único e abre a página pública.
  await page.goto('/');
  await page.getByLabel('Buscar por título').fill(word);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(async () => {
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(card).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await card.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/1º lote: R\$\s80,00/)).toBeVisible();
});
