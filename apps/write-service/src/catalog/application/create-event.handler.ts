import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { v7 } from 'uuid';
import { CatalogEvent } from '../domain/catalog-event.aggregate.js';
import { CreateEventCommand } from './create-event.command.js';

@CommandHandler(CreateEventCommand)
export class CreateEventHandler implements ICommandHandler<CreateEventCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateEventCommand): Promise<CommandAccepted> {
    const id = v7();
    const event = CatalogEvent.create(id, command.actorId, command.details, this.clock.now());
    await this.events.insert(event);
    return { id, version: event.version };
  }
}
