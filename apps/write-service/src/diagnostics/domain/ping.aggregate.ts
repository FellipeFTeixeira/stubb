import { AggregateRoot } from '@nestjs/cqrs';
import { PingCreatedEvent, PingIncrementedEvent, type PingDomainEvent } from './ping.events.js';

export interface PingState {
  id: string;
  label: string;
  count: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// Os eventos só são acumulados (apply); quem os persiste é o repository, na outbox (OQ-27).
export class Ping extends AggregateRoot<PingDomainEvent> {
  private constructor(
    readonly id: string,
    readonly label: string,
    private _count: number,
    private _version: number,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {
    super();
  }

  get count(): number {
    return this._count;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  static create(id: string, label: string, now: Date): Ping {
    const ping = new Ping(id, label, 0, 1, now, now);
    ping.apply(new PingCreatedEvent(id, label, 1, now));
    return ping;
  }

  static rehydrate(state: PingState): Ping {
    return new Ping(
      state.id,
      state.label,
      state.count,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  increment(now: Date): void {
    this._count += 1;
    this._version += 1;
    this._updatedAt = now;
    this.apply(new PingIncrementedEvent(this.id, this._count, this._version, now));
  }
}
