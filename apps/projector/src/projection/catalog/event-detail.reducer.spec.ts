import type { EventDetailDocument, EventDetailTombstone } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import {
  asEventEvent,
  batch,
  buildScenario,
  EVENT_DETAILS,
  eventEvents,
  gaVenueSector,
  seatedVenueSector,
  sessionSectorFrom,
  testId,
} from './catalog-fixtures.js';
import { reduceEventDetail } from './event-detail.reducer.js';
import { toVenueSnapshot } from './venue.reducer.js';

const SNAPSHOT = {
  name: 'Teatro Aurora',
  address: 'Rua X',
  city: 'São Paulo',
  state: 'SP',
  cityKey: 'sao paulo',
  detailsVersion: 1,
};

function asDoc(value: EventDetailDocument | EventDetailTombstone): EventDetailDocument {
  if (value.status === 'discarded') throw new Error('unexpected tombstone');
  return value;
}

function created(): EventDetailDocument {
  const id = testId();
  return asDoc(reduceEventDetail(null, asEventEvent(eventEvents.created(id)), null));
}

describe('reduceEventDetail (CA-28)', () => {
  it('EventCreated cria o documento em rascunho com datas de occurredAt', () => {
    const id = testId();
    const event = asEventEvent(eventEvents.created(id));
    const doc = asDoc(reduceEventDetail(null, event, null));
    expect(doc).toMatchObject({
      _id: id,
      version: 1,
      status: 'draft',
      title: EVENT_DETAILS.title,
      sessions: [],
      createdAt: new Date(event.occurredAt),
      updatedAt: new Date(event.occurredAt),
    });
  });

  it('EventDetailsUpdated troca os cinco campos e avança version/updatedAt', () => {
    const doc = created();
    const event = asEventEvent(
      eventEvents.detailsUpdated(doc._id, 2, {
        title: 'Novo',
        description: 'Outra',
        category: 'show',
        ageRating: '18',
        imageUrl: 'https://exemplo.com/a.png',
      }),
    );
    const next = asDoc(reduceEventDetail(doc, event, null));
    expect(next).toMatchObject({
      version: 2,
      title: 'Novo',
      description: 'Outra',
      category: 'show',
      ageRating: '18',
      imageUrl: 'https://exemplo.com/a.png',
      createdAt: doc.createdAt,
      updatedAt: new Date(event.occurredAt),
    });
  });

  it('EventDiscarded devolve a lápide', () => {
    const doc = created();
    const next = reduceEventDetail(doc, asEventEvent(eventEvents.discarded(doc._id, 2)), null);
    expect(next).toEqual({ _id: doc._id, version: 2, status: 'discarded' });
  });

  it('SessionScheduled acrescenta a sessão ordenada, com snapshot e capacidade do marcado', () => {
    const doc = created();
    const venueId = testId();
    const ga = sessionSectorFrom(gaVenueSector(1, 300));
    const seated = sessionSectorFrom(seatedVenueSector(2));
    const late = asDoc(
      reduceEventDetail(
        doc,
        asEventEvent(
          eventEvents.sessionScheduled(doc._id, 2, {
            sessionId: testId(),
            venueId,
            startsAt: '2026-12-20T23:00:00.000Z',
            sectors: [seated, ga],
          }),
        ),
        SNAPSHOT,
      ),
    );
    const early = asDoc(
      reduceEventDetail(
        late,
        asEventEvent(
          eventEvents.sessionScheduled(doc._id, 3, {
            sessionId: testId(),
            venueId,
            startsAt: '2026-12-10T23:00:00.000Z',
            sectors: [],
          }),
        ),
        null,
      ),
    );
    expect(early.sessions.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-12-10T23:00:00.000Z',
      '2026-12-20T23:00:00.000Z',
    ]);
    expect(early.sessions[0]?.venue).toBeNull();
    const [first, second] = early.sessions[1]?.sectors ?? [];
    expect(first).toMatchObject({ kind: 'general_admission', capacity: 300, rows: null });
    expect(second).toMatchObject({ kind: 'seated', capacity: 22 });
    expect(early.sessions[1]?.status).toBe('draft');
    expect(early.sessions[1]?.venue).toEqual(SNAPSHOT);
  });

  it('cobre a sequência completa: setores, lotes, remoções e publicação', () => {
    const s = buildScenario();
    let doc: EventDetailDocument | null = null;
    for (const raw of s.event) {
      const event = asEventEvent(raw);
      const next = reduceEventDetail(
        doc,
        event,
        event.eventType === 'SessionScheduled' ? SNAPSHOT : null,
      );
      doc = asDoc(next);
    }
    expect(doc).not.toBeNull();
    const final = doc as unknown as EventDetailDocument;
    expect(final.version).toBe(11);
    expect(final.status).toBe('published');
    expect(final.title).toBe('Hamlet (temporada)');
    expect(final.sessions.map((x) => x.id)).toEqual([s.sessionB, s.sessionA]);
    const [b, a] = final.sessions;
    expect(b?.status).toBe('draft');
    expect(b?.sectors).toHaveLength(1);
    expect(a?.status).toBe('published');
    const batches = a?.sectors[0]?.batches.map((x) => x.position);
    expect(batches).toEqual([1, 3]);
    expect(a?.sectors[0]?.batches[0]?.endsAt).toEqual(new Date('2026-12-01T03:00:00.000Z'));
    expect(a?.sectors[1]?.batches).toHaveLength(1);
  });

  it('SessionRemoved e SessionSectorAdded mexem na árvore', () => {
    const doc = created();
    const venueId = testId();
    const sessionId = testId();
    const withSession = asDoc(
      reduceEventDetail(
        doc,
        asEventEvent(
          eventEvents.sessionScheduled(doc._id, 2, {
            sessionId,
            venueId,
            startsAt: '2026-12-20T23:00:00.000Z',
            sectors: [],
          }),
        ),
        null,
      ),
    );
    const sector = sessionSectorFrom(gaVenueSector(1, 50));
    const added = asDoc(
      reduceEventDetail(
        withSession,
        asEventEvent(eventEvents.sessionSectorAdded(doc._id, 3, sessionId, sector)),
        null,
      ),
    );
    expect(added.sessions[0]?.sectors).toHaveLength(1);
    const removed = asDoc(
      reduceEventDetail(
        added,
        asEventEvent(eventEvents.sessionRemoved(doc._id, 4, sessionId)),
        null,
      ),
    );
    expect(removed.sessions).toEqual([]);
  });

  it('BatchAdded em lote repetido reordena por position', () => {
    const doc = created();
    const sessionId = testId();
    const sector = sessionSectorFrom(gaVenueSector(1, 50));
    let current = asDoc(
      reduceEventDetail(
        doc,
        asEventEvent(
          eventEvents.sessionScheduled(doc._id, 2, {
            sessionId,
            venueId: testId(),
            startsAt: '2026-12-20T23:00:00.000Z',
            sectors: [sector],
          }),
        ),
        null,
      ),
    );
    current = asDoc(
      reduceEventDetail(
        current,
        asEventEvent(
          eventEvents.batchAdded(doc._id, 3, sessionId, sector.sessionSectorId, batch(2)),
        ),
        null,
      ),
    );
    current = asDoc(
      reduceEventDetail(
        current,
        asEventEvent(
          eventEvents.batchAdded(doc._id, 4, sessionId, sector.sessionSectorId, batch(1)),
        ),
        null,
      ),
    );
    expect(current.sessions[0]?.sectors[0]?.batches.map((x) => x.position)).toEqual([1, 2]);
  });

  it('referência a filho inexistente lança erro', () => {
    const doc = created();
    expect(() =>
      reduceEventDetail(doc, asEventEvent(eventEvents.sessionRemoved(doc._id, 2, testId())), null),
    ).toThrow(/not found/);
  });

  it('evento que não é EventCreated sem documento lança erro', () => {
    expect(() =>
      reduceEventDetail(null, asEventEvent(eventEvents.discarded(testId(), 2)), null),
    ).toThrow(/no detail document/);
  });

  it('toVenueSnapshot de local ausente é nulo', () => {
    expect(toVenueSnapshot(null)).toBeNull();
  });
});
