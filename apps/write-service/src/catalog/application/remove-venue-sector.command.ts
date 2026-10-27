import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class RemoveVenueSectorCommand extends Command<CommandAccepted> {
  constructor(
    readonly venueId: string,
    readonly venueSectorId: string,
  ) {
    super();
  }
}
