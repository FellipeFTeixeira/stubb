import { EmailVerificationEntity } from './email-verification.entity.js';
import { OrganizerRequestEntity } from './organizer-request.entity.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
import { UserRoleEntity } from './user-role.entity.js';
import { UserEntity } from './user.entity.js';

export {
  EmailVerificationEntity,
  OrganizerRequestEntity,
  RefreshTokenEntity,
  UserEntity,
  UserRoleEntity,
};

export const IDENTITY_ENTITIES = [
  UserEntity,
  UserRoleEntity,
  EmailVerificationEntity,
  RefreshTokenEntity,
  OrganizerRequestEntity,
] as const;
