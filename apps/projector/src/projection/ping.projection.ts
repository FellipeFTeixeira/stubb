import { Injectable } from '@nestjs/common';
import type { PingCreatedV1, PingIncrementedV1 } from '@stubb/contracts';
import { ProjectionGapError } from './projection-gap.error.js';
import type { ProjectionTx } from './projection-executor.js';

interface PingDoc {
  _id: string;
  label: string;
  count: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// Só grava o read model; idempotência e sequência ficam no ProjectionExecutor.
@Injectable()
export class PingProjection {
  async apply(event: PingCreatedV1 | PingIncrementedV1, tx: ProjectionTx): Promise<void> {
    const pings = tx.db.collection<PingDoc>('pings');
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
        { session: tx.session },
      );
      return;
    }
    const res = await pings.updateOne(
      { _id: event.aggregateId, version: event.aggregateVersion - 1 },
      {
        $set: {
          count: event.payload.count,
          version: event.aggregateVersion,
          updatedAt: occurredAt,
        },
      },
      { session: tx.session },
    );
    // Defesa: o executor já checou a sequência; se o documento não casar, é lacuna.
    if (res.matchedCount !== 1) {
      throw new ProjectionGapError(event.eventId, event.aggregateId, event.aggregateVersion, null);
    }
  }
}
