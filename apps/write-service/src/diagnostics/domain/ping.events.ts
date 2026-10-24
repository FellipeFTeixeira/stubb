import type { IEvent } from '@nestjs/cqrs';

export class PingCreatedEvent implements IEvent {
  constructor(
    readonly pingId: string,
    readonly label: string,
    readonly aggregateVersion: number,
    readonly occurredAt: Date,
  ) {}
}

export class PingIncrementedEvent implements IEvent {
  constructor(
    readonly pingId: string,
    readonly count: number,
    readonly aggregateVersion: number,
    readonly occurredAt: Date,
  ) {}
}

export type PingDomainEvent = PingCreatedEvent | PingIncrementedEvent;
