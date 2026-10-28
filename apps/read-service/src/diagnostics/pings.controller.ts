import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  type GetPingResponse,
  MIN_VERSION_QUERY_PARAM,
  minVersionSchema,
  uuidSchema,
} from '@stubb/contracts';
import { Public } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { GetPingQuery } from './get-ping.query.js';

@Controller('diagnostics/pings')
@Public()
export class PingsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':id')
  async getPing(
    @Param('id', new ZodPipe(uuidSchema, 'id')) id: string,
    @Query(
      MIN_VERSION_QUERY_PARAM,
      new ZodPipe(minVersionSchema.optional(), MIN_VERSION_QUERY_PARAM),
    )
    minVersion: number | undefined,
  ): Promise<GetPingResponse> {
    const result = await this.queryBus.execute(new GetPingQuery(id, minVersion));
    if (!result.found) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Ping not found',
        minVersionReached: false,
      });
    }
    return { ping: result.ping, minVersionReached: result.minVersionReached };
  }
}
