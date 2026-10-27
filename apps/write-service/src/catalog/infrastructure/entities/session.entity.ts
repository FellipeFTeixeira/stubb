import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { EventEntity } from './event.entity.js';
import { VenueEntity } from './venue.entity.js';

@Entity({ name: 'catalog_sessions' })
@Unique('uq_catalog_sessions_event_venue_starts_at', ['eventId', 'venueId', 'startsAt'])
export class SessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: EventEntity;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId!: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venue_id' })
  venue?: VenueEntity;

  @Column({ type: 'text' })
  status!: 'draft' | 'published';

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'sales_starts_at', type: 'timestamptz' })
  salesStartsAt!: Date;

  @Column({ name: 'time_zone', type: 'text' })
  timeZone!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
