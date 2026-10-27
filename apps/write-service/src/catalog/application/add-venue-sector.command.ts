import { Command } from '@nestjs/cqrs';
import type { AddVenueSectorRequest, EntityCommandAccepted } from '@stubb/contracts';

export class AddVenueSectorCommand extends Command<EntityCommandAccepted> {
  constructor(
    readonly venueId: string,
    readonly sector: AddVenueSectorRequest,
  ) {
    super();
  }
}
