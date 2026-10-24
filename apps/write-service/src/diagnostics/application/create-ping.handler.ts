import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { CommandAccepted } from '@stubb/contracts';
import { v7 } from 'uuid';
import { Ping } from '../domain/ping.aggregate.js';
import { PingRepository } from '../infrastructure/ping.repository.js';
import { CreatePingCommand } from './create-ping.command.js';

@CommandHandler(CreatePingCommand)
export class CreatePingHandler implements ICommandHandler<CreatePingCommand> {
  constructor(private readonly repository: PingRepository) {}

  async execute(command: CreatePingCommand): Promise<CommandAccepted> {
    const id = v7();
    const ping = Ping.create(id, command.label, new Date());
    await this.repository.insert(ping);
    return { id, version: 1 };
  }
}
