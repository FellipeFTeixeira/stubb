import { Module } from '@nestjs/common';
import { GetPingHandler } from './get-ping.handler.js';
import { PingReadRepository } from './ping-read.repository.js';
import { PingsController } from './pings.controller.js';

@Module({
  controllers: [PingsController],
  providers: [GetPingHandler, PingReadRepository],
})
export class DiagnosticsModule {}
