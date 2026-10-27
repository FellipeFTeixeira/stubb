import { AggregateRoot } from '@nestjs/cqrs';
import { CATALOG_LIMITS } from '@stubb/contracts';
import { BusinessRuleViolationError, EntityNotFoundError } from '../../shared/errors.js';
import type { SeatRow, VenueDetails, VenueDomainEvent, VenueSectorState } from './venue.events.js';

export interface VenueState extends VenueDetails {
  id: string;
  organizerId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  sectors: VenueSectorState[];
}

export type NewVenueSector =
  | { id: string; name: string; kind: 'general_admission'; capacity: number }
  | { id: string; name: string; kind: 'seated'; rows: SeatRow[] };

// Comparação de nomes sem diferenciar maiúsculas (RN-8, RN-23, RN-25).
export function toNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}

export function sectorCapacity(sector: Pick<VenueSectorState, 'capacity' | 'rows'>): number {
  if (sector.rows) return sector.rows.reduce((total, row) => total + row.seats, 0);
  return sector.capacity ?? 0;
}

// Os eventos só são acumulados (apply); quem os persiste é o repository, na outbox.
export class Venue extends AggregateRoot<VenueDomainEvent> {
  private constructor(
    readonly id: string,
    readonly organizerId: string,
    private _details: VenueDetails,
    private _version: number,
    readonly createdAt: Date,
    private _updatedAt: Date,
    private _sectors: VenueSectorState[],
  ) {
    super();
  }

  get details(): VenueDetails {
    return { ...this._details };
  }

  get timeZone(): string {
    return this._details.timeZone;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get sectors(): readonly VenueSectorState[] {
    return this._sectors;
  }

  static register(id: string, organizerId: string, details: VenueDetails, now: Date): Venue {
    const venue = new Venue(id, organizerId, { ...details }, 1, now, now, []);
    venue.apply({
      type: 'VenueRegistered',
      venueId: id,
      aggregateVersion: 1,
      occurredAt: now,
      organizerId,
      details: { ...details },
    });
    return venue;
  }

  static rehydrate(state: VenueState): Venue {
    return new Venue(
      state.id,
      state.organizerId,
      {
        name: state.name,
        address: state.address,
        city: state.city,
        state: state.state,
        timeZone: state.timeZone,
      },
      state.version,
      state.createdAt,
      state.updatedAt,
      [...state.sectors].sort((a, b) => a.position - b.position),
    );
  }

  updateDetails(details: VenueDetails, now: Date): void {
    this._details = { ...details };
    this.bump(now);
    this.apply({
      type: 'VenueDetailsUpdated',
      venueId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      details: { ...details },
    });
  }

  addSector(input: NewVenueSector, now: Date): void {
    if (this._sectors.length >= CATALOG_LIMITS.sectorsPerVenueMax) {
      throw new BusinessRuleViolationError('VENUE_SECTOR_LIMIT_REACHED');
    }
    const nameKey = toNameKey(input.name);
    if (this._sectors.some((sector) => sector.nameKey === nameKey)) {
      throw new BusinessRuleViolationError('VENUE_SECTOR_NAME_TAKEN');
    }
    const position = this._sectors.reduce((max, sector) => Math.max(max, sector.position), 0) + 1;
    const sector: VenueSectorState =
      input.kind === 'seated'
        ? {
            id: input.id,
            name: input.name,
            nameKey,
            kind: 'seated',
            capacity: null,
            rows: input.rows.map((row) => ({ ...row })),
            position,
          }
        : {
            id: input.id,
            name: input.name,
            nameKey,
            kind: 'general_admission',
            capacity: input.capacity,
            rows: null,
            position,
          };
    this._sectors.push(sector);
    this.bump(now);
    this.apply({
      type: 'VenueSectorAdded',
      venueId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      sector: structuredClone(sector),
    });
  }

  removeSector(venueSectorId: string, now: Date): void {
    const index = this._sectors.findIndex((sector) => sector.id === venueSectorId);
    if (index < 0) throw new EntityNotFoundError('Venue sector not found');
    this._sectors.splice(index, 1);
    this.bump(now);
    this.apply({
      type: 'VenueSectorRemoved',
      venueId: this.id,
      aggregateVersion: this._version,
      occurredAt: now,
      venueSectorId,
    });
  }

  private bump(now: Date): void {
    this._version += 1;
    this._updatedAt = now;
  }
}
