import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters } from '@nestjs/common';
import {
  IDENTITY_ROUTE_TEMPLATES,
  ListAdminOrganizerRequestsQuerySchema,
  RejectOrganizerRequestRequestSchema,
  uuidSchema,
  type IdentityCommandAccepted,
  type ListAdminOrganizerRequestsQuery,
  type ListAdminOrganizerRequestsResponse,
  type RejectOrganizerRequestRequest,
} from '@stubb/contracts';
import type { AuthenticatedUser } from '../../auth/authenticated-user.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyKey } from '../../shared/idempotency/idempotency-key.decorator.js';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service.js';
import { hashRequest } from '../../shared/idempotency/request-hash.js';
import { idempotencyScope } from '../../shared/idempotency/scope.js';
import { OrganizerRequestsService } from '../application/organizer-requests.service.js';
import { IdentityErrorFilter } from './identity-error.filter.js';

const uuidParam = () => new ZodValidationPipe(uuidSchema);

@Roles('admin')
@Controller('identity/admin/organizer-requests')
@UseFilters(DomainErrorFilter, IdentityErrorFilter)
export class AdminOrganizerRequestsController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly requests: OrganizerRequestsService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListAdminOrganizerRequestsQuerySchema))
    query: ListAdminOrganizerRequestsQuery,
  ): Promise<ListAdminOrganizerRequestsResponse> {
    return this.requests.listForAdmin(query);
  }

  @Post(':requestId/approve')
  @HttpCode(202)
  approve(
    @IdempotencyKey() key: string,
    @Param('requestId', uuidParam()) requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IdentityCommandAccepted> {
    const template = IDENTITY_ROUTE_TEMPLATES.approveOrganizerRequest;
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(template, user.id),
        requestHash: hashRequest('POST', template, { requestId }),
      },
      () => this.requests.approve(user.id, requestId),
    );
  }

  @Post(':requestId/reject')
  @HttpCode(202)
  reject(
    @IdempotencyKey() key: string,
    @Param('requestId', uuidParam()) requestId: string,
    @Body(new ZodValidationPipe(RejectOrganizerRequestRequestSchema))
    body: RejectOrganizerRequestRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IdentityCommandAccepted> {
    const template = IDENTITY_ROUTE_TEMPLATES.rejectOrganizerRequest;
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(template, user.id),
        requestHash: hashRequest('POST', template, { requestId, message: body.message ?? null }),
      },
      () => this.requests.reject(user.id, requestId, body.message),
    );
  }
}
