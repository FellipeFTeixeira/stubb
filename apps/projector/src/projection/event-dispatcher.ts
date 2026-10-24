import { Injectable } from '@nestjs/common';
import type { DiagnosticsEvent } from '@stubb/contracts';
import { PingProjection } from './ping.projection.js';

type Handlers = {
  [K in DiagnosticsEvent['eventType']]: (
    event: Extract<DiagnosticsEvent, { eventType: K }>,
  ) => Promise<void>;
};

@Injectable()
export class EventDispatcher {
  private readonly handlers: Handlers;

  constructor(projection: PingProjection) {
    this.handlers = {
      PingCreated: (e) => projection.apply(e),
      PingIncremented: (e) => projection.apply(e),
    };
  }

  dispatch(event: DiagnosticsEvent): Promise<void> {
    const handler = this.handlers[event.eventType] as (e: DiagnosticsEvent) => Promise<void>;
    return handler(event);
  }
}
