import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { SessionSectorEntity } from './session-sector.entity.js';

@Entity({ name: 'catalog_batches' })
@Unique('uq_catalog_batches_name_key', ['sessionSectorId', 'nameKey'])
@Unique('uq_catalog_batches_position', ['sessionSectorId', 'position'])
export class BatchEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'session_sector_id', type: 'uuid' })
  sessionSectorId!: string;

  @ManyToOne(() => SessionSectorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_sector_id' })
  sessionSector?: SessionSectorEntity;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'name_key', type: 'text' })
  nameKey!: string;

  @Column({ name: 'price_cents', type: 'integer' })
  priceCents!: number;

  @Column({ type: 'integer', nullable: true })
  quantity!: number | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @Column({ type: 'integer' })
  position!: number;
}
