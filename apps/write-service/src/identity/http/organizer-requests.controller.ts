import { Body, Controller, HttpCode, Post, UseFilters } from '@nestjs/common';
import {
  IDENTITY_ROUTE_TEMPLATES,
  RequestOrganizerRoleRequestSchema,
  type IdentityCommandAccepted,
  type RequestOrganizerRoleRequest,
} from '@stubb/contracts';
import type { AuthenticatedUser } from '../../auth/authenticated-user.js';
import { CurrentUser } from '../../auth/decorators.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyKey } from '../../shared/idempotency/idempotency-key.decorator.js';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service.js';
import { hashRequest } from '../../shared/idempotency/request-hash.js';
import { idempotencyScope } from '../../shared/idempotency/scope.js';
import { OrganizerRequestsService } from '../application/organizer-requests.service.js';
import { IdentityErrorFilter } from './identity-error.filter.js';

// Só autenticado (sem @Roles): quem pede o papel de produtor ainda é cliente.
@Controller('identity/organizer-requests')
@UseFilters(DomainErrorFilter, IdentityErrorFilter)
export class OrganizerRequestsController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly requests: OrganizerRequestsService,
  ) {}

  @Post()
  @HttpCode(202)
  request(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(RequestOrganizerRoleRequestSchema))
    body: RequestOrganizerRoleRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IdentityCommandAccepted> {
    const template = IDENTITY_ROUTE_TEMPLATES.requestOrganizerRole;
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(template, user.id),
        requestHash: hashRequest('POST', template, body),
      },
      () => this.requests.request(user.id, body),
    );
  }
}
