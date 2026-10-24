import { Module } from '@nestjs/common';
import { ProjectionModule } from '../projection/projection.module.js';
import { ConfluentEventConsumer } from './confluent-event-consumer.js';
import { EVENT_CONSUMER, PROCESS_EXIT } from './event-consumer.js';
import { KafkaConsumerService } from './kafka-consumer.service.js';

@Module({
  imports: [ProjectionModule],
  providers: [
    { provide: EVENT_CONSUMER, useFactory: () => new ConfluentEventConsumer() },
    { provide: PROCESS_EXIT, useValue: (code: number) => process.exit(code) },
    KafkaConsumerService,
  ],
})
export class KafkaModule {}
