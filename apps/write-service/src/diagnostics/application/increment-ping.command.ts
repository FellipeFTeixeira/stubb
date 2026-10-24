import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class IncrementPingCommand extends Command<CommandAccepted> {
  constructor(readonly id: string) {
    super();
  }
}
