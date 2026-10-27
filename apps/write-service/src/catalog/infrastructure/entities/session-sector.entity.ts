import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { SessionEntity } from './session.entity.js';

@Entity({ name: 'catalog_session_sectors' })
@Unique('uq_catalog_session_sectors_venue_sector', ['sessionId', 'venueSectorId'])
@Unique('uq_catalog_session_sectors_name_key', ['sessionId', 'nameKey'])
export class SessionSectorEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: SessionEntity;

  // Sem FK: a cópia sobrevive à remoção do setor da planta (RN-9).
  @Column({ name: 'venue_sector_id', type: 'uuid' })
  venueSectorId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'name_key', type: 'text' })
  nameKey!: string;

  @Column({ type: 'text' })
  kind!: 'general_admission' | 'seated';

  @Column({ type: 'integer', nullable: true })
  capacity!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  rows!: Array<{ label: string; seats: number }> | null;

  @Column({ type: 'integer' })
  position!: number;
}
