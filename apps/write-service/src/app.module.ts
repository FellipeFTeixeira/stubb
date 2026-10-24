import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from './config.js';
import { buildDataSourceOptions } from './database/data-source.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(config.DATABASE_URL) }),
    DiagnosticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
