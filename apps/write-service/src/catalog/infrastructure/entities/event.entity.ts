import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'catalog_events' })
export class EventEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organizer_id', type: 'uuid' })
  organizerId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  category!: string;

  @Column({ name: 'age_rating', type: 'text' })
  ageRating!: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'text' })
  status!: 'draft' | 'published';

  @Column({ type: 'integer' })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
