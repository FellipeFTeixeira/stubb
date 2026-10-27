import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { requireEvent } from './require.js';
import { RemoveSessionSectorCommand } from './remove-session-sector.command.js';

@CommandHandler(RemoveSessionSectorCommand)
export class RemoveSessionSectorHandler implements ICommandHandler<RemoveSessionSectorCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RemoveSessionSectorCommand): Promise<CommandAccepted> {
    const event = await requireEvent(this.events, command.eventId);
    const expected = event.version;
    event.removeSessionSector(command.sessionId, command.sessionSectorId, this.clock.now());
    await this.events.update(event, expected);
    return { id: event.id, version: event.version };
  }
}
