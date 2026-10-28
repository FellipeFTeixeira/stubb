import { Body, Controller, Get, HttpCode, Post, UseFilters } from '@nestjs/common';
import {
  IDENTITY_ROUTE_TEMPLATES,
  RegisterUserRequestSchema,
  type IdentityCommandAccepted,
  type ListMyOrganizerRequestsResponse,
  type MeResponse,
  type RegisterUserRequest,
} from '@stubb/contracts';
import type { AuthenticatedUser } from '../../auth/authenticated-user.js';
import { CurrentUser, Public } from '../../auth/decorators.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyKey } from '../../shared/idempotency/idempotency-key.decorator.js';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service.js';
import { hashRequest } from '../../shared/idempotency/request-hash.js';
import { idempotencyScope } from '../../shared/idempotency/scope.js';
import { ProfileService } from '../application/profile.service.js';
import { RegistrationService } from '../application/registration.service.js';
import { IdentityErrorFilter } from './identity-error.filter.js';

@Controller('identity')
@UseFilters(DomainErrorFilter, IdentityErrorFilter)
export class UsersController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly registration: RegistrationService,
    private readonly profile: ProfileService,
  ) {}

  @Public()
  @Post('users')
  @HttpCode(202)
  async register(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(RegisterUserRequestSchema)) body: RegisterUserRequest,
  ): Promise<IdentityCommandAccepted> {
    const template = IDENTITY_ROUTE_TEMPLATES.registerUser;
    let executed = false;
    const accepted = await this.idempotency.execute(
      {
        key,
        // Sem ator: quem cadastra ainda não tem conta. A senha fica fora do hash da requisição.
        scope: idempotencyScope(template),
        requestHash: hashRequest('POST', template, {
          fullName: body.fullName,
          email: body.email,
          cpf: body.cpf,
        }),
      },
      async () => {
        const created = await this.registration.register(body);
        executed = true;
        return created;
      },
    );
    // Replay idempotente não reenvia o e-mail: só quando o cadastro de fato executou.
    if (executed) await this.registration.issueVerification(accepted.id);
    return accepted;
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.profile.getMe(user.id);
  }

  @Get('me/organizer-requests')
  myOrganizerRequests(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListMyOrganizerRequestsResponse> {
    return this.profile.listMyOrganizerRequests(user.id);
  }
}
