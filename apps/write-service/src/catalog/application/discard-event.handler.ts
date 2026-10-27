import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { requireEvent } from './require.js';
import { DiscardEventCommand } from './discard-event.command.js';

@CommandHandler(DiscardEventCommand)
export class DiscardEventHandler implements ICommandHandler<DiscardEventCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: DiscardEventCommand): Promise<CommandAccepted> {
    const event = await requireEvent(this.events, command.eventId);
    const expected = event.version;
    event.discard(this.clock.now());
    await this.events.delete(event, expected);
    return { id: event.id, version: event.version };
  }
}
