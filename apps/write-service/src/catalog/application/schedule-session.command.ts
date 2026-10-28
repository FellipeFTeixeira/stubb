import { Command } from '@nestjs/cqrs';
import type { EntityCommandAccepted, ScheduleSessionRequest } from '@stubb/contracts';

export class ScheduleSessionCommand extends Command<EntityCommandAccepted> {
  constructor(
    readonly actorId: string,
    readonly eventId: string,
    readonly request: ScheduleSessionRequest,
  ) {
    super();
  }
}
