import type { EventDetailDocument, VenueDocument } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import {
  asEventEvent,
  asVenueEvent,
  buildScenario,
  gaVenueSector,
  seatedVenueSector,
  testId,
  VENUE_DETAILS,
  venueEvents,
} from './catalog-fixtures.js';
import { reduceEventDetail } from './event-detail.reducer.js';
import { applyVenueSnapshot, reduceVenue, toVenueSnapshot } from './venue.reducer.js';

function registered(): VenueDocument {
  return reduceVenue(null, asVenueEvent(venueEvents.registered(testId())));
}

describe('reduceVenue (CA-31)', () => {
  it('VenueRegistered cria com detailsVersion 1 e cityKey normalizada', () => {
    const event = asVenueEvent(venueEvents.registered(testId()));
    const doc = reduceVenue(null, event);
    expect(doc).toMatchObject({
      version: 1,
      detailsVersion: 1,
      cityKey: 'sao paulo',
      sectors: [],
      createdAt: new Date(event.occurredAt),
    });
  });

  it('VenueDetailsUpdated troca os cinco campos e soma detailsVersion', () => {
    const doc = registered();
    const next = reduceVenue(
      doc,
      asVenueEvent(
        venueEvents.detailsUpdated(doc._id, 2, {
          ...VENUE_DETAILS,
          name: 'Outro',
          city: 'Brasília',
          state: 'DF',
        }),
      ),
    );
    expect(next).toMatchObject({
      version: 2,
      detailsVersion: 2,
      name: 'Outro',
      city: 'Brasília',
      cityKey: 'brasilia',
      state: 'DF',
    });
  });

  it('evento de planta aumenta version mas não detailsVersion; capacidade do marcado é a soma', () => {
    const doc = registered();
    const withGa = reduceVenue(
      doc,
      asVenueEvent(venueEvents.sectorAdded(doc._id, 2, gaVenueSector(1, 300))),
    );
    const seated = seatedVenueSector(2);
    const withSeated = reduceVenue(
      withGa,
      asVenueEvent(venueEvents.sectorAdded(doc._id, 3, seated)),
    );
    expect(withSeated.version).toBe(3);
    expect(withSeated.detailsVersion).toBe(1);
    expect(withSeated.sectors.map((s) => s.capacity)).toEqual([300, 22]);
    const removed = reduceVenue(
      withSeated,
      asVenueEvent(venueEvents.sectorRemoved(doc._id, 4, seated.venueSectorId)),
    );
    expect(removed.sectors).toHaveLength(1);
  });

  it('remover setor inexistente lança erro', () => {
    const doc = registered();
    expect(() =>
      reduceVenue(doc, asVenueEvent(venueEvents.sectorRemoved(doc._id, 2, testId()))),
    ).toThrow(/not found/);
  });
});

describe('applyVenueSnapshot', () => {
  function detailWithSession(venue: ReturnType<typeof toVenueSnapshot>): EventDetailDocument {
    const s = buildScenario();
    let doc: EventDetailDocument | null = null;
    for (const raw of s.event.slice(0, 3)) {
      const event = asEventEvent(raw);
      const next = reduceEventDetail(
        doc,
        event,
        event.eventType === 'SessionScheduled' ? venue : null,
      );
      if (next.status === 'discarded') throw new Error('tombstone');
      doc = next;
    }
    if (doc === null) throw new Error('empty');
    return { ...doc, sessions: doc.sessions.map((x) => ({ ...x, venueId: 'venue-1' })) };
  }

  const v1 = { name: 'A', address: 'a', city: 'X', state: 'SP', cityKey: 'x', detailsVersion: 1 };
  const v2 = { ...v1, name: 'B', detailsVersion: 2 };

  it('preenche sessão sem local e troca snapshot mais antigo, sem mexer em version/updatedAt', () => {
    const empty = detailWithSession(null);
    const filled = applyVenueSnapshot(empty, 'venue-1', v1);
    expect(filled?.sessions[0]?.venue).toEqual(v1);
    expect(filled?.version).toBe(empty.version);
    expect(filled?.updatedAt).toEqual(empty.updatedAt);

    const updated = applyVenueSnapshot(filled as EventDetailDocument, 'venue-1', v2);
    expect(updated?.sessions[0]?.venue?.name).toBe('B');
  });

  it('snapshot mais antigo ou igual não sobrescreve (devolve nulo)', () => {
    const doc = applyVenueSnapshot(detailWithSession(null), 'venue-1', v2) as EventDetailDocument;
    expect(applyVenueSnapshot(doc, 'venue-1', v1)).toBeNull();
    expect(applyVenueSnapshot(doc, 'venue-1', v2)).toBeNull();
  });

  it('local diferente não é alterado', () => {
    expect(applyVenueSnapshot(detailWithSession(null), 'outro', v1)).toBeNull();
  });
});
