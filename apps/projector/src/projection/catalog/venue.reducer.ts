import {
  normalizeSearchKey,
  type EventDetailDocument,
  type SessionVenueSnapshot,
  type VenueDocument,
  type VenueDomainEventV1,
  type VenueSectorPayload,
} from '@stubb/contracts';
import { seatCapacity } from './event-detail.reducer.js';

type VenueSector = VenueDocument['sectors'][number];

function toVenueSector(sector: VenueSectorPayload): VenueSector {
  const base = {
    id: sector.venueSectorId,
    name: sector.name,
    kind: sector.kind,
    position: sector.position,
  };
  return sector.kind === 'seated'
    ? { ...base, capacity: seatCapacity(sector.rows), rows: sector.rows.map((r) => ({ ...r })) }
    : { ...base, capacity: sector.capacity, rows: null };
}

function bySectorOrder(a: VenueSector, b: VenueSector): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function reduceVenue(doc: VenueDocument | null, event: VenueDomainEventV1): VenueDocument {
  const occurredAt = new Date(event.occurredAt);
  const version = event.aggregateVersion;

  if (event.eventType === 'VenueRegistered') {
    const { organizerId, name, address, city, state, timeZone } = event.payload;
    return {
      _id: event.aggregateId,
      organizerId,
      version,
      detailsVersion: 1,
      name,
      address,
      city,
      state,
      timeZone,
      cityKey: normalizeSearchKey(city),
      sectors: [],
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  if (doc === null) {
    throw new Error(`Venue ${event.aggregateId} has no document for ${event.eventType}`);
  }
  const next = { ...doc, version, updatedAt: occurredAt };

  switch (event.eventType) {
    case 'VenueDetailsUpdated': {
      const { name, address, city, state, timeZone } = event.payload;
      return {
        ...next,
        detailsVersion: doc.detailsVersion + 1,
        name,
        address,
        city,
        state,
        timeZone,
        cityKey: normalizeSearchKey(city),
      };
    }
    case 'VenueSectorAdded':
      return {
        ...next,
        sectors: [...doc.sectors, toVenueSector(event.payload.sector)].sort(bySectorOrder),
      };
    case 'VenueSectorRemoved': {
      if (!doc.sectors.some((s) => s.id === event.payload.venueSectorId)) {
        throw new Error(`Venue sector ${event.payload.venueSectorId} not found`);
      }
      return { ...next, sectors: doc.sectors.filter((s) => s.id !== event.payload.venueSectorId) };
    }
  }
}

export function toVenueSnapshot(venue: VenueDocument | null): SessionVenueSnapshot | null {
  if (venue === null) return null;
  return {
    name: venue.name,
    address: venue.address,
    city: venue.city,
    state: venue.state,
    cityKey: venue.cityKey,
    detailsVersion: venue.detailsVersion,
  };
}

/**
 * Troca o snapshot do local nas sessões desse local cujo snapshot é nulo ou mais antigo (por
 * `detailsVersion`). Devolve nulo se nada mudou. Não mexe em `version` nem `updatedAt`: o fan-out
 * não pode alterar o documento de forma que dependa da ordem de chegada.
 */
export function applyVenueSnapshot(
  detail: EventDetailDocument,
  venueId: string,
  snapshot: SessionVenueSnapshot,
): EventDetailDocument | null {
  let changed = false;
  const sessions = detail.sessions.map((session) => {
    if (session.venueId !== venueId) return session;
    if (session.venue !== null && session.venue.detailsVersion >= snapshot.detailsVersion) {
      return session;
    }
    changed = true;
    return { ...session, venue: { ...snapshot } };
  });
  return changed ? { ...detail, sessions } : null;
}
