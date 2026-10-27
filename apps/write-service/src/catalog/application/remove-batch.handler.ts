import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { requireEvent } from './require.js';
import { RemoveBatchCommand } from './remove-batch.command.js';

@CommandHandler(RemoveBatchCommand)
export class RemoveBatchHandler implements ICommandHandler<RemoveBatchCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RemoveBatchCommand): Promise<CommandAccepted> {
    const event = await requireEvent(this.events, command.eventId);
    const expected = event.version;
    event.removeBatch(
      command.sessionId,
      command.sessionSectorId,
      command.batchId,
      this.clock.now(),
    );
    await this.events.update(event, expected);
    return { id: event.id, version: event.version };
  }
}
