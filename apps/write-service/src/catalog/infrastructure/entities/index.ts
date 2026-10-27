import { BatchEntity } from './batch.entity.js';
import { EventEntity } from './event.entity.js';
import { SessionSectorEntity } from './session-sector.entity.js';
import { SessionEntity } from './session.entity.js';
import { VenueSectorEntity } from './venue-sector.entity.js';
import { VenueEntity } from './venue.entity.js';

export const CATALOG_ENTITIES = [
  VenueEntity,
  VenueSectorEntity,
  EventEntity,
  SessionEntity,
  SessionSectorEntity,
  BatchEntity,
] as const;
