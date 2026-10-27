import { v7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { CatalogEvent } from '../../../src/catalog/domain/catalog-event.aggregate.js';
import { Venue } from '../../../src/catalog/domain/venue.aggregate.js';
import { BusinessRuleViolationError, EntityNotFoundError } from '../../../src/shared/errors.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const STARTS_AT = new Date('2026-12-10T23:00:00.000Z');
const SALES_AT = new Date('2026-11-02T12:00:00.000Z');
const TZ = 'America/Sao_Paulo';
const DETAILS = {
  title: 'Hamlet',
  description: 'Tragédia',
  category: 'theater',
  ageRating: '14',
  imageUrl: null,
};

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof BusinessRuleViolationError) return error.code;
    throw error;
  }
  return undefined;
}

function newVenue(): Venue {
  const venue = Venue.register(
    v7(),
    v7(),
    { name: 'Teatro', address: 'Rua 1', city: 'São Paulo', state: 'SP', timeZone: TZ },
    NOW,
  );
  venue.addSector({ id: v7(), name: 'Pista', kind: 'general_admission', capacity: 200 }, NOW);
  venue.addSector(
    {
      id: v7(),
      name: 'Plateia',
      kind: 'seated',
      rows: [
        { label: 'A', seats: 10 },
        { label: 'B', seats: 10 },
      ],
    },
    NOW,
  );
  venue.uncommit();
  return venue;
}

function newEvent(): CatalogEvent {
  const event = CatalogEvent.create(v7(), v7(), DETAILS, NOW);
  event.uncommit();
  return event;
}

function schedule(
  event: CatalogEvent,
  venue: Venue,
  overrides: { startsAt?: Date; timeZone?: string } = {},
): string {
  const sessionId = v7();
  event.scheduleSession(
    {
      sessionId,
      venue,
      startsAt: overrides.startsAt ?? STARTS_AT,
      salesStartsAt: SALES_AT,
      timeZone: overrides.timeZone ?? venue.timeZone,
      sectorIds: venue.sectors.map(() => v7()),
    },
    NOW,
  );
  return sessionId;
}

function batch(name: string, extra: { quantity?: number | null; endsAt?: Date | null } = {}) {
  return {
    name,
    priceCents: 5000,
    quantity: extra.quantity ?? null,
    endsAt: extra.endsAt ?? null,
  };
}

function firstSectorId(event: CatalogEvent, sessionId: string): string {
  const sector = event.sessions.find((s) => s.id === sessionId)?.sectors[0];
  if (!sector) throw new Error('no sector');
  return sector.id;
}

function addBatch(event: CatalogEvent, sessionId: string, sectorId: string, input = batch('Lote')) {
  event.addBatch(sessionId, sectorId, input, v7(), NOW);
}

describe('CatalogEvent: dados do evento (CA-10, CA-11, CA-20)', () => {
  it('create: Rascunho, versão 1, um evento EventCreated', () => {
    const event = CatalogEvent.create(v7(), 'org', DETAILS, NOW);
    expect(event.status).toBe('draft');
    expect(event.version).toBe(1);
    expect(event.getUncommittedEvents()).toMatchObject([
      { type: 'EventCreated', aggregateVersion: 1, details: { imageUrl: null } },
    ]);
  });

  it('updateDetails: versão + 1 e imageUrl nulo remove a imagem', () => {
    const event = newEvent();
    event.updateDetails({ ...DETAILS, title: 'Novo', imageUrl: 'https://x.test/a.png' }, NOW);
    event.updateDetails({ ...DETAILS, title: 'Novo', imageUrl: null }, NOW);
    expect(event.version).toBe(3);
    expect(event.details.imageUrl).toBeNull();
  });

  it('discard: só em Rascunho; publicado viola EVENT_NOT_DRAFT', () => {
    const draft = newEvent();
    draft.discard(NOW);
    expect(draft.getUncommittedEvents()).toMatchObject([
      { type: 'EventDiscarded', aggregateVersion: 2 },
    ]);

    const venue = newVenue();
    const published = newEvent();
    const sessionId = schedule(published, venue);
    for (const sector of published.sessions[0]?.sectors ?? []) {
      addBatch(published, sessionId, sector.id);
    }
    published.publishSession(sessionId, NOW);
    expect(codeOf(() => published.discard(NOW))).toBe('EVENT_NOT_DRAFT');
  });
});

describe('CatalogEvent: agendar sessão (CA-12, CA-13)', () => {
  it('copia todos os setores da planta (IDs novos, mesma ordem) e o fuso do local', () => {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = schedule(event, venue);
    const session = event.sessions[0];
    expect(session).toMatchObject({ id: sessionId, status: 'draft', timeZone: TZ });
    expect(session?.sectors.map((s) => s.name)).toEqual(['Pista', 'Plateia']);
    expect(session?.sectors.map((s) => s.venueSectorId)).toEqual(venue.sectors.map((s) => s.id));
    expect(session?.sectors.every((s) => s.batches.length === 0)).toBe(true);
    expect(event.version).toBe(2);
    expect(event.getUncommittedEvents()).toMatchObject([
      { type: 'SessionScheduled', aggregateVersion: 2 },
    ]);
  });

  it('fuso diferente do atual do local viola VENUE_TIME_ZONE_CHANGED', () => {
    expect(codeOf(() => schedule(newEvent(), newVenue(), { timeZone: 'America/Manaus' }))).toBe(
      'VENUE_TIME_ZONE_CHANGED',
    );
  });

  it('local sem setores viola VENUE_WITHOUT_SECTORS', () => {
    const empty = Venue.register(
      v7(),
      v7(),
      { name: 'V', address: 'a', city: 'c', state: 'SP', timeZone: TZ },
      NOW,
    );
    expect(codeOf(() => schedule(newEvent(), empty))).toBe('VENUE_WITHOUT_SECTORS');
  });

  it('startsAt no passado (ou igual a agora) viola SESSION_START_NOT_IN_FUTURE', () => {
    expect(codeOf(() => schedule(newEvent(), newVenue(), { startsAt: NOW }))).toBe(
      'SESSION_START_NOT_IN_FUTURE',
    );
  });

  it('mesmo local e mesmo startsAt viola SESSION_DUPLICATED; outro local ou horário passa', () => {
    const event = newEvent();
    const venue = newVenue();
    schedule(event, venue);
    expect(codeOf(() => schedule(event, venue))).toBe('SESSION_DUPLICATED');
    schedule(event, newVenue());
    schedule(event, venue, { startsAt: new Date('2026-12-11T23:00:00.000Z') });
    expect(event.sessions).toHaveLength(3);
  });

  it('a 51ª sessão viola SESSION_LIMIT_REACHED', () => {
    const event = newEvent();
    const venue = newVenue();
    for (let day = 0; day < 50; day += 1) {
      schedule(event, venue, { startsAt: new Date(Date.UTC(2027, 0, 1 + day, 20)) });
    }
    expect(
      codeOf(() => schedule(event, venue, { startsAt: new Date('2028-01-01T20:00:00Z') })),
    ).toBe('SESSION_LIMIT_REACHED');
  });

  it('a ordem das checagens: fuso, planta vazia, limite, passado, duplicada', () => {
    const empty = Venue.register(
      v7(),
      v7(),
      { name: 'V', address: 'a', city: 'c', state: 'SP', timeZone: TZ },
      NOW,
    );
    expect(
      codeOf(() => schedule(newEvent(), empty, { timeZone: 'America/Manaus', startsAt: NOW })),
    ).toBe('VENUE_TIME_ZONE_CHANGED');
    expect(codeOf(() => schedule(newEvent(), empty, { startsAt: NOW }))).toBe(
      'VENUE_WITHOUT_SECTORS',
    );
  });
});

describe('CatalogEvent: setores da sessão (CA-14)', () => {
  it('remover leva os lotes junto; adicionar de novo cria cópia com ID novo e posição da planta', () => {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = schedule(event, venue);
    const [pista, plateia] = event.sessions[0]?.sectors ?? [];
    if (!pista || !plateia) throw new Error('sectors');
    addBatch(event, sessionId, pista.id);

    event.removeSessionSector(sessionId, pista.id, NOW);
    expect(event.sessions[0]?.sectors.map((s) => s.name)).toEqual(['Plateia']);

    const newId = v7();
    event.addSessionSector(sessionId, venue, pista.venueSectorId, newId, NOW);
    const copy = event.sessions[0]?.sectors.find((s) => s.id === newId);
    expect(copy).toMatchObject({ venueSectorId: pista.venueSectorId, position: 1, batches: [] });
    expect(newId).not.toBe(pista.id);
    expect(event.sessions[0]?.sectors.map((s) => s.name)).toEqual(['Pista', 'Plateia']);
  });

  it('adicionar setor já presente viola SESSION_SECTOR_ALREADY_PRESENT', () => {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = schedule(event, venue);
    const plateia = event.sessions[0]?.sectors[1];
    expect(
      codeOf(() =>
        event.addSessionSector(sessionId, venue, plateia?.venueSectorId ?? '', v7(), NOW),
      ),
    ).toBe('SESSION_SECTOR_ALREADY_PRESENT');
  });

  it('setor de outro local viola VENUE_SECTOR_NOT_FOUND', () => {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = schedule(event, venue);
    const other = newVenue();
    expect(
      codeOf(() => event.addSessionSector(sessionId, venue, other.sectors[0]?.id ?? '', v7(), NOW)),
    ).toBe('VENUE_SECTOR_NOT_FOUND');
  });

  it('setor da planta com nome igual (outra origem) viola SESSION_SECTOR_NAME_TAKEN', () => {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = schedule(event, venue);
    // Remove o setor da planta e o recadastra com outro ID e o mesmo nome: a sessão ainda tem a cópia antiga.
    const old = venue.sectors[0];
    if (!old) throw new Error('sector');
    venue.removeSector(old.id, NOW);
    const replacement = {
      id: v7(),
      name: 'pista',
      kind: 'general_admission' as const,
      capacity: 50,
    };
    venue.addSector(replacement, NOW);
    expect(codeOf(() => event.addSessionSector(sessionId, venue, replacement.id, v7(), NOW))).toBe(
      'SESSION_SECTOR_NAME_TAKEN',
    );
  });
});

describe('CatalogEvent: lotes (CA-15)', () => {
  function setup() {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = schedule(event, venue);
    return { event, sessionId, sectorId: firstSectorId(event, sessionId) };
  }

  it('aceita lote com quantity e lote final sem limite; posição crescente', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('1º', { quantity: 100 }));
    addBatch(event, sessionId, sectorId, batch('2º'));
    expect(event.sessions[0]?.sectors[0]?.batches.map((b) => b.position)).toEqual([1, 2]);
  });

  it('lote depois de um sem quantity nem endsAt viola PREVIOUS_BATCH_UNBOUNDED', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('1º', { quantity: 100 }));
    addBatch(event, sessionId, sectorId, batch('2º'));
    expect(codeOf(() => addBatch(event, sessionId, sectorId, batch('3º')))).toBe(
      'PREVIOUS_BATCH_UNBOUNDED',
    );
  });

  it('nome repetido sem diferenciar maiúsculas viola BATCH_NAME_TAKEN', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('Meia', { quantity: 10 }));
    expect(codeOf(() => addBatch(event, sessionId, sectorId, batch(' MEIA ')))).toBe(
      'BATCH_NAME_TAKEN',
    );
  });

  it('soma das quantity acima da capacidade viola BATCH_QUANTITY_EXCEEDS_CAPACITY', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('1º', { quantity: 100 }));
    expect(codeOf(() => addBatch(event, sessionId, sectorId, batch('2º', { quantity: 101 })))).toBe(
      'BATCH_QUANTITY_EXCEEDS_CAPACITY',
    );
    addBatch(event, sessionId, sectorId, batch('2º', { quantity: 100 }));
  });

  it('capacidade do setor marcado é a soma dos assentos', () => {
    const { event, sessionId } = setup();
    const plateia = event.sessions[0]?.sectors[1];
    if (!plateia) throw new Error('sector');
    expect(codeOf(() => addBatch(event, sessionId, plateia.id, batch('X', { quantity: 21 })))).toBe(
      'BATCH_QUANTITY_EXCEEDS_CAPACITY',
    );
    addBatch(event, sessionId, plateia.id, batch('X', { quantity: 20 }));
  });

  it('endsAt fora do intervalo (depois do início ou antes das vendas) viola BATCH_END_OUT_OF_RANGE', () => {
    const { event, sessionId, sectorId } = setup();
    expect(
      codeOf(() =>
        addBatch(
          event,
          sessionId,
          sectorId,
          batch('A', { endsAt: new Date('2026-12-11T00:00:00Z') }),
        ),
      ),
    ).toBe('BATCH_END_OUT_OF_RANGE');
    expect(
      codeOf(() => addBatch(event, sessionId, sectorId, batch('A', { endsAt: SALES_AT }))),
    ).toBe('BATCH_END_OUT_OF_RANGE');
  });

  it('endsAt não posterior ao de um lote anterior viola BATCH_END_BEFORE_PREVIOUS', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('A', { endsAt: new Date('2026-12-01T00:00:00Z') }));
    expect(
      codeOf(() =>
        addBatch(
          event,
          sessionId,
          sectorId,
          batch('B', { endsAt: new Date('2026-12-01T00:00:00Z') }),
        ),
      ),
    ).toBe('BATCH_END_BEFORE_PREVIOUS');
    addBatch(event, sessionId, sectorId, batch('B', { endsAt: new Date('2026-12-02T00:00:00Z') }));
  });

  it('o 11º lote viola BATCH_LIMIT_REACHED', () => {
    const { event, sessionId, sectorId } = setup();
    for (let i = 1; i <= 10; i += 1) {
      addBatch(event, sessionId, sectorId, batch(`Lote ${i}`, { quantity: 1 }));
    }
    expect(codeOf(() => addBatch(event, sessionId, sectorId, batch('Lote 11')))).toBe(
      'BATCH_LIMIT_REACHED',
    );
  });

  it('a ordem das checagens: limite, nome, quantidade, intervalo, anterior, ilimitado', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('A'));
    // 'A' é ilimitado, mas o nome repetido é reportado antes de PREVIOUS_BATCH_UNBOUNDED.
    expect(codeOf(() => addBatch(event, sessionId, sectorId, batch('a')))).toBe('BATCH_NAME_TAKEN');
  });

  it('remover lote libera a posição e o nome', () => {
    const { event, sessionId, sectorId } = setup();
    addBatch(event, sessionId, sectorId, batch('A', { quantity: 5 }));
    const id = event.sessions[0]?.sectors[0]?.batches[0]?.id ?? '';
    event.removeBatch(sessionId, sectorId, id, NOW);
    expect(event.sessions[0]?.sectors[0]?.batches).toHaveLength(0);
    addBatch(event, sessionId, sectorId, batch('A', { quantity: 5 }));
    expect(event.sessions[0]?.sectors[0]?.batches[0]?.position).toBe(1);
  });
});

describe('CatalogEvent: remoções e inexistentes (CA-16)', () => {
  it('RemoveSession tira a sessão e emite SessionRemoved; inexistente é EntityNotFoundError', () => {
    const event = newEvent();
    const sessionId = schedule(event, newVenue());
    event.uncommit();
    event.removeSession(sessionId, NOW);
    expect(event.sessions).toHaveLength(0);
    expect(event.getUncommittedEvents()).toMatchObject([{ type: 'SessionRemoved' }]);
    expect(() => event.removeSession(sessionId, NOW)).toThrow(EntityNotFoundError);
  });

  it('sessão, setor e lote inexistentes são EntityNotFoundError', () => {
    const event = newEvent();
    const sessionId = schedule(event, newVenue());
    const sectorId = firstSectorId(event, sessionId);
    expect(() => event.removeSessionSector(v7(), sectorId, NOW)).toThrow(EntityNotFoundError);
    expect(() => event.removeSessionSector(sessionId, v7(), NOW)).toThrow(EntityNotFoundError);
    expect(() => event.removeBatch(sessionId, sectorId, v7(), NOW)).toThrow(EntityNotFoundError);
    expect(() => event.addBatch(sessionId, v7(), batch('A'), v7(), NOW)).toThrow(
      EntityNotFoundError,
    );
    expect(() => event.publishSession(v7(), NOW)).toThrow(EntityNotFoundError);
  });
});

describe('CatalogEvent: publicar sessão (CA-17, CA-18, CA-19)', () => {
  function completeSession(event: CatalogEvent, venue: Venue, startsAt = STARTS_AT): string {
    const sessionId = schedule(event, venue, { startsAt });
    const session = event.sessions.find((s) => s.id === sessionId);
    for (const sector of session?.sectors ?? []) addBatch(event, sessionId, sector.id);
    return sessionId;
  }

  it('publica: sessão e evento Publicados e um só evento SessionPublished com o retrato completo', () => {
    const event = newEvent();
    const sessionId = completeSession(event, newVenue());
    event.uncommit();
    event.publishSession(sessionId, NOW);
    expect(event.status).toBe('published');
    expect(event.sessions[0]?.status).toBe('published');
    const emitted = event.getUncommittedEvents();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: 'SessionPublished', aggregateVersion: event.version });
    const published = emitted[0];
    if (published?.type !== 'SessionPublished') throw new Error('type');
    expect(published.session.sectors.every((s) => s.batches.length === 1)).toBe(true);
  });

  it('a segunda sessão publicada também emite só SessionPublished', () => {
    const event = newEvent();
    const venue = newVenue();
    const first = completeSession(event, venue);
    const second = completeSession(event, venue, new Date('2026-12-11T23:00:00.000Z'));
    event.publishSession(first, NOW);
    event.uncommit();
    event.publishSession(second, NOW);
    expect(event.getUncommittedEvents().map((e) => e.type)).toEqual(['SessionPublished']);
  });

  it('já publicada viola SESSION_NOT_DRAFT', () => {
    const event = newEvent();
    const sessionId = completeSession(event, newVenue());
    event.publishSession(sessionId, NOW);
    expect(codeOf(() => event.publishSession(sessionId, NOW))).toBe('SESSION_NOT_DRAFT');
  });

  it('startsAt no passado viola SESSION_START_NOT_IN_FUTURE', () => {
    const event = newEvent();
    const sessionId = completeSession(event, newVenue());
    expect(codeOf(() => event.publishSession(sessionId, new Date('2026-12-11T00:00:00Z')))).toBe(
      'SESSION_START_NOT_IN_FUTURE',
    );
  });

  it('sem setores viola SESSION_WITHOUT_SECTORS', () => {
    const event = newEvent();
    const sessionId = schedule(event, newVenue());
    for (const sector of [...(event.sessions[0]?.sectors ?? [])]) {
      event.removeSessionSector(sessionId, sector.id, NOW);
    }
    expect(codeOf(() => event.publishSession(sessionId, NOW))).toBe('SESSION_WITHOUT_SECTORS');
  });

  it('setor sem lote viola SECTOR_WITHOUT_BATCH', () => {
    const event = newEvent();
    const sessionId = schedule(event, newVenue());
    addBatch(event, sessionId, firstSectorId(event, sessionId));
    expect(codeOf(() => event.publishSession(sessionId, NOW))).toBe('SECTOR_WITHOUT_BATCH');
  });

  it('lote com endsAt vencido viola BATCH_ENDED', () => {
    const event = newEvent();
    const sessionId = completeSession(event, newVenue());
    // O relógio da publicação passou do fim do primeiro lote.
    const sector = event.sessions[0]?.sectors[0];
    if (!sector) throw new Error('sector');
    const first = sector.batches[0];
    if (!first) throw new Error('batch');
    sector.batches[0] = { ...first, endsAt: new Date('2026-11-02T13:00:00Z') };
    expect(codeOf(() => event.publishSession(sessionId, new Date('2026-11-03T00:00:00Z')))).toBe(
      'BATCH_ENDED',
    );
  });

  it('sessão publicada fica congelada (CA-19): tudo viola SESSION_NOT_DRAFT, mas o evento aceita nova sessão e edição', () => {
    const event = newEvent();
    const venue = newVenue();
    const sessionId = completeSession(event, venue);
    event.publishSession(sessionId, NOW);
    const sector = event.sessions[0]?.sectors[0];
    if (!sector) throw new Error('sector');
    const batchId = sector.batches[0]?.id ?? '';
    expect(codeOf(() => event.removeSession(sessionId, NOW))).toBe('SESSION_NOT_DRAFT');
    expect(
      codeOf(() => event.addSessionSector(sessionId, venue, venue.sectors[0]?.id ?? '', v7(), NOW)),
    ).toBe('SESSION_NOT_DRAFT');
    expect(codeOf(() => event.removeSessionSector(sessionId, sector.id, NOW))).toBe(
      'SESSION_NOT_DRAFT',
    );
    expect(codeOf(() => addBatch(event, sessionId, sector.id, batch('Novo')))).toBe(
      'SESSION_NOT_DRAFT',
    );
    expect(codeOf(() => event.removeBatch(sessionId, sector.id, batchId, NOW))).toBe(
      'SESSION_NOT_DRAFT',
    );

    event.updateDetails({ ...DETAILS, title: 'Editado' }, NOW);
    const next = schedule(event, venue, { startsAt: new Date('2026-12-12T23:00:00Z') });
    expect(event.sessions.find((s) => s.id === next)?.status).toBe('draft');
  });
});
