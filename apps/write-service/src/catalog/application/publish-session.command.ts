import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class PublishSessionCommand extends Command<CommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly eventId: string,
    readonly sessionId: string,
  ) {
    super();
  }
}
