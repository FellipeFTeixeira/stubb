import { Injectable } from '@nestjs/common';
import {
  maskCpf,
  type ListMyOrganizerRequestsResponse,
  type MeResponse,
  type OrganizerRequestStatus,
  type OrganizerRequestView,
} from '@stubb/contracts';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { IdentityError } from '../identity.errors.js';
import { OrganizerRequestEntity, UserEntity } from '../infrastructure/entities/index.js';
import { loadRoles } from './roles.js';

export function toRequestView(row: OrganizerRequestEntity): OrganizerRequestView {
  return {
    id: row.id,
    organizationName: row.organizationName,
    cnpj: row.cnpj,
    reason: row.reason,
    status: row.status as OrganizerRequestStatus,
    rejectionMessage: row.rejectionMessage,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

// GetMe e ListMyOrganizerRequests leem direto do PostgreSQL: consistência forte, sem read model.
@Injectable()
export class ProfileService {
  constructor(private readonly tx: TransactionContext) {}

  getMe(userId: string): Promise<MeResponse> {
    return this.tx.run(async () => {
      const manager = this.tx.manager();
      const user = await manager.findOneBy(UserEntity, { id: userId });
      if (!user) throw new IdentityError('UNAUTHENTICATED', 401, 'Authentication required');
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        cpf: maskCpf(user.cpf),
        roles: await loadRoles(manager, user.id),
      };
    });
  }

  listMyOrganizerRequests(userId: string): Promise<ListMyOrganizerRequestsResponse> {
    return this.tx.run(async () => {
      const rows = await this.tx.manager().find(OrganizerRequestEntity, {
        where: { userId },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      return { items: rows.map(toRequestView) };
    });
  }
}
