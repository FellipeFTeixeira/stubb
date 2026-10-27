import { Command } from '@nestjs/cqrs';
import type { CommandAccepted, CreateEventRequest } from '@stubb/contracts';

export class CreateEventCommand extends Command<CommandAccepted> {
  constructor(readonly details: CreateEventRequest) {
    super();
  }
}
