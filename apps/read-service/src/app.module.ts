import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { HealthController } from './health/health.controller.js';
import { MongoModule } from './mongo/mongo.module.js';

@Module({
  imports: [
    AuthModule.forRoot(),
    CqrsModule.forRoot(),
    MongoModule.forRoot(),
    DiagnosticsModule,
    CatalogModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
