import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { EntityCommandAccepted } from '@stubb/contracts';
import { VenueRepository } from '../infrastructure/venue.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { v7 } from 'uuid';
import { requireVenue } from './require.js';
import { AddVenueSectorCommand } from './add-venue-sector.command.js';

@CommandHandler(AddVenueSectorCommand)
export class AddVenueSectorHandler implements ICommandHandler<AddVenueSectorCommand> {
  constructor(
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: AddVenueSectorCommand): Promise<EntityCommandAccepted> {
    const venue = await requireVenue(this.venues, command.venueId, command.actorId);
    const expected = venue.version;
    const sectorId = v7();
    venue.addSector({ id: sectorId, ...command.sector }, this.clock.now());
    await this.venues.update(venue, expected);
    return { id: venue.id, version: venue.version, entityId: sectorId };
  }
}
