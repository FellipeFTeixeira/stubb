import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from './catalog/catalog.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { HealthController } from './health/health.controller.js';
import { MongoModule } from './mongo/mongo.module.js';

@Module({
  imports: [CqrsModule.forRoot(), MongoModule.forRoot(), DiagnosticsModule, CatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
