import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module.js';
import { AddBatchHandler } from './application/add-batch.handler.js';
import { AddSessionSectorHandler } from './application/add-session-sector.handler.js';
import { AddVenueSectorHandler } from './application/add-venue-sector.handler.js';
import { CreateEventHandler } from './application/create-event.handler.js';
import { DiscardEventHandler } from './application/discard-event.handler.js';
import { PublishSessionHandler } from './application/publish-session.handler.js';
import { RegisterVenueHandler } from './application/register-venue.handler.js';
import { RemoveBatchHandler } from './application/remove-batch.handler.js';
import { RemoveSessionSectorHandler } from './application/remove-session-sector.handler.js';
import { RemoveSessionHandler } from './application/remove-session.handler.js';
import { RemoveVenueSectorHandler } from './application/remove-venue-sector.handler.js';
import { ScheduleSessionHandler } from './application/schedule-session.handler.js';
import { UpdateEventDetailsHandler } from './application/update-event-details.handler.js';
import { UpdateVenueDetailsHandler } from './application/update-venue-details.handler.js';
import { CatalogEventRepository } from './infrastructure/catalog-event.repository.js';
import { CATALOG_ENTITIES } from './infrastructure/entities/index.js';
import { VenueRepository } from './infrastructure/venue.repository.js';
import { EventsController } from './http/events.controller.js';
import { VenuesController } from './http/venues.controller.js';

const handlers = [
  RegisterVenueHandler,
  UpdateVenueDetailsHandler,
  AddVenueSectorHandler,
  RemoveVenueSectorHandler,
  CreateEventHandler,
  UpdateEventDetailsHandler,
  DiscardEventHandler,
  ScheduleSessionHandler,
  RemoveSessionHandler,
  AddSessionSectorHandler,
  RemoveSessionSectorHandler,
  AddBatchHandler,
  RemoveBatchHandler,
  PublishSessionHandler,
];

@Module({
  imports: [TypeOrmModule.forFeature([...CATALOG_ENTITIES]), SharedModule],
  controllers: [VenuesController, EventsController],
  providers: [...handlers, VenueRepository, CatalogEventRepository],
})
export class CatalogModule {}
