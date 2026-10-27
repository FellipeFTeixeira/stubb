import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class RemoveSessionSectorCommand extends Command<CommandAccepted> {
  constructor(
    readonly eventId: string,
    readonly sessionId: string,
    readonly sessionSectorId: string,
  ) {
    super();
  }
}
