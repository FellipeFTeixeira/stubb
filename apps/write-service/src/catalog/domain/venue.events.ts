import type { IEvent } from '@nestjs/cqrs';

export interface SeatRow {
  label: string;
  seats: number;
}

// Setor-modelo da planta. `capacity` só na pista; `rows` só no assento marcado.
export interface VenueSectorState {
  id: string;
  name: string;
  nameKey: string;
  kind: 'general_admission' | 'seated';
  capacity: number | null;
  rows: SeatRow[] | null;
  position: number;
}

export interface VenueDetails {
  name: string;
  address: string;
  city: string;
  state: string;
  timeZone: string;
}

interface VenueEventBase extends IEvent {
  readonly venueId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
}

export interface VenueRegisteredEvent extends VenueEventBase {
  readonly type: 'VenueRegistered';
  readonly organizerId: string;
  readonly details: VenueDetails;
}

export interface VenueDetailsUpdatedEvent extends VenueEventBase {
  readonly type: 'VenueDetailsUpdated';
  readonly details: VenueDetails;
}

export interface VenueSectorAddedEvent extends VenueEventBase {
  readonly type: 'VenueSectorAdded';
  readonly sector: VenueSectorState;
}

export interface VenueSectorRemovedEvent extends VenueEventBase {
  readonly type: 'VenueSectorRemoved';
  readonly venueSectorId: string;
}

export type VenueDomainEvent =
  VenueRegisteredEvent | VenueDetailsUpdatedEvent | VenueSectorAddedEvent | VenueSectorRemovedEvent;
