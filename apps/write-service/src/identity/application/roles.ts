import { USER_ROLES, type UserRole } from '@stubb/contracts';
import type { EntityManager } from 'typeorm';
import { UserRoleEntity } from '../infrastructure/entities/index.js';

// Papéis do usuário na ordem canônica de USER_ROLES (token e `me` ficam estáveis).
export async function loadRoles(manager: EntityManager, userId: string): Promise<UserRole[]> {
  const rows = await manager.findBy(UserRoleEntity, { userId });
  const owned = new Set(rows.map((row) => row.role));
  return USER_ROLES.filter((role) => owned.has(role));
}
