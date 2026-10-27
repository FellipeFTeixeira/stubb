import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module.js';
import { CreatePingHandler } from './application/create-ping.handler.js';
import { IncrementPingHandler } from './application/increment-ping.handler.js';
import { PingsController } from './http/pings.controller.js';
import { PingEntity } from './infrastructure/ping.entity.js';
import { PingRepository } from './infrastructure/ping.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([PingEntity]), SharedModule],
  controllers: [PingsController],
  providers: [CreatePingHandler, IncrementPingHandler, PingRepository],
})
export class DiagnosticsModule {}
