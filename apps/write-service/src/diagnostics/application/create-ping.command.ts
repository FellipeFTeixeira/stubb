import { Command } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';

export class CreatePingCommand extends Command<CommandAccepted> {
  constructor(readonly label: string) {
    super();
  }
}
