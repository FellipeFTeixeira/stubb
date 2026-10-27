import { Injectable } from '@nestjs/common';
import type { AnyEventEnvelope } from '@stubb/contracts';
import { TransactionContext } from '../transaction/transaction-context.js';
import { OutboxEntity } from './outbox.entity.js';

// Genérico: não valida nem conhece domínio. Quem monta (e valida) o envelope é o mapper do contexto.
@Injectable()
export class OutboxWriter {
  constructor(private readonly transactionContext: TransactionContext) {}

  async append(boundedContext: string, envelopes: readonly AnyEventEnvelope[]): Promise<void> {
    for (const envelope of envelopes) {
      await this.transactionContext.manager().insert(OutboxEntity, {
        id: envelope.eventId,
        boundedContext,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
        eventType: envelope.eventType,
        schemaVersion: envelope.schemaVersion,
        occurredAt: new Date(envelope.occurredAt),
        payload: envelope as unknown as Record<string, never>,
      });
    }
  }
}
