import { DataSource, type DataSourceOptions } from 'typeorm';
import { config } from '../config.js';
import { CATALOG_ENTITIES } from '../catalog/infrastructure/entities/index.js';
import { PingEntity } from '../diagnostics/infrastructure/ping.entity.js';
import { IdempotencyKeyEntity } from '../shared/idempotency/idempotency-key.entity.js';
import { OutboxEntity } from '../shared/outbox/outbox.entity.js';
import { migrations } from './migrations/index.js';

export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [PingEntity, OutboxEntity, IdempotencyKeyEntity, ...CATALOG_ENTITIES],
    migrations,
    synchronize: false,
    migrationsRun: false,
  };
}

// Único export de DataSource do arquivo (exigência da CLI do TypeORM).
export default new DataSource(buildDataSourceOptions(config.DATABASE_URL));
