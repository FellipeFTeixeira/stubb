import type {
  EventCard,
  EventDetailDocument,
  EventListingDocument,
  OrganizerEventDocument,
  OrganizerEventSummary,
  OrganizerEventView,
  PublicEventView,
  VenueDocument,
  VenueSummary,
  VenueView,
} from '@stubb/contracts';
import {
  batchBadge,
  cardPrice,
  eventEnded,
  sectorSales,
  sessionEnded,
  sessionSalesOpen,
  visibleSessions,
} from './derived-state.js';

// Documents + `now` -> views of the Spec. Pure: no I/O, no clock.

const iso = (date: Date): string => date.toISOString();
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const byStartsAtThenId = (
  a: { startsAt: Date; id: string },
  b: { startsAt: Date; id: string },
): number => a.startsAt.getTime() - b.startsAt.getTime() || byId(a, b);
const byPositionThenId = (
  a: { position: number; id: string },
  b: { position: number; id: string },
): number => a.position - b.position || byId(a, b);

/** RN-38/RN-39. Null when the listing has no visible session (should not pass the $match). */
export function toEventCard(doc: EventListingDocument, now: Date): EventCard | null {
  const visible = visibleSessions(doc.sessions, now).sort(byStartsAtThenId);
  const next = visible[0];
  if (!next?.venue) return null;
  const price = cardPrice(doc.sessions, now);
  return {
    id: doc._id,
    title: doc.title,
    category: doc.category,
    imageUrl: doc.imageUrl,
    nextSession: {
      id: next.id,
      startsAt: iso(next.startsAt),
      timeZone: next.timeZone,
      venue: { name: next.venue.name, city: next.venue.city, state: next.venue.state },
    },
    otherUpcomingSessionsCount: visible.length - 1,
    price:
      price.kind === 'sales_start'
        ? { kind: 'sales_start', salesStartsAt: iso(price.salesStartsAt) }
        : price,
  };
}

/** RN-41/RN-42. Null (404) when no published session with a venue exists. */
export function toPublicEventView(doc: EventDetailDocument, now: Date): PublicEventView | null {
  if (doc.status !== 'published') return null;
  const sessions = doc.sessions
    .filter((s) => s.status === 'published' && s.venue !== null)
    .sort(byStartsAtThenId);
  if (sessions.length === 0) return null;
  return {
    id: doc._id,
    version: doc.version,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    ageRating: doc.ageRating,
    imageUrl: doc.imageUrl,
    ended: eventEnded(sessions, now),
    asOf: iso(now),
    sessions: sessions.flatMap((session) => {
      const venue = session.venue;
      if (!venue) return [];
      const ended = sessionEnded(session, now);
      return [
        {
          id: session.id,
          startsAt: iso(session.startsAt),
          timeZone: session.timeZone,
          ended,
          venue: { name: venue.name, address: venue.address, city: venue.city, state: venue.state },
          sectors: ended
            ? []
            : [...session.sectors].sort(byPositionThenId).map((sector) => {
                const sales = sectorSales(session, sector, now);
                return {
                  id: sector.id,
                  name: sector.name,
                  kind: sector.kind,
                  sales:
                    sales.status === 'open'
                      ? {
                          status: 'open' as const,
                          batch: { name: sales.batch.name, priceCents: sales.batch.priceCents },
                        }
                      : sales.status === 'upcoming'
                        ? { status: 'upcoming' as const, salesStartsAt: iso(sales.salesStartsAt) }
                        : { status: 'ended' as const },
                };
              }),
        },
      ];
    }),
  };
}

/** RN-43/I-1/I-6. Drafts included. */
export function toOrganizerEventView(doc: EventDetailDocument, now: Date): OrganizerEventView {
  return {
    id: doc._id,
    version: doc.version,
    status: doc.status,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    ageRating: doc.ageRating,
    imageUrl: doc.imageUrl,
    createdAt: iso(doc.createdAt),
    asOf: iso(now),
    sessions: [...doc.sessions].sort(byStartsAtThenId).map((session) => ({
      id: session.id,
      status: session.status,
      venueId: session.venueId,
      venue: session.venue
        ? {
            name: session.venue.name,
            address: session.venue.address,
            city: session.venue.city,
            state: session.venue.state,
          }
        : null,
      startsAt: iso(session.startsAt),
      salesStartsAt: iso(session.salesStartsAt),
      timeZone: session.timeZone,
      ended: sessionEnded(session, now),
      salesOpen: sessionSalesOpen(session, session.sectors, now),
      sectors: [...session.sectors].sort(byPositionThenId).map((sector) => ({
        id: sector.id,
        venueSectorId: sector.venueSectorId,
        name: sector.name,
        kind: sector.kind,
        capacity: sector.capacity,
        rows: sector.rows,
        batches: [...sector.batches]
          .sort((a, b) => a.position - b.position)
          .map((batch) => ({
            id: batch.id,
            name: batch.name,
            priceCents: batch.priceCents,
            quantity: batch.quantity,
            endsAt: batch.endsAt ? iso(batch.endsAt) : null,
            badge: batchBadge(session, sector, batch, now),
          })),
      })),
    })),
  };
}

export function toOrganizerEventSummary(doc: OrganizerEventDocument): OrganizerEventSummary {
  return {
    id: doc._id,
    title: doc.title,
    category: doc.category,
    status: doc.status,
    sessionsCount: doc.sessionsCount,
    publishedSessionsCount: doc.publishedSessionsCount,
    createdAt: iso(doc.createdAt),
  };
}

export function toVenueSummary(doc: VenueDocument): VenueSummary {
  return {
    id: doc._id,
    name: doc.name,
    city: doc.city,
    state: doc.state,
    timeZone: doc.timeZone,
    sectorsCount: doc.sectors.length,
    version: doc.version,
  };
}

export function toVenueView(doc: VenueDocument): VenueView {
  return {
    id: doc._id,
    version: doc.version,
    name: doc.name,
    address: doc.address,
    city: doc.city,
    state: doc.state,
    timeZone: doc.timeZone,
    sectors: [...doc.sectors].sort(byPositionThenId).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      capacity: s.capacity,
      rows: s.rows,
    })),
  };
}
