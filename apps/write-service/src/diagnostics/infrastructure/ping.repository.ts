import { Injectable } from '@nestjs/common';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import { ConcurrencyConflictError } from '../../shared/errors.js';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { Ping } from '../domain/ping.aggregate.js';
import { PingEntity } from './ping.entity.js';

// Data Mapper: o agregado de domínio e a entity do TypeORM são classes separadas (OQ-34).
@Injectable()
export class PingRepository {
  constructor(
    private readonly transactionContext: TransactionContext,
    private readonly outbox: OutboxWriter,
  ) {}

  async findById(id: string): Promise<Ping | null> {
    const row = await this.transactionContext.manager().findOne(PingEntity, { where: { id } });
    return row ? Ping.rehydrate(row) : null;
  }

  async insert(ping: Ping): Promise<void> {
    await this.transactionContext.manager().insert(PingEntity, {
      id: ping.id,
      label: ping.label,
      count: ping.count,
      version: ping.version,
      createdAt: ping.createdAt,
      updatedAt: ping.updatedAt,
    });
    await this.outbox.append(ping.getUncommittedEvents());
    ping.uncommit();
  }

  // Concorrência otimista: UPDATE condicional na versão lida (OQ-33).
  async update(ping: Ping, expectedVersion: number): Promise<void> {
    const result = await this.transactionContext
      .manager()
      .createQueryBuilder()
      .update(PingEntity)
      .set({ count: ping.count, version: ping.version, updatedAt: ping.updatedAt })
      .where('id = :id AND version = :expected', { id: ping.id, expected: expectedVersion })
      .execute();
    if (result.affected !== 1) throw new ConcurrencyConflictError(ping.id);
    await this.outbox.append(ping.getUncommittedEvents());
    ping.uncommit();
  }
}
