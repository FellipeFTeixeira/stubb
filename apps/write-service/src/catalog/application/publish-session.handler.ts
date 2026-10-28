import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { requireEvent } from './require.js';
import { PublishSessionCommand } from './publish-session.command.js';

@CommandHandler(PublishSessionCommand)
export class PublishSessionHandler implements ICommandHandler<PublishSessionCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: PublishSessionCommand): Promise<CommandAccepted> {
    const event = await requireEvent(this.events, command.eventId, command.actorId);
    const expected = event.version;
    event.publishSession(command.sessionId, this.clock.now());
    await this.events.update(event, expected);
    return { id: event.id, version: event.version };
  }
}
