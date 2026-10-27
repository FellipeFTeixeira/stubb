import { Command } from '@nestjs/cqrs';
import type { VenueDetails } from '../domain/venue.events.js';
import type { CommandAccepted } from '@stubb/contracts';

export class UpdateVenueDetailsCommand extends Command<CommandAccepted> {
  constructor(
    readonly venueId: string,
    readonly expectedVersion: number,
    readonly details: VenueDetails,
  ) {
    super();
  }
}
