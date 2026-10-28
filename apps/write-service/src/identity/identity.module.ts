import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../shared/shared.module.js';
import { IdentityCleanupJob } from './application/identity-cleanup.job.js';
import { IdentitySeeder } from './application/identity-seeder.js';
import { OrganizerRequestsService } from './application/organizer-requests.service.js';
import { ProfileService } from './application/profile.service.js';
import { RegistrationService } from './application/registration.service.js';
import { SessionService } from './application/session.service.js';
import { AdminOrganizerRequestsController } from './http/admin-organizer-requests.controller.js';
import { EmailVerificationsController } from './http/email-verifications.controller.js';
import { OrganizerRequestsController } from './http/organizer-requests.controller.js';
import { SessionController } from './http/session.controller.js';
import { UsersController } from './http/users.controller.js';
import { IDENTITY_ENTITIES } from './infrastructure/entities/index.js';
import { Mailer } from './infrastructure/mailer.js';
import { PasswordHasher } from './infrastructure/password-hasher.js';

// Contexto CRUD (ADR 0010): sem CommandBus, sem outbox e sem read model.
@Module({
  imports: [TypeOrmModule.forFeature([...IDENTITY_ENTITIES]), SharedModule],
  controllers: [
    UsersController,
    EmailVerificationsController,
    SessionController,
    OrganizerRequestsController,
    AdminOrganizerRequestsController,
  ],
  providers: [
    PasswordHasher,
    Mailer,
    RegistrationService,
    SessionService,
    ProfileService,
    OrganizerRequestsService,
    IdentitySeeder,
    IdentityCleanupJob,
  ],
})
export class IdentityModule {}
