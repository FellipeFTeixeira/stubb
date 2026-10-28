import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { VenueRepository } from '../infrastructure/venue.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { requireVenue } from './require.js';
import { RemoveVenueSectorCommand } from './remove-venue-sector.command.js';

@CommandHandler(RemoveVenueSectorCommand)
export class RemoveVenueSectorHandler implements ICommandHandler<RemoveVenueSectorCommand> {
  constructor(
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RemoveVenueSectorCommand): Promise<CommandAccepted> {
    const venue = await requireVenue(this.venues, command.venueId, command.actorId);
    const expected = venue.version;
    venue.removeSector(command.venueSectorId, this.clock.now());
    await this.venues.update(venue, expected);
    return { id: venue.id, version: venue.version };
  }
}
