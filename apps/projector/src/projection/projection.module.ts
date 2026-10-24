import { Module } from '@nestjs/common';
import { EventDispatcher } from './event-dispatcher.js';
import { PingProjection } from './ping.projection.js';

@Module({ providers: [PingProjection, EventDispatcher], exports: [EventDispatcher] })
export class ProjectionModule {}
