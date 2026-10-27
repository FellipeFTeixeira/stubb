import { Injectable } from '@nestjs/common';
import { BOUNDED_CONTEXT_CATALOG } from '@stubb/contracts';
import { ConcurrencyConflictError } from '../../shared/errors.js';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { Venue } from '../domain/venue.aggregate.js';
import { toCatalogEnvelopes } from './catalog-event.mapper.js';
import { VenueSectorEntity } from './entities/venue-sector.entity.js';
import { VenueEntity } from './entities/venue.entity.js';

// Data Mapper: o agregado de domínio e as entities do TypeORM são classes separadas.
@Injectable()
export class VenueRepository {
  constructor(
    private readonly transactionContext: TransactionContext,
    private readonly outbox: OutboxWriter,
  ) {}

  async findById(id: string): Promise<Venue | null> {
    const manager = this.transactionContext.manager();
    const row = await manager.findOne(VenueEntity, { where: { id } });
    if (!row) return null;
    const sectors = await manager.find(VenueSectorEntity, {
      where: { venueId: id },
      order: { position: 'ASC' },
    });
    return Venue.rehydrate({ ...row, sectors });
  }

  async insert(venue: Venue): Promise<void> {
    await this.transactionContext.manager().insert(VenueEntity, {
      id: venue.id,
      organizerId: venue.organizerId,
      ...venue.details,
      version: venue.version,
      createdAt: venue.createdAt,
      updatedAt: venue.updatedAt,
    });
    await this.syncSectors(venue);
    await this.publishEvents(venue);
  }

  // Concorrência otimista: UPDATE condicional na versão lida; a linha raiz também serializa os filhos.
  async update(venue: Venue, expectedVersion: number): Promise<void> {
    const result = await this.transactionContext
      .manager()
      .createQueryBuilder()
      .update(VenueEntity)
      .set({ ...venue.details, version: venue.version, updatedAt: venue.updatedAt })
      .where('id = :id AND version = :expected', { id: venue.id, expected: expectedVersion })
      .execute();
    if (result.affected !== 1) throw new ConcurrencyConflictError(venue.id);
    await this.syncSectors(venue);
    await this.publishEvents(venue);
  }

  private async publishEvents(venue: Venue): Promise<void> {
    await this.outbox.append(
      BOUNDED_CONTEXT_CATALOG,
      toCatalogEnvelopes(venue.getUncommittedEvents()),
    );
    venue.uncommit();
  }

  private async syncSectors(venue: Venue): Promise<void> {
    const manager = this.transactionContext.manager();
    const ids = venue.sectors.map((sector) => sector.id);
    await manager.query(
      'DELETE FROM catalog_venue_sectors WHERE venue_id = $1 AND id <> ALL($2::uuid[])',
      [venue.id, ids],
    );
    const existing = await manager.find(VenueSectorEntity, {
      where: { venueId: venue.id },
      select: { id: true },
    });
    const known = new Set(existing.map((row) => row.id));
    const added = venue.sectors.filter((sector) => !known.has(sector.id));
    if (added.length === 0) return;
    await manager.insert(
      VenueSectorEntity,
      added.map((sector) => ({
        id: sector.id,
        venueId: venue.id,
        name: sector.name,
        nameKey: sector.nameKey,
        kind: sector.kind,
        capacity: sector.capacity,
        rows: sector.rows,
        position: sector.position,
      })),
    );
  }
}
