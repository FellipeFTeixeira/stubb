import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { VenueEntity } from './venue.entity.js';

@Entity({ name: 'catalog_venue_sectors' })
@Unique('uq_catalog_venue_sectors_name_key', ['venueId', 'nameKey'])
export class VenueSectorEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId!: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id' })
  venue?: VenueEntity;

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
