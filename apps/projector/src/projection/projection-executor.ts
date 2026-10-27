import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AnyEventEnvelope } from '@stubb/contracts';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import { MONGO_CLIENT, MONGO_DB } from '../mongo/mongo.module.js';
import { ProjectionGapError } from './projection-gap.error.js';
import { decideProjection } from './sequence.js';

export interface ProjectionTx {
  session: ClientSession;
  db: Db;
}

interface ProcessedEventDoc {
  _id: string;
  consumer: 'projector';
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  processedAt: Date;
}

interface AggregateVersionDoc {
  _id: string;
  aggregateType: string;
  version: number;
}

/**
 * Mecanismo único de idempotência e ordenação (regra 6): numa transação do MongoDB registra o
 * eventId, confere a sequência por agregado e deixa o read model ser gravado por `apply`.
 */
@Injectable()
export class ProjectionExecutor {
  private readonly logger = new Logger(ProjectionExecutor.name);

  constructor(
    @Inject(MONGO_CLIENT) private readonly client: MongoClient,
    @Inject(MONGO_DB) private readonly db: Db,
  ) {}

  async run(event: AnyEventEnvelope, apply: (tx: ProjectionTx) => Promise<void>): Promise<void> {
    const processed = this.db.collection<ProcessedEventDoc>('processed_events');
    const versions = this.db.collection<AggregateVersionDoc>('aggregate_versions');
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        if (await processed.findOne({ _id: event.eventId }, { session })) return;

        await processed.insertOne(
          {
            _id: event.eventId,
            consumer: 'projector',
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            aggregateVersion: event.aggregateVersion,
            processedAt: new Date(),
          },
          { session },
        );

        const doc = await versions.findOne({ _id: event.aggregateId }, { session });
        const current = doc?.version ?? null;
        const decision = decideProjection(event.aggregateVersion, current);

        if (decision === 'already-applied') {
          this.logger.warn(
            `Evento já refletido: eventId=${event.eventId} aggregateVersion=${event.aggregateVersion} currentVersion=${current}`,
          );
          return;
        }
        if (decision === 'gap') {
          throw new ProjectionGapError(
            event.eventId,
            event.aggregateId,
            event.aggregateVersion,
            current,
          );
        }

        await apply({ session, db: this.db });
        await versions.updateOne(
          { _id: event.aggregateId },
          { $set: { aggregateType: event.aggregateType, version: event.aggregateVersion } },
          { session, upsert: true },
        );
      });
    } finally {
      await session.endSession();
    }
  }
}
