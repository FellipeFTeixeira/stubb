import { Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS,
  EMAIL_VERIFICATION_TTL_SECONDS,
  type IdentityCommandAccepted,
  type RegisterUserRequest,
} from '@stubb/contracts';
import { v7 } from 'uuid';
import { Clock } from '../../shared/clock/clock.js';
import { TransactionContext } from '../../shared/transaction/transaction-context.js';
import { IdentityError, verificationTokenInvalid } from '../identity.errors.js';
import {
  EmailVerificationEntity,
  UserEntity,
  UserRoleEntity,
} from '../infrastructure/entities/index.js';
import { Mailer } from '../infrastructure/mailer.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { generateSecureToken, sha256Hex } from '../infrastructure/secure-token.js';
import { queryRecords, uniqueViolation } from '../infrastructure/sql.js';
import { buildVerificationEmail } from '../infrastructure/verification-email.js';

const emailTaken = () => new IdentityError('EMAIL_ALREADY_REGISTERED', 409, 'E-mail já cadastrado');
const cpfTaken = () => new IdentityError('CPF_ALREADY_REGISTERED', 409, 'CPF já cadastrado');

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly tx: TransactionContext,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
    private readonly mailer: Mailer,
  ) {}

  // Chamado dentro da transação da idempotência (IdempotencyService.execute).
  async register(input: RegisterUserRequest): Promise<IdentityCommandAccepted> {
    const manager = this.tx.manager();
    if (await manager.existsBy(UserEntity, { email: input.email })) throw emailTaken();
    if (await manager.existsBy(UserEntity, { cpf: input.cpf })) throw cpfTaken();

    const id = v7();
    const now = this.clock.now();
    const passwordHash = await this.hasher.hash(input.password);
    try {
      await manager.insert(UserEntity, {
        id,
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        cpf: input.cpf,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Corrida entre dois cadastros: a unique é a última defesa.
      const constraint = uniqueViolation(error);
      if (constraint === 'uq_identity_users_email') throw emailTaken();
      if (constraint === 'uq_identity_users_cpf') throw cpfTaken();
      throw error;
    }
    await manager.insert(UserRoleEntity, { userId: id, role: 'customer', grantedAt: now });
    return { id };
  }

  // Invalida os links abertos, cria um novo e, depois do commit, envia o e-mail (D-17, D-18).
  async issueVerification(userId: string): Promise<void> {
    const now = this.clock.now();
    const token = generateSecureToken();
    const recipient = await this.tx.run(async () => {
      const manager = this.tx.manager();
      const user = await manager.findOneBy(UserEntity, { id: userId });
      if (!user) return null;
      await manager.query(
        `UPDATE identity_email_verifications SET invalidated_at = $2
          WHERE user_id = $1 AND used_at IS NULL AND invalidated_at IS NULL`,
        [userId, now],
      );
      await manager.insert(EmailVerificationEntity, {
        id: v7(),
        userId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
        usedAt: null,
        invalidatedAt: null,
        createdAt: now,
      });
      return { email: user.email, fullName: user.fullName };
    });
    if (!recipient) return;

    try {
      await this.mailer.send(buildVerificationEmail(recipient.email, recipient.fullName, token));
    } catch (error) {
      // Sem CPF nem token no log. A pessoa usa o reenvio.
      this.logger.warn(
        `Falha ao enviar o e-mail de verificação (usuário ${userId}): ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  async confirmEmail(token: string): Promise<IdentityCommandAccepted> {
    const tokenHash = sha256Hex(token);
    const now = this.clock.now();
    const userId = await this.tx.run(async () => {
      const manager = this.tx.manager();
      const row = await manager.findOneBy(EmailVerificationEntity, { tokenHash });
      if (!row || row.invalidatedAt || row.expiresAt.getTime() <= now.getTime()) return null;
      if (row.usedAt) return row.userId; // uso repetido: 202 sem mudança
      const claimed = await queryRecords<{ id: string }>(
        manager,
        `UPDATE identity_email_verifications SET used_at = $2
          WHERE id = $1 AND used_at IS NULL RETURNING id`,
        [row.id, now],
      );
      if (claimed.length > 0) {
        await manager.query(
          `UPDATE identity_users SET email_verified_at = COALESCE(email_verified_at, $2), updated_at = $2
            WHERE id = $1`,
          [row.userId, now],
        );
      }
      return row.userId;
    });
    if (!userId) throw verificationTokenInvalid();
    return { id: userId };
  }

  // Sempre responde 202: quem chama não descobre se a conta existe (D-18).
  async resendVerification(email: string): Promise<void> {
    const now = this.clock.now();
    const target = await this.tx.run(async () => {
      const manager = this.tx.manager();
      const user = await manager.findOneBy(UserEntity, { email });
      if (!user || user.emailVerifiedAt) return null;
      const last = await manager.findOne(EmailVerificationEntity, {
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
      const elapsedMs = last ? now.getTime() - last.createdAt.getTime() : Infinity;
      if (elapsedMs < EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS * 1000) return null;
      return user.id;
    });
    if (target) await this.issueVerification(target);
  }
}
