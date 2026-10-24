import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PingCreatedV1, PingIncrementedV1 } from '@stubb/contracts';
import type { Db, MongoClient } from 'mongodb';
import { MONGO_CLIENT, MONGO_DB } from '../mongo/mongo.module.js';
import { ProjectionGapError } from './projection-gap.error.js';
import { decideProjection } from './sequence.js';

interface PingDoc {
  _id: string;
  label: string;
  count: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ProcessedEventDoc {
  _id: string;
  consumer: 'projector';
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  processedAt: Date;
}

@Injectable()
export class PingProjection {
  private readonly logger = new Logger(PingProjection.name);

  constructor(
    @Inject(MONGO_CLIENT) private readonly client: MongoClient,
    @Inject(MONGO_DB) private readonly db: Db,
  ) {}

  async apply(event: PingCreatedV1 | PingIncrementedV1): Promise<void> {
    const pings = this.db.collection<PingDoc>('pings');
    const processed = this.db.collection<ProcessedEventDoc>('processed_events');
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

        const doc = await pings.findOne({ _id: event.aggregateId }, { session });
        const current = doc?.version ?? null;
        const decision = decideProjection(event.eventType, event.aggregateVersion, current);

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

        const occurredAt = new Date(event.occurredAt);
        if (event.eventType === 'PingCreated') {
          await pings.insertOne(
            {
              _id: event.aggregateId,
              label: event.payload.label,
              count: 0,
              version: 1,
              createdAt: occurredAt,
              updatedAt: occurredAt,
            },
            { session },
          );
        } else {
          const res = await pings.updateOne(
            { _id: event.aggregateId, version: event.aggregateVersion - 1 },
            {
              $set: {
                count: event.payload.count,
                version: event.aggregateVersion,
                updatedAt: occurredAt,
              },
            },
            { session },
          );
          if (res.matchedCount !== 1) {
            throw new ProjectionGapError(
              event.eventId,
              event.aggregateId,
              event.aggregateVersion,
              current,
            );
          }
        }
      });
    } finally {
      await session.endSession();
    }
  }
}
