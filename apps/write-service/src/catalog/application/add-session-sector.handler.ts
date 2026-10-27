import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { EntityCommandAccepted } from '@stubb/contracts';
import { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import { VenueRepository } from '../infrastructure/venue.repository.js';
import { Clock } from '../../shared/clock/clock.js';
import { v7 } from 'uuid';
import { BusinessRuleViolationError } from '../../shared/errors.js';
import { requireEvent } from './require.js';
import { AddSessionSectorCommand } from './add-session-sector.command.js';

@CommandHandler(AddSessionSectorCommand)
export class AddSessionSectorHandler implements ICommandHandler<AddSessionSectorCommand> {
  constructor(
    private readonly events: CatalogEventRepository,
    private readonly venues: VenueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: AddSessionSectorCommand): Promise<EntityCommandAccepted> {
    const event = await requireEvent(this.events, command.eventId);
    const expected = event.version;
    // A planta atual do local da sessão é a origem da nova cópia do setor (RN-23).
    const venue = await this.venues.findById(event.sessionVenueId(command.sessionId));
    if (!venue) throw new BusinessRuleViolationError('VENUE_NOT_FOUND');
    const sessionSectorId = v7();
    event.addSessionSector(
      command.sessionId,
      venue,
      command.venueSectorId,
      sessionSectorId,
      this.clock.now(),
    );
    await this.events.update(event, expected);
    return { id: event.id, version: event.version, entityId: sessionSectorId };
  }
}
