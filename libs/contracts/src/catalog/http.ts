import { z } from 'zod';
import { instantSchema, uuidSchema } from '../shared/schemas.js';
import { BRAZIL_TIME_ZONES, EVENT_CATEGORIES, SECTOR_KINDS } from './constants.js';
import {
  eventDetailsSchema,
  httpsUrlSchema,
  priceCentsSchema,
  requiredText,
  venueDetailsSchema,
  venueSectorInputSchema,
} from './fields.js';

const expectedVersionSchema = z.number().int().min(1);
const optionalSearchText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(48).default(12);

// Commands

export const RegisterVenueRequestSchema = venueDetailsSchema;
export const UpdateVenueDetailsRequestSchema = venueDetailsSchema.extend({
  expectedVersion: expectedVersionSchema,
});
export const AddVenueSectorRequestSchema = venueSectorInputSchema;

export const CreateEventRequestSchema = eventDetailsSchema.extend({
  imageUrl: httpsUrlSchema
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
export const UpdateEventDetailsRequestSchema = eventDetailsSchema.extend({
  expectedVersion: expectedVersionSchema,
});

export const ScheduleSessionRequestSchema = z
  .object({
    venueId: uuidSchema,
    startsAt: instantSchema,
    salesStartsAt: instantSchema,
    timeZone: z.enum(BRAZIL_TIME_ZONES),
  })
  .refine((v) => Date.parse(v.salesStartsAt) < Date.parse(v.startsAt), {
    path: ['salesStartsAt'],
    message: 'O início das vendas precisa ser antes do início da sessão',
  });

export const AddSessionSectorRequestSchema = z.object({ venueSectorId: uuidSchema });

export const AddBatchRequestSchema = z.object({
  name: requiredText(50),
  priceCents: priceCentsSchema,
  quantity: z
    .number()
    .int()
    .min(1, 'Mínimo 1')
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  endsAt: instantSchema
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export const EmptyCommandRequestSchema = z.object({});

// Query strings

export const ListEventsQuerySchema = z.object({
  q: optionalSearchText,
  city: optionalSearchText,
  category: z.enum(EVENT_CATEGORIES).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export const ListOrganizerEventsQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});

// Views

const isoSchema = z.iso.datetime();
// string (não enum) porque os documentos do read store guardam `category: string`
const categorySchema = z.string();
const sectorKindSchema = z.enum(SECTOR_KINDS);
const rowsSchema = z.array(z.object({ label: z.string(), seats: z.number().int() }));
const venueLocationSchema = z.object({ name: z.string(), city: z.string(), state: z.string() });
const venueFullLocationSchema = venueLocationSchema.extend({ address: z.string() });

export const EventCardSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  category: categorySchema,
  imageUrl: z.string().nullable(),
  nextSession: z.object({
    id: uuidSchema,
    startsAt: isoSchema,
    timeZone: z.string(),
    venue: venueLocationSchema,
  }),
  otherUpcomingSessionsCount: z.number().int().min(0),
  price: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('from'), priceCents: z.number().int() }),
    z.object({ kind: z.literal('sales_start'), salesStartsAt: isoSchema }),
    z.object({ kind: z.literal('sales_ended') }),
  ]),
});

export const ListEventsResponseSchema = z.object({
  items: z.array(EventCardSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  asOf: isoSchema,
});

export const PublicEventViewSchema = z.object({
  id: uuidSchema,
  version: z.number().int().min(1),
  title: z.string(),
  description: z.string(),
  category: categorySchema,
  ageRating: z.string(),
  imageUrl: z.string().nullable(),
  ended: z.boolean(),
  asOf: isoSchema,
  sessions: z.array(
    z.object({
      id: uuidSchema,
      startsAt: isoSchema,
      timeZone: z.string(),
      ended: z.boolean(),
      venue: venueFullLocationSchema,
      sectors: z.array(
        z.object({
          id: uuidSchema,
          name: z.string(),
          kind: sectorKindSchema,
          sales: z.discriminatedUnion('status', [
            z.object({
              status: z.literal('open'),
              batch: z.object({ name: z.string(), priceCents: z.number().int() }),
            }),
            z.object({ status: z.literal('upcoming'), salesStartsAt: isoSchema }),
            z.object({ status: z.literal('ended') }),
          ]),
        }),
      ),
    }),
  ),
});

export const GetEventResponseSchema = z.object({
  event: PublicEventViewSchema,
  minVersionReached: z.boolean(),
});

export const OrganizerEventViewSchema = z.object({
  id: uuidSchema,
  version: z.number().int().min(1),
  status: z.enum(['draft', 'published']),
  title: z.string(),
  description: z.string(),
  category: categorySchema,
  ageRating: z.string(),
  imageUrl: z.string().nullable(),
  createdAt: isoSchema,
  asOf: isoSchema,
  sessions: z.array(
    z.object({
      id: uuidSchema,
      status: z.enum(['draft', 'published']),
      venueId: uuidSchema,
      venue: venueFullLocationSchema.nullable(),
      startsAt: isoSchema,
      salesStartsAt: isoSchema,
      timeZone: z.string(),
      ended: z.boolean(),
      salesOpen: z.boolean(),
      sectors: z.array(
        z.object({
          id: uuidSchema,
          venueSectorId: uuidSchema,
          name: z.string(),
          kind: sectorKindSchema,
          capacity: z.number().int(),
          rows: rowsSchema.nullable(),
          batches: z.array(
            z.object({
              id: uuidSchema,
              name: z.string(),
              priceCents: z.number().int(),
              quantity: z.number().int().nullable(),
              endsAt: isoSchema.nullable(),
              badge: z.enum(['ended', 'current', 'upcoming']),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const GetOrganizerEventResponseSchema = z.object({
  event: OrganizerEventViewSchema,
  minVersionReached: z.boolean(),
});

export const OrganizerEventSummarySchema = z.object({
  id: uuidSchema,
  title: z.string(),
  category: categorySchema,
  status: z.enum(['draft', 'published']),
  sessionsCount: z.number().int().min(0),
  publishedSessionsCount: z.number().int().min(0),
  createdAt: isoSchema,
});

export const ListOrganizerEventsResponseSchema = z.object({
  items: z.array(OrganizerEventSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const VenueSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  city: z.string(),
  state: z.string(),
  timeZone: z.string(),
  sectorsCount: z.number().int().min(0),
  version: z.number().int().min(1),
});

export const ListVenuesResponseSchema = z.object({ items: z.array(VenueSummarySchema) });

export const VenueViewSchema = z.object({
  id: uuidSchema,
  version: z.number().int().min(1),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  timeZone: z.string(),
  sectors: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      kind: sectorKindSchema,
      capacity: z.number().int(),
      rows: rowsSchema.nullable(),
    }),
  ),
});

export const GetVenueResponseSchema = z.object({
  venue: VenueViewSchema,
  minVersionReached: z.boolean(),
});

export const ReadNotFoundResponseSchema = z.object({
  statusCode: z.literal(404),
  message: z.string(),
  minVersionReached: z.boolean(),
});

// Types: output of requests, input with `Input` suffix, inferred views.

export type RegisterVenueRequest = z.output<typeof RegisterVenueRequestSchema>;
export type RegisterVenueRequestInput = z.input<typeof RegisterVenueRequestSchema>;
export type UpdateVenueDetailsRequest = z.output<typeof UpdateVenueDetailsRequestSchema>;
export type UpdateVenueDetailsRequestInput = z.input<typeof UpdateVenueDetailsRequestSchema>;
export type AddVenueSectorRequest = z.output<typeof AddVenueSectorRequestSchema>;
export type AddVenueSectorRequestInput = z.input<typeof AddVenueSectorRequestSchema>;
export type CreateEventRequest = z.output<typeof CreateEventRequestSchema>;
export type CreateEventRequestInput = z.input<typeof CreateEventRequestSchema>;
export type UpdateEventDetailsRequest = z.output<typeof UpdateEventDetailsRequestSchema>;
export type UpdateEventDetailsRequestInput = z.input<typeof UpdateEventDetailsRequestSchema>;
export type ScheduleSessionRequest = z.output<typeof ScheduleSessionRequestSchema>;
export type ScheduleSessionRequestInput = z.input<typeof ScheduleSessionRequestSchema>;
export type AddSessionSectorRequest = z.output<typeof AddSessionSectorRequestSchema>;
export type AddSessionSectorRequestInput = z.input<typeof AddSessionSectorRequestSchema>;
export type AddBatchRequest = z.output<typeof AddBatchRequestSchema>;
export type AddBatchRequestInput = z.input<typeof AddBatchRequestSchema>;
export type EmptyCommandRequest = z.output<typeof EmptyCommandRequestSchema>;
export type ListEventsQuery = z.output<typeof ListEventsQuerySchema>;
export type ListEventsQueryInput = z.input<typeof ListEventsQuerySchema>;
export type ListOrganizerEventsQuery = z.output<typeof ListOrganizerEventsQuerySchema>;
export type ListOrganizerEventsQueryInput = z.input<typeof ListOrganizerEventsQuerySchema>;

export type EventCard = z.infer<typeof EventCardSchema>;
export type ListEventsResponse = z.infer<typeof ListEventsResponseSchema>;
export type PublicEventView = z.infer<typeof PublicEventViewSchema>;
export type GetEventResponse = z.infer<typeof GetEventResponseSchema>;
export type OrganizerEventView = z.infer<typeof OrganizerEventViewSchema>;
export type GetOrganizerEventResponse = z.infer<typeof GetOrganizerEventResponseSchema>;
export type OrganizerEventSummary = z.infer<typeof OrganizerEventSummarySchema>;
export type ListOrganizerEventsResponse = z.infer<typeof ListOrganizerEventsResponseSchema>;
export type VenueSummary = z.infer<typeof VenueSummarySchema>;
export type ListVenuesResponse = z.infer<typeof ListVenuesResponseSchema>;
export type VenueView = z.infer<typeof VenueViewSchema>;
export type GetVenueResponse = z.infer<typeof GetVenueResponseSchema>;
export type ReadNotFoundResponse = z.infer<typeof ReadNotFoundResponseSchema>;
