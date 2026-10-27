import { Command } from '@nestjs/cqrs';
import type { CommandAccepted, RegisterVenueRequest } from '@stubb/contracts';

export class RegisterVenueCommand extends Command<CommandAccepted> {
  constructor(readonly details: RegisterVenueRequest) {
    super();
  }
}
