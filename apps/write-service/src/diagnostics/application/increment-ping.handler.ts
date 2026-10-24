import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { AggregateNotFoundError } from '../../shared/errors.js';
import { PingRepository } from '../infrastructure/ping.repository.js';
import { IncrementPingCommand } from './increment-ping.command.js';

@CommandHandler(IncrementPingCommand)
export class IncrementPingHandler implements ICommandHandler<IncrementPingCommand> {
  constructor(private readonly repository: PingRepository) {}

  async execute(command: IncrementPingCommand): Promise<CommandAccepted> {
    const ping = await this.repository.findById(command.id);
    if (!ping) throw new AggregateNotFoundError('Ping not found');
    const expected = ping.version;
    ping.increment(new Date());
    await this.repository.update(ping, expected);
    return { id: ping.id, version: ping.version };
  }
}
