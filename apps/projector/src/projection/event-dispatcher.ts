import { Injectable } from '@nestjs/common';
import { CatalogProjection } from './catalog/catalog.projection.js';
import { PingProjection } from './ping.projection.js';
import { ProjectionExecutor } from './projection-executor.js';
import type { ProjectableEvent } from './topic-registry.js';

type Handlers = {
  [K in ProjectableEvent['eventType']]: (
    event: Extract<ProjectableEvent, { eventType: K }>,
  ) => Promise<void>;
};

@Injectable()
export class EventDispatcher {
  private readonly handlers: Handlers;

  // `catalog` tem default (a projeção não tem estado) para o teste do Ping, que não é desta trilha,
  // continuar construindo o dispatcher com dois argumentos.
  constructor(
    executor: ProjectionExecutor,
    ping: PingProjection,
    catalog: CatalogProjection = new CatalogProjection(),
  ) {
    this.handlers = {
      PingCreated: (e) => executor.run(e, (tx) => ping.apply(e, tx)),
      PingIncremented: (e) => executor.run(e, (tx) => ping.apply(e, tx)),
      VenueRegistered: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      VenueDetailsUpdated: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      VenueSectorAdded: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      VenueSectorRemoved: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      EventCreated: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      EventDetailsUpdated: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      EventDiscarded: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      SessionScheduled: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      SessionRemoved: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      SessionSectorAdded: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      SessionSectorRemoved: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      BatchAdded: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      BatchRemoved: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
      SessionPublished: (e) => executor.run(e, (tx) => catalog.apply(e, tx)),
    };
  }

  dispatch(event: ProjectableEvent): Promise<void> {
    const handler = this.handlers[event.eventType] as (e: ProjectableEvent) => Promise<void>;
    return handler(event);
  }
}
