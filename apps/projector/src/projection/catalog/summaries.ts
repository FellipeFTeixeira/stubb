import {
  normalizeSearchKey,
  type EventDetailDocument,
  type EventDetailTombstone,
  type EventListingDocument,
  type OrganizerEventDocument,
} from '@stubb/contracts';

/** Documento da vitrine: nulo se o evento não está Publicado; leva só as sessões publicadas. */
export function toListing(
  detail: EventDetailDocument | EventDetailTombstone,
): EventListingDocument | null {
  if (detail.status !== 'published') return null;
  return {
    _id: detail._id,
    organizerId: detail.organizerId,
    version: detail.version,
    title: detail.title,
    titleSortKey: normalizeSearchKey(detail.title),
    category: detail.category,
    imageUrl: detail.imageUrl,
    sessions: detail.sessions
      .filter((session) => session.status === 'published')
      .map((session) => ({
        id: session.id,
        venueId: session.venueId,
        startsAt: session.startsAt,
        salesStartsAt: session.salesStartsAt,
        timeZone: session.timeZone,
        venue: session.venue
          ? { name: session.venue.name, city: session.venue.city, state: session.venue.state }
          : null,
        cityKey: session.venue?.cityKey ?? null,
        sectors: session.sectors.map((sector) => ({
          id: sector.id,
          batches: sector.batches.map((batch) => ({
            priceCents: batch.priceCents,
            endsAt: batch.endsAt,
            position: batch.position,
          })),
        })),
      })),
  };
}

/** Nulo na lápide. */
export function toOrganizerEvent(
  detail: EventDetailDocument | EventDetailTombstone,
): OrganizerEventDocument | null {
  if (detail.status === 'discarded') return null;
  return {
    _id: detail._id,
    organizerId: detail.organizerId,
    version: detail.version,
    title: detail.title,
    category: detail.category,
    status: detail.status,
    sessionsCount: detail.sessions.length,
    publishedSessionsCount: detail.sessions.filter((s) => s.status === 'published').length,
    createdAt: detail.createdAt,
  };
}
