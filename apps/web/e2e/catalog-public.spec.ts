import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { sellerAuthHeaders } from './identity-support';

// Cabeçalho Bearer do produtor seed, definido no início do teste.
let auth: Record<string, string> = {};

interface Accepted {
  id: string;
  version: number;
  entityId: string;
}

async function command(request: APIRequestContext, path: string, data: unknown): Promise<Accepted> {
  const res = await request.post(path, {
    data,
    headers: { ...auth, 'Idempotency-Key': randomUUID() },
  });
  expect(res.status(), `POST ${path}`).toBe(202);
  return (await res.json()) as Accepted;
}

async function waitForVersion(request: APIRequestContext, path: string, version: number) {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${path}?min_version=${version}`, { headers: auth });
        if (res.status() !== 200) return false;
        return ((await res.json()) as { minVersionReached: boolean }).minVersionReached;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

test('vitrine e página do evento mostram o que foi publicado pela API', async ({
  page,
  request,
}) => {
  auth = await sellerAuthHeaders(request);
  const word = `e2e${randomBytes(4).toString('hex')}`;
  const title = `Show ${word}`;
  const venueName = `Casa ${word}`;

  const venue = await command(request, '/api/catalog/venues', {
    name: venueName,
    address: 'Rua dos Testes, 100 - Centro',
    city: 'São Paulo',
    state: 'SP',
    timeZone: 'America/Sao_Paulo',
  });
  const sector = await command(request, `/api/catalog/venues/${venue.id}/sectors`, {
    name: 'Pista',
    kind: 'general_admission',
    capacity: 100,
  });
  await waitForVersion(request, `/api/catalog/organizer/venues/${venue.id}`, sector.version);

  const event = await command(request, '/api/catalog/events', {
    title,
    description: 'Primeira linha.\nSegunda linha.',
    category: 'show',
    ageRating: 'L',
  });
  // 23:00Z = 20:00 em São Paulo (sem horário de verão).
  const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(23, 0, 0, 0);
  const scheduled = await command(request, `/api/catalog/events/${event.id}/sessions`, {
    venueId: venue.id,
    startsAt: startsAt.toISOString(),
    salesStartsAt: new Date(Date.now() - 60_000).toISOString(),
    timeZone: 'America/Sao_Paulo',
  });
  const eventPath = `/api/catalog/organizer/events/${event.id}`;
  await waitForVersion(request, eventPath, scheduled.version);
  const organizerView = (await (await request.get(eventPath, { headers: auth })).json()) as {
    event: { sessions: Array<{ sectors: Array<{ id: string }> }> };
  };
  const sessionSectorId = organizerView.event.sessions[0]?.sectors[0]?.id;
  expect(sessionSectorId).toBeTruthy();

  const batch = await command(
    request,
    `/api/catalog/events/${event.id}/sessions/${scheduled.entityId}/sectors/${sessionSectorId}/batches`,
    { name: '1º lote', priceCents: 8000 },
  );
  await waitForVersion(request, eventPath, batch.version);
  const published = await command(
    request,
    `/api/catalog/events/${event.id}/sessions/${scheduled.entityId}/publish`,
    {},
  );
  await waitForVersion(request, `/api/catalog/events/${event.id}`, published.version);

  // Vitrine: o card traz título, local, preço e leva à página do evento.
  await page.goto(`/?busca=${word}`);
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(async () => {
    await page.reload();
    await expect(card).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(card).toContainText(venueName);
  await expect(card).toContainText(/A partir de R\$\s80,00/);

  await card.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const [year, month, day] = startsAt.toISOString().slice(0, 10).split('-');
  const session = page.getByRole('region', { name: `Sessão de ${day}/${month}/${year} 20:00` });
  await expect(session).toContainText(venueName);
  await expect(session).toContainText(/Pista.*1º lote: R\$\s80,00/);
  await expect(page.getByText('Segunda linha.')).toBeVisible();
  await expect(page.getByRole('button', { name: /comprar/i })).toHaveCount(0);
});
