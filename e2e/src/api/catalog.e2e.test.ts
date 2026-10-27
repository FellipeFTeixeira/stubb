import { randomUUID } from 'node:crypto';
import {
  CATALOG_TOPIC,
  CatalogDomainEventSchema,
  DomainErrorResponseSchema,
  GetEventResponseSchema,
  GetOrganizerEventResponseSchema,
  GetVenueResponseSchema,
  ListEventsResponseSchema,
  ListOrganizerEventsResponseSchema,
  ListVenuesResponseSchema,
  ReadNotFoundResponseSchema,
  ValidationErrorResponseSchema,
  catalogRoutes,
  type CommandAccepted,
} from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import {
  accept,
  addBatch,
  createEvent,
  createPublishedEvent,
  createVenueWithPlan,
  publishSession,
  readMissingAt,
  readOrganizerEventAt,
  readPublicEventAt,
  readVenueAt,
  scheduleSession,
  send,
  sessionSectorIds,
  uniqueWord,
} from '../support/catalog.ts';
import { query } from '../support/db.ts';
import { api } from '../support/http.ts';
import { collectMessages } from '../support/kafka.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A vitrine não tem `min_version`: repete a leitura até a condição valer. */
async function listUntil(word: string, done: (titles: string[]) => boolean): Promise<string[]> {
  const deadline = Date.now() + 30000;
  for (;;) {
    const res = await api('GET', `${catalogRoutes.events}?q=${word}`);
    expect(res.status).toBe(200);
    const titles = ListEventsResponseSchema.parse(res.body).items.map((item) => item.title);
    if (done(titles)) return titles;
    if (Date.now() > deadline) throw new Error(`vitrine não convergiu para "${word}"`);
    await sleep(250);
  }
}

describe('catalog via gateway', () => {
  it('CA-51: fluxo completo de cadastro, publicação, edição do local e descarte', async () => {
    const word = uniqueWord();
    const venue = await createVenueWithPlan({ name: `Teatro ${word}` });

    // Rascunho: aparece ao produtor, não à vitrine nem à rota pública.
    const event = await createEvent({ title: `Peça ${word}` });
    const owner = GetOrganizerEventResponseSchema.parse(
      await readOrganizerEventAt(event.id, event.version),
    );
    expect(owner.event.status).toBe('draft');
    const hidden = await api('GET', catalogRoutes.event(event.id));
    expect(hidden.status).toBe(404);
    ReadNotFoundResponseSchema.parse(hidden.body);
    expect(await listUntil(word, () => true)).toEqual([]);

    // Sessão, setores e lotes.
    const session = await scheduleSession(event.id, venue);
    const sectors = await sessionSectorIds(event.id, session.sessionId, session.version);
    expect(Object.keys(sectors).sort()).toEqual(['Pista', 'Plateia']);
    const pista = sectors.Pista as string;
    const plateia = sectors.Plateia as string;

    const removed = await accept(
      'DELETE',
      catalogRoutes.sessionSector(event.id, session.sessionId, plateia),
    );
    const afterRemoval = await readOrganizerEventAt(event.id, removed.version);
    expect(afterRemoval.event.sessions[0]?.sectors.map((s) => s.name)).toEqual(['Pista']);

    const readded = await accept(
      'POST',
      catalogRoutes.sessionSectors(event.id, session.sessionId),
      {
        venueSectorId: venue.seatedSectorId,
      },
    );
    await readOrganizerEventAt(event.id, readded.version);
    const readdedSectors = await sessionSectorIds(event.id, session.sessionId, readded.version);
    const plateiaId = readdedSectors.Plateia as string;

    const first = await addBatch(event.id, session.sessionId, pista, {
      name: '1º lote',
      priceCents: 8000,
      quantity: 40,
    });
    await addBatch(event.id, session.sessionId, pista, { name: '2º lote', priceCents: 10000 });
    const stray = await addBatch(event.id, session.sessionId, plateiaId, {
      name: 'Lote errado',
      priceCents: 9999,
    });
    const afterStray = await accept(
      'DELETE',
      catalogRoutes.batch(event.id, session.sessionId, plateiaId, stray.entityId),
    );
    await readOrganizerEventAt(event.id, afterStray.version);
    await addBatch(event.id, session.sessionId, plateiaId, {
      name: 'Lote único',
      priceCents: 12000,
    });
    expect(first.entityId).toBeTruthy();

    // Publicação: a vitrine passa a listar e a página pública responde com o lote vigente.
    const published = await publishSession(event.id, session.sessionId);
    const page = GetEventResponseSchema.parse(await readPublicEventAt(event.id, published.version));
    expect(page.event.title).toBe(`Peça ${word}`);
    const publicSession = page.event.sessions[0];
    expect(publicSession?.venue.name).toBe(`Teatro ${word}`);
    const pistaView = publicSession?.sectors.find((s) => s.name === 'Pista');
    expect(pistaView?.sales).toEqual({
      status: 'open',
      batch: { name: '1º lote', priceCents: 8000 },
    });

    const titles = await listUntil(word, (found) => found.length > 0);
    expect(titles).toEqual([`Peça ${word}`]);
    const listed = ListEventsResponseSchema.parse(
      (await api('GET', `${catalogRoutes.events}?q=${word}`)).body,
    );
    expect(listed.items[0]?.price).toEqual({ kind: 'from', priceCents: 8000 });

    // O local aparece nas leituras do produtor.
    const venues = ListVenuesResponseSchema.parse(
      (await api('GET', catalogRoutes.organizerVenues)).body,
    );
    expect(venues.items.map((v) => v.id)).toContain(venue.id);
    const venueView = GetVenueResponseSchema.parse(await readVenueAt(venue.id, venue.version));
    expect(venueView.venue.sectors.map((s) => s.capacity).sort((a, b) => a - b)).toEqual([10, 100]);

    // Edição do local: a página pública reflete o novo nome por fan-out.
    const edited = await accept('PATCH', catalogRoutes.venue(venue.id), {
      ...venue.details,
      name: `Teatro Novo ${word}`,
      expectedVersion: venue.version,
    });
    await readVenueAt(venue.id, edited.version);
    const deadline = Date.now() + 30000;
    for (;;) {
      const res = await api('GET', catalogRoutes.event(event.id));
      if (
        res.status === 200 &&
        GetEventResponseSchema.parse(res.body).event.sessions[0]?.venue.name ===
          `Teatro Novo ${word}`
      ) {
        break;
      }
      if (Date.now() > deadline) throw new Error('edição do local não chegou à página');
      await sleep(250);
    }

    // Descarte de um rascunho.
    const draft = await createEvent({ title: `Rascunho ${word}` });
    const discarded = await accept('DELETE', catalogRoutes.event(draft.id));
    await readMissingAt(catalogRoutes.organizerEvent(draft.id), discarded.version);
    const gone = await api('GET', catalogRoutes.event(draft.id));
    expect(gone.status).toBe(404);
    const mine = ListOrganizerEventsResponseSchema.parse(
      (await api('GET', `${catalogRoutes.organizerEvents}?pageSize=48`)).body,
    );
    expect(mine.items.map((item) => item.id)).not.toContain(draft.id);
    expect(mine.items.map((item) => item.id)).toContain(event.id);
  });

  it('CA-25: eventos do Catalog no Kafka com key = agregado, headers e ordem por versão', async () => {
    const built = await createPublishedEvent();
    const aggregateIds = [built.venue.id, built.event.id];

    const outboxVersions = async (id: string) =>
      (
        await query<{ aggregate_version: string }>(
          'SELECT aggregate_version FROM outbox WHERE aggregate_id = $1 ORDER BY aggregate_version',
          [id],
        )
      ).map((row) => Number(row.aggregate_version));
    const expected = new Map<string, number[]>();
    for (const id of aggregateIds) expected.set(id, await outboxVersions(id));

    const messages = await collectMessages(
      (all) =>
        aggregateIds.every(
          (id) => all.filter((m) => m.key === id).length >= (expected.get(id)?.length ?? 0),
        ),
      30000,
      CATALOG_TOPIC,
    );

    for (const id of aggregateIds) {
      const mine = messages.filter((m) => m.key === id).sort((a, b) => a.offset - b.offset);
      expect(mine.length).toBe(expected.get(id)?.length);
      expect(new Set(mine.map((m) => m.partition)).size).toBe(1);
      const parsed = mine.map((m) => CatalogDomainEventSchema.parse(JSON.parse(m.value)));
      expect(parsed.map((e) => e.aggregateVersion)).toEqual(expected.get(id));
      mine.forEach((m, i) => {
        expect(m.headers.eventId).toBe(parsed[i]?.eventId);
        expect(m.headers.eventType).toBe(parsed[i]?.eventType);
        expect(parsed[i]?.aggregateId).toBe(id);
      });
    }
    // Agregados diferentes não precisam compartilhar partição; a ordem só vale dentro de cada um.
    expect(aggregateIds).toHaveLength(2);
  });

  it('CA-23: PATCH e DELETE são idempotentes pela chave', async () => {
    const event = await createEvent();
    const key = randomUUID();
    const body = { ...event.details, title: `Editado ${uniqueWord()}`, expectedVersion: 1 };
    const first = await send<CommandAccepted>('PATCH', catalogRoutes.event(event.id), body, key);
    const again = await send<CommandAccepted>('PATCH', catalogRoutes.event(event.id), body, key);
    expect(first.status).toBe(202);
    expect(again.status).toBe(202);
    expect(again.body).toEqual(first.body);
    const rows = await query('SELECT 1 FROM outbox WHERE aggregate_id = $1', [event.id]);
    expect(rows).toHaveLength(2);

    const mismatch = await send(
      'PATCH',
      catalogRoutes.event(event.id),
      { ...body, title: 'Outro' },
      key,
    );
    expect(mismatch.status).toBe(422);
    expect(DomainErrorResponseSchema.parse(mismatch.body).code).toBe('IDEMPOTENCY_KEY_MISMATCH');

    const noKey = await api('PATCH', catalogRoutes.event(event.id), { body });
    expect(noKey.status).toBe(400);
    expect(DomainErrorResponseSchema.parse(noKey.body).code).toBe('IDEMPOTENCY_KEY_INVALID');

    const discardKey = randomUUID();
    const discard1 = await send<CommandAccepted>(
      'DELETE',
      catalogRoutes.event(event.id),
      undefined,
      discardKey,
    );
    const discard2 = await send<CommandAccepted>(
      'DELETE',
      catalogRoutes.event(event.id),
      undefined,
      discardKey,
    );
    expect(discard1.status).toBe(202);
    expect(discard2).toMatchObject({ status: 202, body: discard1.body });
    const afterDiscard = await query('SELECT 1 FROM outbox WHERE aggregate_id = $1', [event.id]);
    expect(afterDiscard).toHaveLength(3);

    const other = await createEvent();
    const mismatchDelete = await send(
      'DELETE',
      catalogRoutes.event(other.id),
      undefined,
      discardKey,
    );
    expect(mismatchDelete.status).toBe(422);
    expect(DomainErrorResponseSchema.parse(mismatchDelete.body).code).toBe(
      'IDEMPOTENCY_KEY_MISMATCH',
    );
  });

  it('CA-24: erros de command seguem o contrato (400, 404, 409, 422)', async () => {
    const venue = await createVenueWithPlan();

    const invalid = await send('POST', catalogRoutes.venues, { name: '' });
    expect(invalid.status).toBe(400);
    const validation = ValidationErrorResponseSchema.parse(invalid.body);
    expect(validation.issues.map((i) => i.path)).toContain('name');

    const duplicate = await send('POST', catalogRoutes.venueSectors(venue.id), {
      name: 'pista',
      kind: 'general_admission',
      capacity: 10,
    });
    expect(duplicate.status).toBe(422);
    expect(DomainErrorResponseSchema.parse(duplicate.body).code).toBe('VENUE_SECTOR_NAME_TAKEN');

    const missing = await send('PATCH', catalogRoutes.event(randomUUID()), {
      ...(await createEvent()).details,
      expectedVersion: 1,
    });
    expect(missing.status).toBe(404);
    expect(DomainErrorResponseSchema.parse(missing.body).code).toBe('AGGREGATE_NOT_FOUND');

    const event = await createEvent();
    const stale = await send('PATCH', catalogRoutes.event(event.id), {
      ...event.details,
      expectedVersion: 7,
    });
    expect(stale.status).toBe(409);
    expect(DomainErrorResponseSchema.parse(stale.body).code).toBe('CONCURRENCY_CONFLICT');
  });
});
