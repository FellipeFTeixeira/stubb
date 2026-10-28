import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from './config.js';
import { buildDataSourceOptions } from './database/data-source.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';

@Module({
  imports: [
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    // autoLoadEntities: as entities da Identity entram via forFeature (data-source.ts não é da trilha H).
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(config.DATABASE_URL),
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    DiagnosticsModule,
    CatalogModule,
    IdentityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
