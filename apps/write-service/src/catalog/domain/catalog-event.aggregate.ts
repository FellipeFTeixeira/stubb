import { AggregateRoot } from '@nestjs/cqrs';
import { CATALOG_LIMITS } from '@stubb/contracts';
import { BusinessRuleViolationError, EntityNotFoundError } from '../../shared/errors.js';
import { assertBatchCanAppend, assertBatchSequence } from './batch-rules.js';
import type {
  BatchState,
  CatalogEventDomainEvent,
  EventDetails,
  SessionSectorState,
  SessionState,
} from './catalog-event.events.js';
import { sectorCapacity, toNameKey } from './venue.aggregate.js';
import type { VenueSectorState } from './venue.events.js';

export type EventStatus = 'draft' | 'published';

export interface CatalogEventState extends EventDetails {
  id: string;
  organizerId: string;
  status: EventStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  sessions: SessionState[];
}

// O que a sessão precisa saber do local: fuso e planta atuais (cópia no momento do agendamento).
export interface VenuePlan {
  id: string;
  timeZone: string;
  sectors: readonly VenueSectorState[];
}

export interface ScheduleSessionInput {
  sessionId: string;
  venue: VenuePlan;
  startsAt: Date;
  salesStartsAt: Date;
  timeZone: string;
  // Um ID novo por setor da planta, na ordem da planta.
  sectorIds: readonly string[];
}

export interface NewBatchInput {
  name: string;
  priceCents: number;
  quantity: number | null;
  endsAt: Date | null;
}

function bySectorPosition(
  a: { position: number; id: string },
  b: { position: number; id: string },
) {
  return a.position - b.position || a.id.localeCompare(b.id);
}

// Retrato imutável para o evento de domínio: o agregado continua mudando depois.
function snapshot<T>(value: T): T {
  return structuredClone(value);
}

// Agregado do evento: sessões, setores e lotes vivem dentro dele (uma mutação = um evento = versão + 1).
export class CatalogEvent extends AggregateRoot<CatalogEventDomainEvent> {
  private constructor(
    readonly id: string,
    readonly organizerId: string,
    private _details: EventDetails,
    private _status: EventStatus,
    private _version: number,
    readonly createdAt: Date,
    private _updatedAt: Date,
    private _sessions: SessionState[],
  ) {
    super();
  }

  get details(): EventDetails {
    return { ...this._details };
  }

  get status(): EventStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get sessions(): readonly SessionState[] {
    return this._sessions;
  }

  static create(id: string, organizerId: string, details: EventDetails, now: Date): CatalogEvent {
    const event = new CatalogEvent(id, organizerId, { ...details }, 'draft', 1, now, now, []);
    event.apply({
      type: 'EventCreated',
      eventId: id,
      aggregateVersion: 1,
      occurredAt: now,
      organizerId,
      details: { ...details },
    });
    return event;
  }

  static rehydrate(state: CatalogEventState): CatalogEvent {
    return new CatalogEvent(
      state.id,
      state.organizerId,
      {
        title: state.title,
        description: state.description,
        category: state.category,
        ageRating: state.ageRating,
        imageUrl: state.imageUrl,
      },
      state.status,
      state.version,
      state.createdAt,
      state.updatedAt,
      state.sessions.map((session) => ({
        ...session,
        sectors: [...session.sectors].sort(bySectorPosition).map((sector) => ({
          ...sector,
          batches: [...sector.batches].sort((a, b) => a.position - b.position),
        })),
      })),
    );
  }

  updateDetails(details: EventDetails, now: Date): void {
    this._details = { ...details };
    this.bump(now);
    this.apply({
      type: 'EventDetailsUpdated',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      details: { ...details },
    });
  }

  discard(now: Date): void {
    if (this._status !== 'draft') throw new BusinessRuleViolationError('EVENT_NOT_DRAFT');
    this.bump(now);
    this.apply({
      type: 'EventDiscarded',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
    });
  }

  sessionVenueId(sessionId: string): string {
    return this.findSession(sessionId).venueId;
  }

  scheduleSession(input: ScheduleSessionInput, now: Date): void {
    const { venue } = input;
    if (venue.timeZone !== input.timeZone) {
      throw new BusinessRuleViolationError('VENUE_TIME_ZONE_CHANGED');
    }
    if (venue.sectors.length === 0) throw new BusinessRuleViolationError('VENUE_WITHOUT_SECTORS');
    if (this._sessions.length >= CATALOG_LIMITS.sessionsPerEventMax) {
      throw new BusinessRuleViolationError('SESSION_LIMIT_REACHED');
    }
    if (input.startsAt.getTime() <= now.getTime()) {
      throw new BusinessRuleViolationError('SESSION_START_NOT_IN_FUTURE');
    }
    if (
      this._sessions.some(
        (session) =>
          session.venueId === venue.id && session.startsAt.getTime() === input.startsAt.getTime(),
      )
    ) {
      throw new BusinessRuleViolationError('SESSION_DUPLICATED');
    }
    const planSectors = [...venue.sectors].sort(bySectorPosition);
    if (input.sectorIds.length !== planSectors.length) {
      throw new Error('sectorIds must have one id per venue sector');
    }
    const session: SessionState = {
      id: input.sessionId,
      venueId: venue.id,
      status: 'draft',
      startsAt: input.startsAt,
      salesStartsAt: input.salesStartsAt,
      timeZone: input.timeZone,
      createdAt: now,
      sectors: planSectors.map((sector, index) =>
        copyVenueSector(sector, input.sectorIds[index] as string),
      ),
    };
    this._sessions.push(session);
    this.bump(now);
    this.apply({
      type: 'SessionScheduled',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      session: snapshot(session),
    });
  }

  removeSession(sessionId: string, now: Date): void {
    const session = this.findSession(sessionId);
    this.assertDraft(session);
    this._sessions = this._sessions.filter((candidate) => candidate.id !== sessionId);
    this.bump(now);
    this.apply({
      type: 'SessionRemoved',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      sessionId,
    });
  }

  addSessionSector(
    sessionId: string,
    venue: VenuePlan,
    venueSectorId: string,
    newId: string,
    now: Date,
  ): void {
    const session = this.findSession(sessionId);
    this.assertDraft(session);
    const venueSector = venue.sectors.find((sector) => sector.id === venueSectorId);
    if (!venueSector) throw new BusinessRuleViolationError('VENUE_SECTOR_NOT_FOUND');
    if (session.sectors.some((sector) => sector.venueSectorId === venueSectorId)) {
      throw new BusinessRuleViolationError('SESSION_SECTOR_ALREADY_PRESENT');
    }
    const nameKey = toNameKey(venueSector.name);
    if (session.sectors.some((sector) => toNameKey(sector.name) === nameKey)) {
      throw new BusinessRuleViolationError('SESSION_SECTOR_NAME_TAKEN');
    }
    const sector = copyVenueSector(venueSector, newId);
    session.sectors.push(sector);
    session.sectors.sort(bySectorPosition);
    this.bump(now);
    this.apply({
      type: 'SessionSectorAdded',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      sessionId,
      sector: snapshot(sector),
    });
  }

  removeSessionSector(sessionId: string, sessionSectorId: string, now: Date): void {
    const session = this.findSession(sessionId);
    this.findSector(session, sessionSectorId);
    this.assertDraft(session);
    session.sectors = session.sectors.filter((sector) => sector.id !== sessionSectorId);
    this.bump(now);
    this.apply({
      type: 'SessionSectorRemoved',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      sessionId,
      sessionSectorId,
    });
  }

  addBatch(
    sessionId: string,
    sessionSectorId: string,
    input: NewBatchInput,
    newId: string,
    now: Date,
  ): void {
    const session = this.findSession(sessionId);
    const sector = this.findSector(session, sessionSectorId);
    this.assertDraft(session);
    assertBatchCanAppend(sector.batches, input, batchContext(session, sector));
    const position = sector.batches.reduce((max, batch) => Math.max(max, batch.position), 0) + 1;
    const batch: BatchState = { id: newId, ...input, position };
    sector.batches.push(batch);
    this.bump(now);
    this.apply({
      type: 'BatchAdded',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      sessionId,
      sessionSectorId,
      batch: snapshot(batch),
    });
  }

  removeBatch(sessionId: string, sessionSectorId: string, batchId: string, now: Date): void {
    const session = this.findSession(sessionId);
    const sector = this.findSector(session, sessionSectorId);
    if (!sector.batches.some((batch) => batch.id === batchId)) {
      throw new EntityNotFoundError('Batch not found');
    }
    this.assertDraft(session);
    sector.batches = sector.batches.filter((batch) => batch.id !== batchId);
    this.bump(now);
    this.apply({
      type: 'BatchRemoved',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      sessionId,
      sessionSectorId,
      batchId,
    });
  }

  // Um evento só: SessionPublished com o retrato completo, mesmo quando o evento também vira Publicado.
  publishSession(sessionId: string, now: Date): void {
    const session = this.findSession(sessionId);
    this.assertDraft(session);
    if (session.startsAt.getTime() <= now.getTime()) {
      throw new BusinessRuleViolationError('SESSION_START_NOT_IN_FUTURE');
    }
    if (session.sectors.length === 0)
      throw new BusinessRuleViolationError('SESSION_WITHOUT_SECTORS');
    if (session.sectors.some((sector) => sector.batches.length === 0)) {
      throw new BusinessRuleViolationError('SECTOR_WITHOUT_BATCH');
    }
    const ended = session.sectors.some((sector) =>
      sector.batches.some(
        (batch) => batch.endsAt !== null && batch.endsAt.getTime() <= now.getTime(),
      ),
    );
    if (ended) throw new BusinessRuleViolationError('BATCH_ENDED');
    for (const sector of session.sectors) {
      assertBatchSequence(sector.batches, batchContext(session, sector));
    }
    session.status = 'published';
    this._status = 'published';
    this.bump(now);
    this.apply({
      type: 'SessionPublished',
      eventId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      session: snapshot(session),
    });
  }

  private bump(now: Date): void {
    this._version += 1;
    this._updatedAt = now;
  }

  private findSession(sessionId: string): SessionState {
    const session = this._sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new EntityNotFoundError('Session not found');
    return session;
  }

  private findSector(session: SessionState, sessionSectorId: string): SessionSectorState {
    const sector = session.sectors.find((candidate) => candidate.id === sessionSectorId);
    if (!sector) throw new EntityNotFoundError('Session sector not found');
    return sector;
  }

  private assertDraft(session: SessionState): void {
    if (session.status !== 'draft') throw new BusinessRuleViolationError('SESSION_NOT_DRAFT');
  }
}

function copyVenueSector(sector: VenueSectorState, newId: string): SessionSectorState {
  return {
    id: newId,
    venueSectorId: sector.id,
    name: sector.name,
    kind: sector.kind,
    capacity: sector.capacity,
    rows: sector.rows ? sector.rows.map((row) => ({ ...row })) : null,
    position: sector.position,
    batches: [],
  };
}

function batchContext(session: SessionState, sector: SessionSectorState) {
  return {
    capacity: sectorCapacity(sector),
    salesStartsAt: session.salesStartsAt,
    startsAt: session.startsAt,
  };
}
