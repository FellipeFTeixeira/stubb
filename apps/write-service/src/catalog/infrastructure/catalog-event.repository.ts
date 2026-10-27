import { Injectable } from '@nestjs/common';
import { BOUNDED_CONTEXT_CATALOG } from '@stubb/contracts';
import { In } from 'typeorm';
import { ConcurrencyConflictError } from '../../shared/errors.js';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { CatalogEvent } from '../domain/catalog-event.aggregate.js';
import { toNameKey } from '../domain/venue.aggregate.js';
import { toCatalogEnvelopes } from './catalog-event.mapper.js';
import { BatchEntity } from './entities/batch.entity.js';
import { EventEntity } from './entities/event.entity.js';
import { SessionSectorEntity } from './entities/session-sector.entity.js';
import { SessionEntity } from './entities/session.entity.js';

@Injectable()
export class CatalogEventRepository {
  constructor(
    private readonly transactionContext: TransactionContext,
    private readonly outbox: OutboxWriter,
  ) {}

  async findById(id: string): Promise<CatalogEvent | null> {
    const manager = this.transactionContext.manager();
    const row = await manager.findOne(EventEntity, { where: { id } });
    if (!row) return null;
    const sessions = await manager.find(SessionEntity, {
      where: { eventId: id },
      order: { startsAt: 'ASC', id: 'ASC' },
    });
    const sessionIds = sessions.map((session) => session.id);
    const sectors = sessionIds.length
      ? await manager.find(SessionSectorEntity, { where: { sessionId: In(sessionIds) } })
      : [];
    const sectorIds = sectors.map((sector) => sector.id);
    const batches = sectorIds.length
      ? await manager.find(BatchEntity, { where: { sessionSectorId: In(sectorIds) } })
      : [];
    return CatalogEvent.rehydrate({
      ...row,
      sessions: sessions.map((session) => ({
        id: session.id,
        venueId: session.venueId,
        status: session.status,
        startsAt: session.startsAt,
        salesStartsAt: session.salesStartsAt,
        timeZone: session.timeZone,
        createdAt: session.createdAt,
        sectors: sectors
          .filter((sector) => sector.sessionId === session.id)
          .map((sector) => ({
            id: sector.id,
            venueSectorId: sector.venueSectorId,
            name: sector.name,
            kind: sector.kind,
            capacity: sector.capacity,
            rows: sector.rows,
            position: sector.position,
            batches: batches
              .filter((batch) => batch.sessionSectorId === sector.id)
              .map((batch) => ({
                id: batch.id,
                name: batch.name,
                priceCents: batch.priceCents,
                quantity: batch.quantity,
                endsAt: batch.endsAt,
                position: batch.position,
              })),
          })),
      })),
    });
  }

  async insert(event: CatalogEvent): Promise<void> {
    await this.transactionContext.manager().insert(EventEntity, {
      id: event.id,
      organizerId: event.organizerId,
      ...event.details,
      status: event.status,
      version: event.version,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });
    await this.syncChildren(event);
    await this.publishEvents(event);
  }

  // Concorrência otimista: UPDATE condicional na versão lida. Como a raiz é atualizada antes dos
  // filhos, ela também serializa duas mutações concorrentes do mesmo evento (a perdedora vira 409).
  async update(event: CatalogEvent, expectedVersion: number): Promise<void> {
    const result = await this.transactionContext
      .manager()
      .createQueryBuilder()
      .update(EventEntity)
      .set({
        ...event.details,
        status: event.status,
        version: event.version,
        updatedAt: event.updatedAt,
      })
      .where('id = :id AND version = :expected', { id: event.id, expected: expectedVersion })
      .execute();
    if (result.affected !== 1) throw new ConcurrencyConflictError(event.id);
    await this.syncChildren(event);
    await this.publishEvents(event);
  }

  // Descarte definitivo: as FKs com CASCADE levam sessões, setores e lotes junto.
  async delete(event: CatalogEvent, expectedVersion: number): Promise<void> {
    const result = await this.transactionContext
      .manager()
      .createQueryBuilder()
      .delete()
      .from(EventEntity)
      .where('id = :id AND version = :expected', { id: event.id, expected: expectedVersion })
      .execute();
    if (result.affected !== 1) throw new ConcurrencyConflictError(event.id);
    await this.publishEvents(event);
  }

  private async publishEvents(event: CatalogEvent): Promise<void> {
    await this.outbox.append(
      BOUNDED_CONTEXT_CATALOG,
      toCatalogEnvelopes(event.getUncommittedEvents()),
    );
    event.uncommit();
  }

  // Sincroniza a árvore: remove o que saiu, insere o que entrou e propaga a publicação das sessões.
  private async syncChildren(event: CatalogEvent): Promise<void> {
    const manager = this.transactionContext.manager();
    const sessions = event.sessions;
    const sessionIds = sessions.map((session) => session.id);
    const sectors = sessions.flatMap((session) =>
      session.sectors.map((sector) => ({ sessionId: session.id, sector })),
    );
    const sectorIds = sectors.map(({ sector }) => sector.id);
    const batches = sectors.flatMap(({ sector }) =>
      sector.batches.map((batch) => ({ sectorId: sector.id, batch })),
    );

    await manager.query(
      'DELETE FROM catalog_sessions WHERE event_id = $1 AND id <> ALL($2::uuid[])',
      [event.id, sessionIds],
    );
    await manager.query(
      'DELETE FROM catalog_session_sectors WHERE session_id = ANY($1::uuid[]) AND id <> ALL($2::uuid[])',
      [sessionIds, sectorIds],
    );
    await manager.query(
      'DELETE FROM catalog_batches WHERE session_sector_id = ANY($1::uuid[]) AND id <> ALL($2::uuid[])',
      [sectorIds, batches.map(({ batch }) => batch.id)],
    );

    const knownSessions = new Set(
      (
        await manager.find(SessionEntity, { where: { eventId: event.id }, select: { id: true } })
      ).map((row) => row.id),
    );
    const newSessions = sessions.filter((session) => !knownSessions.has(session.id));
    if (newSessions.length > 0) {
      await manager.insert(
        SessionEntity,
        newSessions.map((session) => ({
          id: session.id,
          eventId: event.id,
          venueId: session.venueId,
          status: session.status,
          startsAt: session.startsAt,
          salesStartsAt: session.salesStartsAt,
          timeZone: session.timeZone,
          createdAt: session.createdAt,
        })),
      );
    }
    const published = sessions.filter((session) => session.status === 'published');
    if (published.length > 0) {
      await manager.query(
        "UPDATE catalog_sessions SET status = 'published' WHERE id = ANY($1::uuid[]) AND status <> 'published'",
        [published.map((session) => session.id)],
      );
    }

    const knownSectors = new Set(
      sessionIds.length
        ? (
            await manager.find(SessionSectorEntity, {
              where: { sessionId: In(sessionIds) },
              select: { id: true },
            })
          ).map((row) => row.id)
        : [],
    );
    const newSectors = sectors.filter(({ sector }) => !knownSectors.has(sector.id));
    if (newSectors.length > 0) {
      await manager.insert(
        SessionSectorEntity,
        newSectors.map(({ sessionId, sector }) => ({
          id: sector.id,
          sessionId,
          venueSectorId: sector.venueSectorId,
          name: sector.name,
          nameKey: toNameKey(sector.name),
          kind: sector.kind,
          capacity: sector.capacity,
          rows: sector.rows,
          position: sector.position,
        })),
      );
    }

    const knownBatches = new Set(
      sectorIds.length
        ? (
            await manager.find(BatchEntity, {
              where: { sessionSectorId: In(sectorIds) },
              select: { id: true },
            })
          ).map((row) => row.id)
        : [],
    );
    const newBatches = batches.filter(({ batch }) => !knownBatches.has(batch.id));
    if (newBatches.length > 0) {
      await manager.insert(
        BatchEntity,
        newBatches.map(({ sectorId, batch }) => ({
          id: batch.id,
          sessionSectorId: sectorId,
          name: batch.name,
          nameKey: toNameKey(batch.name),
          priceCents: batch.priceCents,
          quantity: batch.quantity,
          endsAt: batch.endsAt,
          position: batch.position,
        })),
      );
    }
  }
}
