import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'outbox' })
export class OutboxEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'bounded_context', type: 'text' })
  boundedContext!: string;

  @Column({ name: 'aggregate_type', type: 'text' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'text' })
  aggregateId!: string;

  // bigint volta como string do driver pg; o transformer converte para number.
  @Column({
    name: 'aggregate_version',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  aggregateVersion!: number;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'schema_version', type: 'integer' })
  schemaVersion!: number;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}
