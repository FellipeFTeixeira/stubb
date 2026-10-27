import { Module } from '@nestjs/common';
import { CatalogProjection } from './catalog/catalog.projection.js';
import { EventDispatcher } from './event-dispatcher.js';
import { PingProjection } from './ping.projection.js';
import { ProjectionExecutor } from './projection-executor.js';

@Module({
  providers: [ProjectionExecutor, PingProjection, CatalogProjection, EventDispatcher],
  exports: [EventDispatcher],
})
export class ProjectionModule {}
