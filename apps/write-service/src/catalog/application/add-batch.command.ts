import { Command } from '@nestjs/cqrs';
import type { AddBatchRequest, EntityCommandAccepted } from '@stubb/contracts';

export class AddBatchCommand extends Command<EntityCommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly eventId: string,
    readonly sessionId: string,
    readonly sessionSectorId: string,
    readonly batch: AddBatchRequest,
  ) {
    super();
  }
}
