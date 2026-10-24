import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { KafkaModule } from './kafka/kafka.module.js';
import { MongoModule } from './mongo/mongo.module.js';
import { ProjectionModule } from './projection/projection.module.js';

// Sem @nestjs/cqrs: o projector só consome eventos do Kafka e grava no read store (OQ-27).
@Module({
  imports: [MongoModule, ProjectionModule, KafkaModule],
  controllers: [HealthController],
})
export class AppModule {}
