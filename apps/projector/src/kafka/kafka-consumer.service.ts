import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DIAGNOSTICS_TOPIC, DiagnosticsEventSchema } from '@stubb/contracts';
import { EventDispatcher } from '../projection/event-dispatcher.js';
import {
  type ConsumedMessage,
  EVENT_CONSUMER,
  type EventConsumer,
  PROCESS_EXIT,
} from './event-consumer.js';

@Injectable()
export class KafkaConsumerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);

  constructor(
    @Inject(EVENT_CONSUMER) private readonly consumer: EventConsumer,
    private readonly dispatcher: EventDispatcher,
    @Inject(PROCESS_EXIT) private readonly exit: (code: number) => void,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe([DIAGNOSTICS_TOPIC]);
    await this.consumer.run((m) => this.handle(m));
  }

  async handle(message: ConsumedMessage): Promise<void> {
    try {
      const event = DiagnosticsEventSchema.parse(JSON.parse(message.value?.toString() ?? ''));
      await this.dispatcher.dispatch(event);
      // Offset só é confirmado depois que o read model foi gravado.
      await this.consumer.commit(message);
    } catch (err) {
      this.logger.error(
        `Falha ao projetar: partition=${message.partition} offset=${message.offset} eventId=${message.headers['eventId'] ?? 'desconhecido'}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Sem commit: o restart reprocessa a partir do último offset confirmado.
      this.exit(1);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }
}
