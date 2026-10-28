import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class RemoveBatchCommand extends Command<CommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly eventId: string,
    readonly sessionId: string,
    readonly sessionSectorId: string,
    readonly batchId: string,
  ) {
    super();
  }
}
