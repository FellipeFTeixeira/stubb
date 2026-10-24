import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'diagnostics_pings' })
export class PingEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'integer' })
  count!: number;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
