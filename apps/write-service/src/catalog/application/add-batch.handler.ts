import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { EntityCommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { v7 } from 'uuid';
import { requireEvent } from './require.js';
import { AddBatchCommand } from './add-batch.command.js';

@CommandHandler(AddBatchCommand)
export class AddBatchHandler implements ICommandHandler<AddBatchCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: AddBatchCommand): Promise<EntityCommandAccepted> {
    const event = await requireEvent(this.events, command.eventId);
    const expected = event.version;
    const { batch } = command;
    const batchId = v7();
    event.addBatch(
      command.sessionId,
      command.sessionSectorId,
      {
        name: batch.name,
        priceCents: batch.priceCents,
        quantity: batch.quantity,
        endsAt: batch.endsAt ? new Date(batch.endsAt) : null,
      },
      batchId,
      this.clock.now(),
    );
    await this.events.update(event, expected);
    return { id: event.id, version: event.version, entityId: batchId };
  }
}
