import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { VenueRepository } from '../infrastructure/venue.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { ConcurrencyConflictError } from '../../shared/errors.js';
import { requireVenue } from './require.js';
import { UpdateVenueDetailsCommand } from './update-venue-details.command.js';

@CommandHandler(UpdateVenueDetailsCommand)
export class UpdateVenueDetailsHandler implements ICommandHandler<UpdateVenueDetailsCommand> {
  constructor(
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateVenueDetailsCommand): Promise<CommandAccepted> {
    const venue = await requireVenue(this.venues, command.venueId, command.actorId);
    const expected = venue.version;
    // Edição com versão esperada (RN-51): divergência vira 409 antes de qualquer mudança.
    if (command.expectedVersion !== expected) throw new ConcurrencyConflictError(venue.id);
    venue.updateDetails(command.details, this.clock.now());
    await this.venues.update(venue, expected);
    return { id: venue.id, version: venue.version };
  }
}
