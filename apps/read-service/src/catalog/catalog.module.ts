import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { CatalogReadRepository } from './catalog-read.repository.js';
import { CATALOG_QUERY_HANDLERS } from './catalog.handlers.js';
import { OrganizerController } from './organizer.controller.js';
import { PublicEventsController } from './public-events.controller.js';

@Module({
  controllers: [PublicEventsController, OrganizerController],
  providers: [...CATALOG_QUERY_HANDLERS, CatalogReadRepository, Clock],
})
export class CatalogModule {}
