import type { IEvent } from '@nestjs/cqrs';
import type { SeatRow } from './venue.events.js';

export interface EventDetails {
  title: string;
  description: string;
  category: string;
  ageRating: string;
  imageUrl: string | null;
}

export interface BatchState {
  id: string;
  name: string;
  priceCents: number;
  quantity: number | null;
  endsAt: Date | null;
  position: number;
}

export interface SessionSectorState {
  id: string;
  venueSectorId: string;
  name: string;
  kind: 'general_admission' | 'seated';
  capacity: number | null;
  rows: SeatRow[] | null;
  position: number;
  batches: BatchState[];
}

export type SessionStatus = 'draft' | 'published';

export interface SessionState {
  id: string;
  venueId: string;
  status: SessionStatus;
  startsAt: Date;
  salesStartsAt: Date;
  timeZone: string;
  createdAt: Date;
  sectors: SessionSectorState[];
}

interface EventEventBase extends IEvent {
  readonly eventId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
}

export interface EventCreatedEvent extends EventEventBase {
  readonly type: 'EventCreated';
  readonly organizerId: string;
  readonly details: EventDetails;
}

export interface EventDetailsUpdatedEvent extends EventEventBase {
  readonly type: 'EventDetailsUpdated';
  readonly details: EventDetails;
}

export interface EventDiscardedEvent extends EventEventBase {
  readonly type: 'EventDiscarded';
}

export interface SessionScheduledEvent extends EventEventBase {
  readonly type: 'SessionScheduled';
  readonly session: SessionState;
}

export interface SessionRemovedEvent extends EventEventBase {
  readonly type: 'SessionRemoved';
  readonly sessionId: string;
}

export interface SessionSectorAddedEvent extends EventEventBase {
  readonly type: 'SessionSectorAdded';
  readonly sessionId: string;
  readonly sector: SessionSectorState;
}

export interface SessionSectorRemovedEvent extends EventEventBase {
  readonly type: 'SessionSectorRemoved';
  readonly sessionId: string;
  readonly sessionSectorId: string;
}

export interface BatchAddedEvent extends EventEventBase {
  readonly type: 'BatchAdded';
  readonly sessionId: string;
  readonly sessionSectorId: string;
  readonly batch: BatchState;
}

export interface BatchRemovedEvent extends EventEventBase {
  readonly type: 'BatchRemoved';
  readonly sessionId: string;
  readonly sessionSectorId: string;
  readonly batchId: string;
}

export interface SessionPublishedEvent extends EventEventBase {
  readonly type: 'SessionPublished';
  readonly session: SessionState;
}

export type CatalogEventDomainEvent =
  | EventCreatedEvent
  | EventDetailsUpdatedEvent
  | EventDiscardedEvent
  | SessionScheduledEvent
  | SessionRemovedEvent
  | SessionSectorAddedEvent
  | SessionSectorRemovedEvent
  | BatchAddedEvent
  | BatchRemovedEvent
  | SessionPublishedEvent;
