import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyCleanupJob } from '../shared/idempotency/idempotency-cleanup.job.js';
import { IdempotencyKeyEntity } from '../shared/idempotency/idempotency-key.entity.js';
import { IdempotencyService } from '../shared/idempotency/idempotency.service.js';
import { OutboxEntity } from '../shared/outbox/outbox.entity.js';
import { OutboxWriter } from '../shared/outbox/outbox-writer.js';
import { TransactionContext } from '../shared/transaction/transaction-context.js';
import { CreatePingHandler } from './application/create-ping.handler.js';
import { IncrementPingHandler } from './application/increment-ping.handler.js';
import { PingsController } from './http/pings.controller.js';
import { PingEntity } from './infrastructure/ping.entity.js';
import { PingRepository } from './infrastructure/ping.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([PingEntity, OutboxEntity, IdempotencyKeyEntity])],
  controllers: [PingsController],
  providers: [
    CreatePingHandler,
    IncrementPingHandler,
    PingRepository,
    OutboxWriter,
    TransactionContext,
    IdempotencyService,
    IdempotencyCleanupJob,
  ],
})
export class DiagnosticsModule {}
