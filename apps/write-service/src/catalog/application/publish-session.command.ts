import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class PublishSessionCommand extends Command<CommandAccepted> {
  constructor(
    readonly eventId: string,
    readonly sessionId: string,
  ) {
    super();
  }
}
