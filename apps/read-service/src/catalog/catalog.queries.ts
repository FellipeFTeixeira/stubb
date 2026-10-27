import { Query } from '@nestjs/cqrs';
import type {
  ListEventsQuery as ListEventsParams,
  ListEventsResponse,
  ListOrganizerEventsResponse,
  ListVenuesResponse,
  OrganizerEventView,
  PublicEventView,
  VenueView,
} from '@stubb/contracts';

// A missing document still reports whether the version was reached (I-15): a tombstone or
// draft that satisfies min_version answers 404 with minVersionReached=true.
export type VersionedResult<K extends string, V> =
  | ({ found: true; minVersionReached: boolean } & Record<K, V>)
  | { found: false; minVersionReached: boolean };

export class ListEventsQuery extends Query<ListEventsResponse> {
  constructor(public readonly params: ListEventsParams) {
    super();
  }
}

export class GetEventQuery extends Query<VersionedResult<'event', PublicEventView>> {
  constructor(
    public readonly eventId: string,
    public readonly minVersion?: number,
  ) {
    super();
  }
}

export class ListOrganizerEventsQuery extends Query<ListOrganizerEventsResponse> {
  constructor(
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}

export class GetOrganizerEventQuery extends Query<VersionedResult<'event', OrganizerEventView>> {
  constructor(
    public readonly eventId: string,
    public readonly minVersion?: number,
  ) {
    super();
  }
}

export class ListVenuesQuery extends Query<ListVenuesResponse> {}

export class GetVenueQuery extends Query<VersionedResult<'venue', VenueView>> {
  constructor(
    public readonly venueId: string,
    public readonly minVersion?: number,
  ) {
    super();
  }
}
