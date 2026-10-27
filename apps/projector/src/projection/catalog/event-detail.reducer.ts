import type {
  BatchPayload,
  EventDetailBatch,
  EventDetailDocument,
  EventDetailSector,
  EventDetailSession,
  EventDetailTombstone,
  EventDomainEventV1,
  SessionSectorPayload,
  SessionVenueSnapshot,
} from '@stubb/contracts';

export function seatCapacity(rows: Array<{ label: string; seats: number }>): number {
  return rows.reduce((sum, row) => sum + row.seats, 0);
}

function byPositionThenId<T extends { position: number; id: string }>(a: T, b: T): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function bySessionOrder(a: EventDetailSession, b: EventDetailSession): number {
  return a.startsAt.getTime() - b.startsAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function toBatch(batch: BatchPayload): EventDetailBatch {
  return {
    id: batch.batchId,
    name: batch.name,
    priceCents: batch.priceCents,
    quantity: batch.quantity,
    endsAt: batch.endsAt === null ? null : new Date(batch.endsAt),
    position: batch.position,
  };
}

export function toSector(sector: SessionSectorPayload): EventDetailSector {
  const base = {
    id: sector.sessionSectorId,
    venueSectorId: sector.venueSectorId,
    name: sector.name,
    kind: sector.kind,
    position: sector.position,
    batches: sector.batches.map(toBatch).sort((a, b) => a.position - b.position),
  };
  return sector.kind === 'seated'
    ? { ...base, capacity: seatCapacity(sector.rows), rows: sector.rows.map((r) => ({ ...r })) }
    : { ...base, capacity: sector.capacity, rows: null };
}

function findSession(doc: EventDetailDocument, sessionId: string): EventDetailSession {
  const session = doc.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in event ${doc._id}`);
  return session;
}

function findSector(session: EventDetailSession, sectorId: string): EventDetailSector {
  const sector = session.sectors.find((s) => s.id === sectorId);
  if (!sector) throw new Error(`Session sector ${sectorId} not found in session ${session.id}`);
  return sector;
}

function replaceSession(
  doc: EventDetailDocument,
  sessionId: string,
  change: (session: EventDetailSession) => EventDetailSession,
): EventDetailSession[] {
  findSession(doc, sessionId);
  return doc.sessions.map((s) => (s.id === sessionId ? change(s) : s)).sort(bySessionOrder);
}

function requireDoc(doc: EventDetailDocument | null, event: EventDomainEventV1) {
  if (doc === null) {
    throw new Error(`Event ${event.aggregateId} has no detail document for ${event.eventType}`);
  }
  return doc;
}

/**
 * Função pura: aplica um evento do agregado Evento sobre o documento de detalhe. Datas vêm só de
 * `occurredAt` (regra 6: o replay precisa reproduzir o mesmo documento).
 */
export function reduceEventDetail(
  doc: EventDetailDocument | null,
  event: EventDomainEventV1,
  venue: SessionVenueSnapshot | null,
): EventDetailDocument | EventDetailTombstone {
  const occurredAt = new Date(event.occurredAt);
  const version = event.aggregateVersion;

  if (event.eventType === 'EventCreated') {
    const { organizerId, title, description, category, ageRating, imageUrl } = event.payload;
    return {
      _id: event.aggregateId,
      organizerId,
      version,
      status: 'draft',
      title,
      description,
      category,
      ageRating,
      imageUrl,
      sessions: [],
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  const current = requireDoc(doc, event);
  const next = { ...current, version, updatedAt: occurredAt };

  switch (event.eventType) {
    case 'EventDetailsUpdated': {
      const { title, description, category, ageRating, imageUrl } = event.payload;
      return { ...next, title, description, category, ageRating, imageUrl };
    }
    case 'EventDiscarded':
      return { _id: event.aggregateId, version, status: 'discarded' };
    case 'SessionScheduled': {
      const p = event.payload;
      const session: EventDetailSession = {
        id: p.sessionId,
        status: 'draft',
        venueId: p.venueId,
        venue,
        startsAt: new Date(p.startsAt),
        salesStartsAt: new Date(p.salesStartsAt),
        timeZone: p.timeZone,
        sectors: p.sectors.map(toSector).sort(byPositionThenId),
      };
      return { ...next, sessions: [...current.sessions, session].sort(bySessionOrder) };
    }
    case 'SessionRemoved': {
      findSession(current, event.payload.sessionId);
      return {
        ...next,
        sessions: current.sessions.filter((s) => s.id !== event.payload.sessionId),
      };
    }
    case 'SessionSectorAdded': {
      const sector = toSector(event.payload.sector);
      return {
        ...next,
        sessions: replaceSession(current, event.payload.sessionId, (s) => ({
          ...s,
          sectors: [...s.sectors, sector].sort(byPositionThenId),
        })),
      };
    }
    case 'SessionSectorRemoved': {
      const { sessionId, sessionSectorId } = event.payload;
      return {
        ...next,
        sessions: replaceSession(current, sessionId, (s) => {
          findSector(s, sessionSectorId);
          return { ...s, sectors: s.sectors.filter((x) => x.id !== sessionSectorId) };
        }),
      };
    }
    case 'BatchAdded': {
      const { sessionId, sessionSectorId, batch } = event.payload;
      return {
        ...next,
        sessions: replaceSession(current, sessionId, (s) => {
          findSector(s, sessionSectorId);
          return {
            ...s,
            sectors: s.sectors.map((x) =>
              x.id === sessionSectorId
                ? {
                    ...x,
                    batches: [...x.batches, toBatch(batch)].sort((a, b) => a.position - b.position),
                  }
                : x,
            ),
          };
        }),
      };
    }
    case 'BatchRemoved': {
      const { sessionId, sessionSectorId, batchId } = event.payload;
      return {
        ...next,
        sessions: replaceSession(current, sessionId, (s) => {
          const sector = findSector(s, sessionSectorId);
          if (!sector.batches.some((b) => b.id === batchId)) {
            throw new Error(`Batch ${batchId} not found in sector ${sessionSectorId}`);
          }
          return {
            ...s,
            sectors: s.sectors.map((x) =>
              x.id === sessionSectorId
                ? { ...x, batches: x.batches.filter((b) => b.id !== batchId) }
                : x,
            ),
          };
        }),
      };
    }
    case 'SessionPublished':
      return {
        ...next,
        status: 'published',
        sessions: replaceSession(current, event.payload.session.sessionId, (s) => ({
          ...s,
          status: 'published',
        })),
      };
  }
}
