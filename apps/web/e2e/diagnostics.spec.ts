import { expect, test } from '@playwright/test';

test('cria, incrementa e navega pelo histórico de latências', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('create-ping-label-input').fill('teste e2e');
  await page.getByTestId('create-ping-submit').click();
  await expect(page.getByTestId('ping-count')).toHaveText('0');
  await expect(page.getByTestId('ping-version')).toHaveText('1');
  await expect(page.getByTestId('ping-sync-status')).toHaveText('sincronizado');
  await expect(page.getByTestId('ping-label')).toHaveText('teste e2e');

  await page.getByTestId('increment-ping').click();
  await expect(page.getByTestId('ping-count')).toHaveText('1');
  await expect(page.getByTestId('ping-version')).toHaveText('2');
  await expect(page.getByTestId('ping-sync-status')).toHaveText('sincronizado');

  const entries = page.getByTestId('latency-entry');
  await expect(entries).toHaveCount(2);
  const firstPingId = await entries.first().getAttribute('data-ping-id');
  expect(firstPingId).toBeTruthy();

  await page.getByTestId('create-ping-label-input').fill('segundo ping');
  await page.getByTestId('create-ping-submit').click();
  await expect(page.getByTestId('ping-label')).toHaveText('segundo ping');
  await expect(page.getByTestId('ping-sync-status')).toHaveText('sincronizado');
  await expect(entries).toHaveCount(3);

  await page
    .locator(`[data-testid="latency-entry"][data-ping-id="${firstPingId}"]`)
    .first()
    .click();
  await expect(page.getByTestId('ping-label')).toHaveText('teste e2e');
});
