import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  type EventCard,
  type ListEventsResponse,
  type ListOrganizerEventsResponse,
  type ListVenuesResponse,
  normalizeSearchKey,
  type OrganizerEventView,
  type PublicEventView,
  type VenueView,
} from '@stubb/contracts';
import { Clock } from '../common/clock.js';
import { readWithMinVersion } from '../common/versioned-read.js';
import { CatalogReadRepository } from './catalog-read.repository.js';
import {
  GetEventQuery,
  GetOrganizerEventQuery,
  GetVenueQuery,
  ListEventsQuery,
  ListOrganizerEventsQuery,
  ListVenuesQuery,
  type VersionedResult,
} from './catalog.queries.js';
import {
  toEventCard,
  toOrganizerEventSummary,
  toOrganizerEventView,
  toPublicEventView,
  toVenueSummary,
  toVenueView,
} from './view-mappers.js';

// All handlers are read-only: queries never change state (regra 2).

@QueryHandler(ListEventsQuery)
export class ListEventsHandler implements IQueryHandler<ListEventsQuery, ListEventsResponse> {
  constructor(
    @Inject(CatalogReadRepository) private readonly repository: CatalogReadRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async execute({ params }: ListEventsQuery): Promise<ListEventsResponse> {
    const now = this.clock.now();
    const { items, total } = await this.repository.listEvents({
      now,
      q: params.q,
      cityKey: params.city ? normalizeSearchKey(params.city) : undefined,
      category: params.category,
      page: params.page,
      pageSize: params.pageSize,
    });
    return {
      items: items.flatMap((doc): EventCard[] => {
        const card = toEventCard(doc, now);
        return card ? [card] : [];
      }),
      page: params.page,
      pageSize: params.pageSize,
      total,
      asOf: now.toISOString(),
    };
  }
}

@QueryHandler(GetEventQuery)
export class GetEventHandler implements IQueryHandler<
  GetEventQuery,
  VersionedResult<'event', PublicEventView>
> {
  constructor(
    @Inject(CatalogReadRepository) private readonly repository: CatalogReadRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async execute({
    eventId,
    minVersion,
  }: GetEventQuery): Promise<VersionedResult<'event', PublicEventView>> {
    const { value, reached } = await readWithMinVersion(
      () => this.repository.findEventDetail(eventId),
      minVersion,
    );
    // Tombstone, draft and event without a published session with a venue are 404 (RN-42).
    const event =
      value && value.status !== 'discarded' ? toPublicEventView(value, this.clock.now()) : null;
    return event
      ? { found: true, event, minVersionReached: reached }
      : { found: false, minVersionReached: value !== null && reached };
  }
}

@QueryHandler(ListOrganizerEventsQuery)
export class ListOrganizerEventsHandler implements IQueryHandler<
  ListOrganizerEventsQuery,
  ListOrganizerEventsResponse
> {
  constructor(@Inject(CatalogReadRepository) private readonly repository: CatalogReadRepository) {}

  async execute({
    organizerId,
    page,
    pageSize,
  }: ListOrganizerEventsQuery): Promise<ListOrganizerEventsResponse> {
    const { items, total } = await this.repository.listOrganizerEvents(organizerId, page, pageSize);
    return { items: items.map(toOrganizerEventSummary), page, pageSize, total };
  }
}

@QueryHandler(GetOrganizerEventQuery)
export class GetOrganizerEventHandler implements IQueryHandler<
  GetOrganizerEventQuery,
  VersionedResult<'event', OrganizerEventView>
> {
  constructor(
    @Inject(CatalogReadRepository) private readonly repository: CatalogReadRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async execute({
    organizerId,
    eventId,
    minVersion,
  }: GetOrganizerEventQuery): Promise<VersionedResult<'event', OrganizerEventView>> {
    const { value, reached } = await readWithMinVersion(async () => {
      const doc = await this.repository.findEventDetail(eventId);
      // The tombstone carries no organizerId (RN-54); another owner's document is invisible.
      if (doc && doc.status !== 'discarded' && doc.organizerId !== organizerId) return null;
      return doc;
    }, minVersion);
    if (value && value.status !== 'discarded') {
      return {
        found: true,
        event: toOrganizerEventView(value, this.clock.now()),
        minVersionReached: reached,
      };
    }
    return { found: false, minVersionReached: value !== null && reached };
  }
}

@QueryHandler(ListVenuesQuery)
export class ListVenuesHandler implements IQueryHandler<ListVenuesQuery, ListVenuesResponse> {
  constructor(@Inject(CatalogReadRepository) private readonly repository: CatalogReadRepository) {}

  async execute({ organizerId }: ListVenuesQuery): Promise<ListVenuesResponse> {
    const venues = await this.repository.listVenues(organizerId);
    // I-5: alphabetical by name ignoring case and accents, tie broken by id.
    venues.sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) ||
        (a._id < b._id ? -1 : a._id > b._id ? 1 : 0),
    );
    return { items: venues.map(toVenueSummary) };
  }
}

@QueryHandler(GetVenueQuery)
export class GetVenueHandler implements IQueryHandler<
  GetVenueQuery,
  VersionedResult<'venue', VenueView>
> {
  constructor(@Inject(CatalogReadRepository) private readonly repository: CatalogReadRepository) {}

  async execute({
    organizerId,
    venueId,
    minVersion,
  }: GetVenueQuery): Promise<VersionedResult<'venue', VenueView>> {
    const { value, reached } = await readWithMinVersion(async () => {
      const doc = await this.repository.findVenue(venueId);
      return doc && doc.organizerId === organizerId ? doc : null;
    }, minVersion);
    return value
      ? { found: true, venue: toVenueView(value), minVersionReached: reached }
      : { found: false, minVersionReached: false };
  }
}

export const CATALOG_QUERY_HANDLERS = [
  ListEventsHandler,
  GetEventHandler,
  ListOrganizerEventsHandler,
  GetOrganizerEventHandler,
  ListVenuesHandler,
  GetVenueHandler,
];
