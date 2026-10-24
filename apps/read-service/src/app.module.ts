import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { HealthController } from './health/health.controller.js';
import { MongoModule } from './mongo/mongo.module.js';

@Module({
  imports: [CqrsModule.forRoot(), MongoModule.forRoot(), DiagnosticsModule],
  controllers: [HealthController],
})
export class AppModule {}
