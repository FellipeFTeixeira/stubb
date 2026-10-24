import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
@Index('idx_idempotency_keys_created_at', ['createdAt'])
export class IdempotencyKeyEntity {
  @PrimaryColumn({ type: 'uuid' })
  key!: string;

  @PrimaryColumn({ type: 'text' })
  scope!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
