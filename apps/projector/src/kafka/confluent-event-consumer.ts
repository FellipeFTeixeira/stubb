import { KafkaJS } from '@confluentinc/kafka-javascript';
import { config } from '../config.js';
import type { ConsumedMessage, EventConsumer } from './event-consumer.js';

export class ConfluentEventConsumer implements EventConsumer {
  private readonly consumer: KafkaJS.Consumer;

  constructor() {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: config.KAFKA_CLIENT_ID, brokers: config.KAFKA_BROKERS },
    });
    this.consumer = kafka.consumer({
      kafkaJS: { groupId: config.KAFKA_GROUP_ID, fromBeginning: true, autoCommit: false },
    });
  }

  connect(): Promise<void> {
    return this.consumer.connect();
  }

  subscribe(topics: string[]): Promise<void> {
    return this.consumer.subscribe({ topics });
  }

  run(handler: (message: ConsumedMessage) => Promise<void>): Promise<void> {
    return this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const headers: Record<string, string> = {};
        for (const [name, raw] of Object.entries(message.headers ?? {})) {
          const first = Array.isArray(raw) ? raw[0] : raw;
          if (first !== undefined) headers[name] = first.toString();
        }
        await handler({
          topic,
          partition,
          offset: message.offset,
          key: message.key ? message.key.toString() : null,
          value: message.value,
          headers,
        });
      },
    });
  }

  commit(message: ConsumedMessage): Promise<void> {
    return this.consumer.commitOffsets([
      {
        topic: message.topic,
        partition: message.partition,
        offset: (BigInt(message.offset) + 1n).toString(),
      },
    ]);
  }

  disconnect(): Promise<void> {
    return this.consumer.disconnect();
  }
}
