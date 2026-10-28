import { Command } from '@nestjs/cqrs';
import type { EventDetails } from '../domain/catalog-event.events.js';
import type { CommandAccepted } from '@stubb/contracts';

export class UpdateEventDetailsCommand extends Command<CommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly eventId: string,
    readonly expectedVersion: number,
    readonly details: EventDetails,
  ) {
    super();
  }
}
