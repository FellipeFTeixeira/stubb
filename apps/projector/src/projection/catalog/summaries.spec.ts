import type { EventDetailDocument } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { asEventEvent, buildScenario } from './catalog-fixtures.js';
import { reduceEventDetail } from './event-detail.reducer.js';
import { toListing, toOrganizerEvent } from './summaries.js';

const SNAPSHOT = {
  name: 'Teatro Aurora',
  address: 'Rua X',
  city: 'São Paulo',
  state: 'SP',
  cityKey: 'sao paulo',
  detailsVersion: 1,
};

function project(count: number): EventDetailDocument {
  const s = buildScenario();
  let doc: EventDetailDocument | null = null;
  for (const raw of s.event.slice(0, count)) {
    const event = asEventEvent(raw);
    const next = reduceEventDetail(
      doc,
      event,
      event.eventType === 'SessionScheduled' ? SNAPSHOT : null,
    );
    if (next.status === 'discarded') throw new Error('unexpected tombstone');
    doc = next;
  }
  if (doc === null) throw new Error('empty');
  return doc;
}

describe('summaries (CA-29)', () => {
  it('rascunho: sem listing, organizer_events com contagens', () => {
    const detail = project(4);
    expect(toListing(detail)).toBeNull();
    expect(toOrganizerEvent(detail)).toMatchObject({
      _id: detail._id,
      version: 4,
      status: 'draft',
      sessionsCount: 2,
      publishedSessionsCount: 0,
      createdAt: detail.createdAt,
    });
  });

  it('publicado: listing só com a sessão publicada, titleSortKey e cityKey', () => {
    const detail = project(11);
    const listing = toListing(detail);
    expect(listing).not.toBeNull();
    expect(listing?.version).toBe(11);
    expect(listing?.titleSortKey).toBe('hamlet (temporada)');
    expect(listing?.sessions).toHaveLength(1);
    expect(listing?.sessions[0]).toMatchObject({
      cityKey: 'sao paulo',
      venue: { name: 'Teatro Aurora', city: 'São Paulo', state: 'SP' },
    });
    expect(listing?.sessions[0]?.sectors[0]?.batches).toEqual([
      { priceCents: 8000, endsAt: new Date('2026-12-01T03:00:00.000Z'), position: 1 },
      { priceCents: 12000, endsAt: null, position: 3 },
    ]);
    expect(toOrganizerEvent(detail)).toMatchObject({
      status: 'published',
      sessionsCount: 2,
      publishedSessionsCount: 1,
    });
  });

  it('sessão sem local: venue e cityKey nulos', () => {
    const detail = project(11);
    const sessions = detail.sessions.map((x) => ({ ...x, venue: null }));
    const listing = toListing({ ...detail, sessions });
    expect(listing?.sessions[0]).toMatchObject({ venue: null, cityKey: null });
  });

  it('lápide: nenhum resumo', () => {
    const tomb = { _id: 'x', version: 3, status: 'discarded' as const };
    expect(toListing(tomb)).toBeNull();
    expect(toOrganizerEvent(tomb)).toBeNull();
  });
});
