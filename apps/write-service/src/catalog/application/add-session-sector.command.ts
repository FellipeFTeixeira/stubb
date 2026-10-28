import { Command } from '@nestjs/cqrs';
import type { EntityCommandAccepted } from '@stubb/contracts';

export class AddSessionSectorCommand extends Command<EntityCommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly eventId: string,
    readonly sessionId: string,
    readonly venueSectorId: string,
  ) {
    super();
  }
}
