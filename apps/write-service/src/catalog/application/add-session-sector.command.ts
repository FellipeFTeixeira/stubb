import { Command } from '@nestjs/cqrs';
import type { EntityCommandAccepted } from '@stubb/contracts';

export class AddSessionSectorCommand extends Command<EntityCommandAccepted> {
  constructor(
    readonly eventId: string,
    readonly sessionId: string,
    readonly venueSectorId: string,
  ) {
    super();
  }
}
