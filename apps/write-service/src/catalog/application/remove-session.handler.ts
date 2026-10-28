import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { requireEvent } from './require.js';
import { RemoveSessionCommand } from './remove-session.command.js';

@CommandHandler(RemoveSessionCommand)
export class RemoveSessionHandler implements ICommandHandler<RemoveSessionCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RemoveSessionCommand): Promise<CommandAccepted> {
    const event = await requireEvent(this.events, command.eventId, command.actorId);
    const expected = event.version;
    event.removeSession(command.sessionId, this.clock.now());
    await this.events.update(event, expected);
    return { id: event.id, version: event.version };
  }
}
