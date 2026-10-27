import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  type GetOrganizerEventResponse,
  type GetVenueResponse,
  type ListOrganizerEventsQuery as ListOrganizerEventsParams,
  ListOrganizerEventsQuerySchema,
  type ListOrganizerEventsResponse,
  type ListVenuesResponse,
  MIN_VERSION_QUERY_PARAM,
  minVersionSchema,
  uuidSchema,
} from '@stubb/contracts';
import { ZodPipe } from '../common/zod-pipe.js';
import {
  GetOrganizerEventQuery,
  GetVenueQuery,
  ListOrganizerEventsQuery,
  ListVenuesQuery,
} from './catalog.queries.js';

const minVersionPipe = new ZodPipe(minVersionSchema.optional(), MIN_VERSION_QUERY_PARAM);

@Controller('catalog/organizer')
export class OrganizerController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('events')
  listEvents(
    @Query(new ZodPipe(ListOrganizerEventsQuerySchema, 'query')) params: ListOrganizerEventsParams,
  ): Promise<ListOrganizerEventsResponse> {
    return this.queryBus.execute(new ListOrganizerEventsQuery(params.page, params.pageSize));
  }

  @Get('events/:eventId')
  async getEvent(
    @Param('eventId', new ZodPipe(uuidSchema, 'eventId')) eventId: string,
    @Query(MIN_VERSION_QUERY_PARAM, minVersionPipe) minVersion: number | undefined,
  ): Promise<GetOrganizerEventResponse> {
    const result = await this.queryBus.execute(new GetOrganizerEventQuery(eventId, minVersion));
    if (!result.found) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Event not found',
        minVersionReached: result.minVersionReached,
      });
    }
    return { event: result.event, minVersionReached: result.minVersionReached };
  }

  @Get('venues')
  listVenues(): Promise<ListVenuesResponse> {
    return this.queryBus.execute(new ListVenuesQuery());
  }

  @Get('venues/:venueId')
  async getVenue(
    @Param('venueId', new ZodPipe(uuidSchema, 'venueId')) venueId: string,
    @Query(MIN_VERSION_QUERY_PARAM, minVersionPipe) minVersion: number | undefined,
  ): Promise<GetVenueResponse> {
    const result = await this.queryBus.execute(new GetVenueQuery(venueId, minVersion));
    if (!result.found) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Venue not found',
        minVersionReached: result.minVersionReached,
      });
    }
    return { venue: result.venue, minVersionReached: result.minVersionReached };
  }
}
