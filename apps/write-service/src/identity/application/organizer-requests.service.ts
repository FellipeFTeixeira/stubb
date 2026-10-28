import { Injectable } from '@nestjs/common';
import {
  type AdminOrganizerRequestView,
  type IdentityCommandAccepted,
  type ListAdminOrganizerRequestsQuery,
  type ListAdminOrganizerRequestsResponse,
  type RequestOrganizerRoleRequest,
} from '@stubb/contracts';
import { v7 } from 'uuid';
import { Clock } from '../../shared/clock/clock.js';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { IdentityError } from '../identity.errors.js';
import { OrganizerRequestEntity, UserRoleEntity } from '../infrastructure/entities/index.js';
import { queryRecords, uniqueViolation } from '../infrastructure/sql.js';

const alreadyPending = () =>
  new IdentityError('ORGANIZER_REQUEST_PENDING', 409, 'Já existe um pedido pendente');
const notPending = () =>
  new IdentityError('ORGANIZER_REQUEST_NOT_PENDING', 409, 'Este pedido já foi decidido');
const notFound = () =>
  new IdentityError('ORGANIZER_REQUEST_NOT_FOUND', 404, 'Pedido não encontrado');

interface AdminRow {
  id: string;
  organization_name: string;
  cnpj: string;
  reason: string;
  status: string;
  rejection_message: string | null;
  decided_at: Date | null;
  created_at: Date;
  requester_id: string;
  requester_full_name: string;
  requester_email: string;
}

@Injectable()
export class OrganizerRequestsService {
  constructor(
    private readonly tx: TransactionContext,
    private readonly clock: Clock,
  ) {}

  // Chamado dentro da transação da idempotência.
  async request(
    userId: string,
    input: RequestOrganizerRoleRequest,
  ): Promise<IdentityCommandAccepted> {
    const manager = this.tx.manager();
    if (await manager.existsBy(UserRoleEntity, { userId, role: 'organizer' })) {
      throw new IdentityError('ALREADY_ORGANIZER', 409, 'A conta já é de produtor');
    }
    if (await manager.existsBy(OrganizerRequestEntity, { userId, status: 'pending' })) {
      throw alreadyPending();
    }
    const id = v7();
    try {
      await manager.insert(OrganizerRequestEntity, {
        id,
        userId,
        organizationName: input.organizationName,
        cnpj: input.cnpj,
        reason: input.reason,
        status: 'pending',
        rejectionMessage: null,
        decidedBy: null,
        decidedAt: null,
        createdAt: this.clock.now(),
      });
    } catch (error) {
      // Dois pedidos simultâneos da mesma conta: o índice único parcial é a última defesa.
      if (uniqueViolation(error) === 'uq_identity_organizer_requests_pending') {
        throw alreadyPending();
      }
      throw error;
    }
    return { id };
  }

  listForAdmin(
    query: ListAdminOrganizerRequestsQuery,
  ): Promise<ListAdminOrganizerRequestsResponse> {
    return this.tx.run(async () => {
      const manager = this.tx.manager();
      const { status, page, pageSize } = query;
      const order =
        status === 'pending' ? 'r.created_at ASC, r.id ASC' : 'r.decided_at DESC, r.id DESC';
      const counted = await queryRecords<{ total: number }>(
        manager,
        'SELECT count(*)::int AS total FROM identity_organizer_requests WHERE status = $1',
        [status],
      );
      const total = counted[0]?.total ?? 0;
      const rows = await queryRecords<AdminRow>(
        manager,
        `SELECT r.id, r.organization_name, r.cnpj, r.reason, r.status, r.rejection_message,
                r.decided_at, r.created_at,
                u.id AS requester_id, u.full_name AS requester_full_name, u.email AS requester_email
           FROM identity_organizer_requests r
           JOIN identity_users u ON u.id = r.user_id
          WHERE r.status = $1
          ORDER BY ${order}
          LIMIT $2 OFFSET $3`,
        [status, pageSize, (page - 1) * pageSize],
      );
      const items: AdminOrganizerRequestView[] = rows.map((row) => ({
        id: row.id,
        organizationName: row.organization_name,
        cnpj: row.cnpj,
        reason: row.reason,
        status: row.status as AdminOrganizerRequestView['status'],
        rejectionMessage: row.rejection_message,
        createdAt: new Date(row.created_at).toISOString(),
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
        requester: {
          id: row.requester_id,
          fullName: row.requester_full_name,
          email: row.requester_email,
        },
      }));
      return { items, page, pageSize, total };
    });
  }

  // Chamado dentro da transação da idempotência. O UPDATE condicional serializa decisões
  // concorrentes: a segunda espera o lock da linha, relê o status e não casa mais (CA-18).
  async approve(adminId: string, requestId: string): Promise<IdentityCommandAccepted> {
    const manager = this.tx.manager();
    const now = this.clock.now();
    const decided = await queryRecords<{ user_id: string }>(
      manager,
      `UPDATE identity_organizer_requests
          SET status = 'approved', decided_by = $2, decided_at = $3
        WHERE id = $1 AND status = 'pending' RETURNING user_id`,
      [requestId, adminId, now],
    );
    const row = decided[0];
    if (!row) throw await this.whyNotDecided(requestId);
    await manager.query(
      `INSERT INTO identity_user_roles (user_id, role, granted_at) VALUES ($1, 'organizer', $2)
       ON CONFLICT ("user_id", "role") DO NOTHING`,
      [row.user_id, now],
    );
    return { id: requestId };
  }

  async reject(
    adminId: string,
    requestId: string,
    message: string | undefined,
  ): Promise<IdentityCommandAccepted> {
    const decided = await queryRecords<{ id: string }>(
      this.tx.manager(),
      `UPDATE identity_organizer_requests
          SET status = 'rejected', rejection_message = $4, decided_by = $2, decided_at = $3
        WHERE id = $1 AND status = 'pending' RETURNING id`,
      [requestId, adminId, this.clock.now(), message ?? null],
    );
    if (decided.length === 0) throw await this.whyNotDecided(requestId);
    return { id: requestId };
  }

  private async whyNotDecided(requestId: string): Promise<IdentityError> {
    const exists = await this.tx.manager().existsBy(OrganizerRequestEntity, { id: requestId });
    return exists ? notPending() : notFound();
  }
}
