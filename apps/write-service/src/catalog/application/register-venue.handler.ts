import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { VenueRepository } from '../infrastructure/venue.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { v7 } from 'uuid';
import { Venue } from '../domain/venue.aggregate.js';
import { RegisterVenueCommand } from './register-venue.command.js';

@CommandHandler(RegisterVenueCommand)
export class RegisterVenueHandler implements ICommandHandler<RegisterVenueCommand> {
  constructor(
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RegisterVenueCommand): Promise<CommandAccepted> {
    const id = v7();
    const venue = Venue.register(id, command.actorId, command.details, this.clock.now());
    await this.venues.insert(venue);
    return { id, version: venue.version };
  }
}
