import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'identity_organizer_requests' })
export class OrganizerRequestEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'organization_name', type: 'text' })
  organizationName!: string;

  @Column({ type: 'char', length: 14 })
  cnpj!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'text' })
  status!: string;

  @Column({ name: 'rejection_message', type: 'text', nullable: true })
  rejectionMessage!: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy!: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
