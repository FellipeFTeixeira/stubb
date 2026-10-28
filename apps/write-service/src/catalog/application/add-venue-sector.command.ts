import { Command } from '@nestjs/cqrs';
import type { AddVenueSectorRequest, EntityCommandAccepted } from '@stubb/contracts';

export class AddVenueSectorCommand extends Command<EntityCommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly venueId: string,
    readonly sector: AddVenueSectorRequest,
  ) {
    super();
  }
}
