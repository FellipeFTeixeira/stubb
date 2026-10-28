import { Body, Controller, HttpCode, Param, Post, Req, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  type CommandAccepted,
  CreatePingRequestSchema,
  DIAGNOSTICS_ROUTE_TEMPLATES,
  IncrementPingRequestSchema,
  uuidSchema,
  type CreatePingRequest,
} from '@stubb/contracts';
import type { Request } from 'express';
import { Public } from '../../auth/decorators.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyKey } from '../../shared/idempotency/idempotency-key.decorator.js';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service.js';
import { hashRequest } from '../../shared/idempotency/request-hash.js';
import { CreatePingCommand } from '../application/create-ping.command.js';
import { IncrementPingCommand } from '../application/increment-ping.command.js';

@Public()
@Controller('diagnostics/pings')
@UseFilters(DomainErrorFilter)
export class PingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @HttpCode(202)
  create(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(CreatePingRequestSchema)) body: CreatePingRequest,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: DIAGNOSTICS_ROUTE_TEMPLATES.createPing,
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new CreatePingCommand(body.label)),
    );
  }

  @Post(':id/increment')
  @HttpCode(202)
  increment(
    @IdempotencyKey() key: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(IncrementPingRequestSchema)) body: Record<string, never>,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: DIAGNOSTICS_ROUTE_TEMPLATES.incrementPing,
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new IncrementPingCommand(id)),
    );
  }
}
