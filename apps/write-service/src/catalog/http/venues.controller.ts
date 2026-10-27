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
  AddVenueSectorRequestSchema,
  CATALOG_ROUTE_TEMPLATES,
  type AddVenueSectorRequest,
  type CommandAccepted,
  EmptyCommandRequestSchema,
  type EntityCommandAccepted,
  RegisterVenueRequestSchema,
  type RegisterVenueRequest,
  UpdateVenueDetailsRequestSchema,
  type UpdateVenueDetailsRequest,
  uuidSchema,
} from '@stubb/contracts';
import type { Request } from 'express';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyKey } from '../../shared/idempotency/idempotency-key.decorator.js';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service.js';
import { hashRequest } from '../../shared/idempotency/request-hash.js';
import { AddVenueSectorCommand } from '../application/add-venue-sector.command.js';
import { RegisterVenueCommand } from '../application/register-venue.command.js';
import { RemoveVenueSectorCommand } from '../application/remove-venue-sector.command.js';
import { UpdateVenueDetailsCommand } from '../application/update-venue-details.command.js';

const uuidParam = () => new ZodValidationPipe(uuidSchema);

@Controller('catalog/venues')
@UseFilters(DomainErrorFilter)
export class VenuesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @HttpCode(202)
  register(
    @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(RegisterVenueRequestSchema)) body: RegisterVenueRequest,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: CATALOG_ROUTE_TEMPLATES.registerVenue,
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new RegisterVenueCommand(body)),
    );
  }

  @Patch(':venueId')
  @HttpCode(202)
  update(
    @IdempotencyKey() key: string,
    @Param('venueId', uuidParam()) venueId: string,
    @Body(new ZodValidationPipe(UpdateVenueDetailsRequestSchema)) body: UpdateVenueDetailsRequest,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    const { expectedVersion, ...details } = body;
    return this.idempotency.execute(
      {
        key,
        scope: CATALOG_ROUTE_TEMPLATES.updateVenueDetails,
        requestHash: hashRequest('PATCH', req.path, body),
      },
      () =>
        this.commandBus.execute(new UpdateVenueDetailsCommand(venueId, expectedVersion, details)),
    );
  }

  @Post(':venueId/sectors')
  @HttpCode(202)
  addSector(
    @IdempotencyKey() key: string,
    @Param('venueId', uuidParam()) venueId: string,
    @Body(new ZodValidationPipe(AddVenueSectorRequestSchema)) body: AddVenueSectorRequest,
    @Req() req: Request,
  ): Promise<EntityCommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: CATALOG_ROUTE_TEMPLATES.addVenueSector,
        requestHash: hashRequest('POST', req.path, body),
      },
      () => this.commandBus.execute(new AddVenueSectorCommand(venueId, body)),
    );
  }

  @Delete(':venueId/sectors/:venueSectorId')
  @HttpCode(202)
  removeSector(
    @IdempotencyKey() key: string,
    @Param('venueId', uuidParam()) venueId: string,
    @Param('venueSectorId', uuidParam()) venueSectorId: string,
    @Body(new ZodValidationPipe(EmptyCommandRequestSchema)) body: Record<string, never>,
    @Req() req: Request,
  ): Promise<CommandAccepted> {
    return this.idempotency.execute(
      {
        key,
        scope: CATALOG_ROUTE_TEMPLATES.removeVenueSector,
        requestHash: hashRequest('DELETE', req.path, body),
      },
      () => this.commandBus.execute(new RemoveVenueSectorCommand(venueId, venueSectorId)),
    );
  }
}
