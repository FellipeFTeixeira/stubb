import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class DiscardEventCommand extends Command<CommandAccepted> {
  constructor(readonly eventId: string) {
    super();
  }
}
