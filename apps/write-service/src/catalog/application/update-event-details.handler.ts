import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { ConcurrencyConflictError } from '../../shared/errors.js';
import { requireEvent } from './require.js';
import { UpdateEventDetailsCommand } from './update-event-details.command.js';

@CommandHandler(UpdateEventDetailsCommand)
export class UpdateEventDetailsHandler implements ICommandHandler<UpdateEventDetailsCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateEventDetailsCommand): Promise<CommandAccepted> {
    const event = await requireEvent(this.events, command.eventId, command.actorId);
    const expected = event.version;
    // Edição com versão esperada (RN-51): divergência vira 409 antes de qualquer mudança.
    if (command.expectedVersion !== expected) throw new ConcurrencyConflictError(event.id);
    event.updateDetails(command.details, this.clock.now());
    await this.events.update(event, expected);
    return { id: event.id, version: event.version };
  }
}
