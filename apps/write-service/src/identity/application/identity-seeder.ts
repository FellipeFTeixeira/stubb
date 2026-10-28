import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { UserRole } from '@stubb/contracts';
import { DataSource, type EntityManager } from 'typeorm';
import { v7 } from 'uuid';
import { config } from '../../config.js';
import { Clock } from '../../shared/clock/clock.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';

interface SeedUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  cpf: string;
}

// Contas de desenvolvimento: o admin (RN-10) e o produtor seed da Fase 2 (RN-23). Idempotente.
@Injectable()
export class IdentitySeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentitySeeder.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly hasher: PasswordHasher,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (config.IDENTITY_SEED_ENABLED) await this.seed();
  }

  async seed(): Promise<void> {
    const admin: SeedUser = {
      id: config.IDENTITY_ADMIN_ID,
      email: config.IDENTITY_ADMIN_EMAIL,
      password: config.IDENTITY_ADMIN_PASSWORD,
      fullName: config.IDENTITY_ADMIN_NAME,
      cpf: config.IDENTITY_ADMIN_CPF,
    };
    const organizer: SeedUser = {
      id: config.IDENTITY_SEED_ORGANIZER_ID,
      email: config.IDENTITY_SEED_ORGANIZER_EMAIL,
      password: config.IDENTITY_SEED_ORGANIZER_PASSWORD,
      fullName: config.IDENTITY_SEED_ORGANIZER_NAME,
      cpf: config.IDENTITY_SEED_ORGANIZER_CPF,
    };
    const adminHash = await this.hasher.hash(admin.password);
    const organizerHash = await this.hasher.hash(organizer.password);
    const now = this.clock.now();

    await this.dataSource.transaction(async (manager) => {
      const adminId = await this.upsertUser(manager, admin, adminHash, now, [
        'customer',
        'organizer',
        'admin',
      ]);
      const organizerId = await this.upsertUser(manager, organizer, organizerHash, now, [
        'customer',
        'organizer',
      ]);
      await manager.query(
        `INSERT INTO identity_organizer_requests
           (id, user_id, organization_name, cnpj, reason, status, decided_by, decided_at, created_at)
         SELECT $1, $2, $3, $4, 'Conta de demonstração do Catalog', 'approved', $5, $6, $6
          WHERE NOT EXISTS (SELECT 1 FROM identity_organizer_requests WHERE user_id = $2)`,
        [
          v7(),
          organizerId,
          config.IDENTITY_SEED_ORGANIZER_ORGANIZATION,
          config.IDENTITY_SEED_ORGANIZER_CNPJ,
          adminId,
          now,
        ],
      );
    });
    this.logger.log(`Seed da Identity pronto: ${admin.email}, ${organizer.email}`);
  }

  // Devolve o id da conta (a existente, se o e-mail já estava cadastrado).
  private async upsertUser(
    manager: EntityManager,
    user: SeedUser,
    passwordHash: string,
    now: Date,
    roles: UserRole[],
  ): Promise<string> {
    const email = user.email.toLowerCase();
    await manager.query(
      `INSERT INTO identity_users
         (id, email, password_hash, full_name, cpf, email_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
       ON CONFLICT ("email") DO NOTHING`,
      [user.id, email, passwordHash, user.fullName, user.cpf, now],
    );
    const found = await manager.query<Array<{ id: string }>>(
      'SELECT id FROM identity_users WHERE email = $1',
      [email],
    );
    const id = found[0]?.id ?? user.id;
    for (const role of roles) {
      await manager.query(
        `INSERT INTO identity_user_roles (user_id, role, granted_at) VALUES ($1, $2, $3)
         ON CONFLICT ("user_id", "role") DO NOTHING`,
        [id, role, now],
      );
    }
    return id;
  }
}
