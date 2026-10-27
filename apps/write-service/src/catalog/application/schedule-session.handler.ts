import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { EntityCommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { VenueRepository } from '../infrastructure/venue.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { v7 } from 'uuid';
import { BusinessRuleViolationError } from '../../shared/errors.js';
import { requireEvent } from './require.js';
import { ScheduleSessionCommand } from './schedule-session.command.js';

@CommandHandler(ScheduleSessionCommand)
export class ScheduleSessionHandler implements ICommandHandler<ScheduleSessionCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ScheduleSessionCommand): Promise<EntityCommandAccepted> {
    const event = await requireEvent(this.events, command.eventId);
    const expected = event.version;
    const { request } = command;
    const venue = await this.venues.findById(request.venueId);
    if (!venue) throw new BusinessRuleViolationError('VENUE_NOT_FOUND');
    const sessionId = v7();
    event.scheduleSession(
      {
        sessionId,
        venue,
        startsAt: new Date(request.startsAt),
        salesStartsAt: new Date(request.salesStartsAt),
        timeZone: request.timeZone,
        sectorIds: venue.sectors.map(() => v7()),
      },
      this.clock.now(),
    );
    await this.events.update(event, expected);
    return { id: event.id, version: event.version, entityId: sessionId };
  }
}
