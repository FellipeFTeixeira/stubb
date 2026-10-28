import { Command } from '@nestjs/cqrs';
import type { CommandAccepted, CreateEventRequest } from '@stubb/contracts';

export class CreateEventCommand extends Command<CommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly details: CreateEventRequest,
  ) {
    super();
  }
}
