type SectorKind = 'general_admission' | 'seated';
type SeatRows = Array<{ label: string; seats: number }>;

export interface VenueDocument {
  _id: string;
  organizerId: string;
  version: number;
  detailsVersion: number;
  name: string;
  address: string;
  city: string;
  state: string;
  timeZone: string;
  cityKey: string;
  sectors: Array<{
    id: string;
    name: string;
    kind: SectorKind;
    capacity: number;
    rows: SeatRows | null;
    position: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionVenueSnapshot {
  name: string;
  address: string;
  city: string;
  state: string;
  cityKey: string;
  detailsVersion: number;
}

export interface EventDetailBatch {
  id: string;
  name: string;
  priceCents: number;
  quantity: number | null;
  endsAt: Date | null;
  position: number;
}

export interface EventDetailSector {
  id: string;
  venueSectorId: string;
  name: string;
  kind: SectorKind;
  capacity: number;
  rows: SeatRows | null;
  position: number;
  batches: EventDetailBatch[];
}

export interface EventDetailSession {
  id: string;
  status: 'draft' | 'published';
  venueId: string;
  venue: SessionVenueSnapshot | null;
  startsAt: Date;
  salesStartsAt: Date;
  timeZone: string;
  sectors: EventDetailSector[];
}

export interface EventDetailDocument {
  _id: string;
  organizerId: string;
  version: number;
  status: 'draft' | 'published';
  title: string;
  description: string;
  category: string;
  ageRating: string;
  imageUrl: string | null;
  sessions: EventDetailSession[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EventDetailTombstone {
  _id: string;
  version: number;
  status: 'discarded';
}

/** Só sessões publicadas. */
export interface EventListingDocument {
  _id: string;
  organizerId: string;
  version: number;
  title: string;
  titleSortKey: string;
  category: string;
  imageUrl: string | null;
  sessions: Array<{
    id: string;
    venueId: string;
    startsAt: Date;
    salesStartsAt: Date;
    timeZone: string;
    venue: { name: string; city: string; state: string } | null;
    cityKey: string | null;
    sectors: Array<{
      id: string;
      batches: Array<{ priceCents: number; endsAt: Date | null; position: number }>;
    }>;
  }>;
}

export interface OrganizerEventDocument {
  _id: string;
  organizerId: string;
  version: number;
  title: string;
  category: string;
  status: 'draft' | 'published';
  sessionsCount: number;
  publishedSessionsCount: number;
  createdAt: Date;
}

export interface AggregateVersionDocument {
  _id: string;
  aggregateType: string;
  version: number;
}
