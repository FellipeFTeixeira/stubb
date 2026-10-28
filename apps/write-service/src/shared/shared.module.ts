import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from './clock/clock.js';
import { IdempotencyCleanupJob } from './idempotency/idempotency-cleanup.job.js';
import { IdempotencyKeyEntity } from './idempotency/idempotency-key.entity.js';
import { IdempotencyService } from './idempotency/idempotency.service.js';
import { OutboxEntity } from './outbox/outbox.entity.js';
import { OutboxWriter } from './outbox/outbox-writer.js';
import { TransactionContext } from './transaction/transaction-context.js';

// Infra transversal dos contextos: transação, outbox, idempotência e relógio.
// O cleanup job fica aqui para existir uma única vez (um cron), mesmo com vários contextos importando.
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEntity, IdempotencyKeyEntity])],
  providers: [TransactionContext, OutboxWriter, IdempotencyService, IdempotencyCleanupJob, Clock],
  exports: [TransactionContext, OutboxWriter, IdempotencyService, Clock],
})
export class SharedModule {}
