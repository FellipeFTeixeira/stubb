import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { loadConfig } from '../config.js';
import { CatalogReadRepository } from './catalog-read.repository.js';
import { CATALOG_QUERY_HANDLERS } from './catalog.handlers.js';
import { OrganizerController } from './organizer.controller.js';
import { PublicEventsController } from './public-events.controller.js';
import { SEED_ORGANIZER_ID } from './seed-organizer.js';

@Module({
  controllers: [PublicEventsController, OrganizerController],
  providers: [
    ...CATALOG_QUERY_HANDLERS,
    CatalogReadRepository,
    Clock,
    { provide: SEED_ORGANIZER_ID, useFactory: (): string => loadConfig().seedOrganizerId },
  ],
})
export class CatalogModule {}
