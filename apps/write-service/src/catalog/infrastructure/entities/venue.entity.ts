import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'catalog_venues' })
export class VenueEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organizer_id', type: 'uuid' })
  organizerId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  address!: string;

  @Column({ type: 'text' })
  city!: string;

  @Column({ type: 'text' })
  state!: string;

  @Column({ name: 'time_zone', type: 'text' })
  timeZone!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
