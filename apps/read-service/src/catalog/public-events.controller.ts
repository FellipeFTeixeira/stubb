import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  type GetEventResponse,
  type ListEventsQuery as ListEventsParams,
  ListEventsQuerySchema,
  type ListEventsResponse,
  MIN_VERSION_QUERY_PARAM,
  minVersionSchema,
  uuidSchema,
} from '@stubb/contracts';
import { ZodPipe } from '../common/zod-pipe.js';
import { GetEventQuery, ListEventsQuery } from './catalog.queries.js';

@Controller('catalog/events')
export class PublicEventsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  listEvents(
    @Query(new ZodPipe(ListEventsQuerySchema, 'query')) params: ListEventsParams,
  ): Promise<ListEventsResponse> {
    return this.queryBus.execute(new ListEventsQuery(params));
  }

  @Get(':eventId')
  async getEvent(
    @Param('eventId', new ZodPipe(uuidSchema, 'eventId')) eventId: string,
    @Query(
      MIN_VERSION_QUERY_PARAM,
      new ZodPipe(minVersionSchema.optional(), MIN_VERSION_QUERY_PARAM),
    )
    minVersion: number | undefined,
  ): Promise<GetEventResponse> {
    const result = await this.queryBus.execute(new GetEventQuery(eventId, minVersion));
    if (!result.found) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Event not found',
        minVersionReached: result.minVersionReached,
      });
    }
    return { event: result.event, minVersionReached: result.minVersionReached };
  }
}
