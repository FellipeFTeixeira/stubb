import type { UserRole } from '@stubb/contracts';

export interface AuthenticatedUser {
  id: string;
  roles: UserRole[];
}
