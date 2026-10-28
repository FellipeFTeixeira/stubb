import { Injectable } from '@nestjs/common';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  type LoginRequest,
  type SessionResponse,
} from '@stubb/contracts';
import { v7 } from 'uuid';
import { AccessTokenIssuer } from '../../auth/access-token.issuer.js';
import { Clock } from '../../shared/clock/clock.js';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { IdentityError, invalidCredentials, sessionInvalid } from '../identity.errors.js';
import { RefreshTokenEntity, UserEntity } from '../infrastructure/entities/index.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { generateSecureToken, sha256Hex } from '../infrastructure/secure-token.js';
import { queryRecords } from '../infrastructure/sql.js';
import { loadRoles } from './roles.js';

export interface IssuedSession {
  session: SessionResponse;
  refreshToken: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly tx: TransactionContext,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
    private readonly issuer: AccessTokenIssuer,
  ) {}

  async login(input: LoginRequest): Promise<IssuedSession> {
    const user = await this.tx.run(() =>
      this.tx.manager().findOneBy(UserEntity, { email: input.email }),
    );
    if (!user) {
      await this.hasher.verifyAgainstDummy();
      throw invalidCredentials();
    }
    if (!(await this.hasher.verify(input.password, user.passwordHash))) throw invalidCredentials();
    // A conta não verificada só é revelada depois da senha certa (RN-25).
    if (!user.emailVerifiedAt) {
      throw new IdentityError('EMAIL_NOT_VERIFIED', 403, 'Confirme seu e-mail antes de entrar');
    }

    const now = this.clock.now();
    const refreshToken = generateSecureToken();
    const roles = await this.tx.run(async () => {
      const manager = this.tx.manager();
      await manager.insert(RefreshTokenEntity, {
        id: v7(),
        userId: user.id,
        familyId: v7(),
        tokenHash: sha256Hex(refreshToken),
        expiresAt: this.refreshExpiry(now),
        revokedAt: null,
        replacedBy: null,
        createdAt: now,
      });
      return loadRoles(manager, user.id);
    });
    return { session: await this.issuer.issue({ id: user.id, roles }), refreshToken };
  }

  // Rotação com detecção de reuso: o UPDATE condicional é a única porta de entrada (D-5).
  async refresh(presented: string | undefined): Promise<IssuedSession> {
    if (!presented) throw sessionInvalid();
    const tokenHash = sha256Hex(presented);
    const now = this.clock.now();
    const newToken = generateSecureToken();
    const newId = v7();

    const outcome = await this.tx.run(async () => {
      const manager = this.tx.manager();
      const claimed = await queryRecords<{ user_id: string; family_id: string }>(
        manager,
        `UPDATE identity_refresh_tokens SET replaced_by = $1
          WHERE token_hash = $2 AND revoked_at IS NULL AND replaced_by IS NULL AND expires_at > $3
          RETURNING user_id, family_id`,
        [newId, tokenHash, now],
      );
      const row = claimed[0];
      if (!row) {
        // Hash conhecido, mas já usado/revogado/vencido: trata como reuso e derruba a família inteira.
        await manager.query(
          `UPDATE identity_refresh_tokens SET revoked_at = $2
            WHERE family_id = (SELECT family_id FROM identity_refresh_tokens WHERE token_hash = $1)
              AND revoked_at IS NULL`,
          [tokenHash, now],
        );
        return null;
      }
      await manager.insert(RefreshTokenEntity, {
        id: newId,
        userId: row.user_id,
        familyId: row.family_id,
        tokenHash: sha256Hex(newToken),
        expiresAt: this.refreshExpiry(now),
        revokedAt: null,
        replacedBy: null,
        createdAt: now,
      });
      return { userId: row.user_id, roles: await loadRoles(manager, row.user_id) };
    });
    // Fora da transação: lançar dentro dela desfaria a revogação da família.
    if (!outcome) throw sessionInvalid();
    return {
      session: await this.issuer.issue({ id: outcome.userId, roles: outcome.roles }),
      refreshToken: newToken,
    };
  }

  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return;
    const now = this.clock.now();
    await this.tx.run(() =>
      this.tx.manager().query(
        `UPDATE identity_refresh_tokens SET revoked_at = $2
          WHERE family_id = (SELECT family_id FROM identity_refresh_tokens WHERE token_hash = $1)
            AND revoked_at IS NULL`,
        [sha256Hex(presented), now],
      ),
    );
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  }
}
