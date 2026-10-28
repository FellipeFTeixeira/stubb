import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'identity_user_roles' })
export class UserRoleEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'text' })
  role!: string;

  @Column({ name: 'granted_at', type: 'timestamptz' })
  grantedAt!: Date;
}
