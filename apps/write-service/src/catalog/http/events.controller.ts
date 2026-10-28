import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  AddBatchRequestSchema,
  AddSessionSectorRequestSchema,
  CATALOG_ROUTE_TEMPLATES,
  CreateEventRequestSchema,
  EmptyCommandRequestSchema,
  ScheduleSessionRequestSchema,
  UpdateEventDetailsRequestSchema,
  type AddBatchRequest,
  type AddSessionSectorRequest,
  type CommandAccepted,
  type CreateEventRequest,
  type EntityCommandAccepted,
  type ScheduleSessionRequest,
  type UpdateEventDetailsRequest,
  uuidSchema,
} from '@stubb/contracts';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/authenticated-user.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyKey } from '../../shared/idempotency/idempotency-key.decorator.js';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service.js';
import { hashRequest } from '../../shared/idempotency/request-hash.js';
import { idempotencyScope } from '../../shared/idempotency/scope.js';
import { AddBatchCommand } from '../application/add-batch.command.js';
import { AddSessionSectorCommand } from '../application/add-session-sector.command.js';
import { CreateEventCommand } from '../application/create-event.command.js';
import { DiscardEventCommand } from '../application/discard-event.command.js';
import { PublishSessionCommand } from '../application/publish-session.command.js';
import { RemoveBatchCommand } from '../application/remove-batch.command.js';
import { RemoveSessionSectorCommand } from '../application/remove-session-sector.command.js';
import { RemoveSessionCommand } from '../application/remove-session.command.js';
import { ScheduleSessionCommand } from '../application/schedule-session.command.js';
import { UpdateEventDetailsCommand } from '../application/update-event-details.command.js';

const uuidParam = () => new ZodValidationPipe(uuidSchema);
const emptyBody = () => new ZodValidationPipe(EmptyCommandRequestSchema);

@Roles('organizer')
@Controller('catalog/events')
@UseFilters(DomainErrorFilter)
export class EventsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @HttpCode(202)
  create(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(CreateEventRequestSchema)) body: CreateEventRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.createEvent, user.id),
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new CreateEventCommand(user.id, body)),
    );
  }

  @Patch(':eventId')
  @HttpCode(202)
  update(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Body(new ZodValidationPipe(UpdateEventDetailsRequestSchema)) body: UpdateEventDetailsRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    const { expectedVersion, ...details } = body;
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.updateEventDetails, user.id),
        requestHash: hashRequest('PATCH', req.path, body),
      },
      () =>
        this.commandBus.execute(
          new UpdateEventDetailsCommand(user.id, eventId, expectedVersion, details),
        ),
    );
  }

  @Delete(':eventId')
  @HttpCode(202)
  discard(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Body(emptyBody()) body: Record<string, never>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.discardEvent, user.id),
        requestHash: hashRequest('DELETE', req.path, body),
      },
      () => this.commandBus.execute(new DiscardEventCommand(user.id, eventId)),
    );
  }

  @Post(':eventId/sessions')
  @HttpCode(202)
  scheduleSession(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Body(new ZodValidationPipe(ScheduleSessionRequestSchema)) body: ScheduleSessionRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<EntityCommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.scheduleSession, user.id),
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new ScheduleSessionCommand(user.id, eventId, body)),
    );
  }

  @Delete(':eventId/sessions/:sessionId')
  @HttpCode(202)
  removeSession(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Body(emptyBody()) body: Record<string, never>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.removeSession, user.id),
        requestHash: hashRequest('DELETE', req.path, body),
      },
      () => this.commandBus.execute(new RemoveSessionCommand(user.id, eventId, sessionId)),
    );
  }

  @Post(':eventId/sessions/:sessionId/publish')
  @HttpCode(202)
  publishSession(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Body(emptyBody()) body: Record<string, never>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.publishSession, user.id),
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new PublishSessionCommand(user.id, eventId, sessionId)),
    );
  }

  @Post(':eventId/sessions/:sessionId/sectors')
  @HttpCode(202)
  addSessionSector(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Body(new ZodValidationPipe(AddSessionSectorRequestSchema)) body: AddSessionSectorRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<EntityCommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.addSessionSector, user.id),
        requestHash: hashRequest('POST', req.path, body),
      },
      () =>
        this.commandBus.execute(
          new AddSessionSectorCommand(user.id, eventId, sessionId, body.venueSectorId),
        ),
    );
  }

  @Delete(':eventId/sessions/:sessionId/sectors/:sessionSectorId')
  @HttpCode(202)
  removeSessionSector(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Param('sessionSectorId', uuidParam()) sessionSectorId: string,
    @Body(emptyBody()) body: Record<string, never>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.removeSessionSector, user.id),
        requestHash: hashRequest('DELETE', req.path, body),
      },
      () =>
        this.commandBus.execute(
          new RemoveSessionSectorCommand(user.id, eventId, sessionId, sessionSectorId),
        ),
    );
  }

  @Post(':eventId/sessions/:sessionId/sectors/:sessionSectorId/batches')
  @HttpCode(202)
  addBatch(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Param('sessionSectorId', uuidParam()) sessionSectorId: string,
    @Body(new ZodValidationPipe(AddBatchRequestSchema)) body: AddBatchRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<EntityCommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.addBatch, user.id),
        requestHash: hashRequest('POST', req.path, body),
      },
      () =>
        this.commandBus.execute(
          new AddBatchCommand(user.id, eventId, sessionId, sessionSectorId, body),
        ),
    );
  }

  @Delete(':eventId/sessions/:sessionId/sectors/:sessionSectorId/batches/:batchId')
  @HttpCode(202)
  removeBatch(
    @IdempotencyKey() key: string,
    @Param('eventId', uuidParam()) eventId: string,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Param('sessionSectorId', uuidParam()) sessionSectorId: string,
    @Param('batchId', uuidParam()) batchId: string,
    @Body(emptyBody()) body: Record<string, never>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: idempotencyScope(CATALOG_ROUTE_TEMPLATES.removeBatch, user.id),
        requestHash: hashRequest('DELETE', req.path, body),
      },
      () =>
        this.commandBus.execute(
          new RemoveBatchCommand(user.id, eventId, sessionId, sessionSectorId, batchId),
        ),
    );
  }
}
