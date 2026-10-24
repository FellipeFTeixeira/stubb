import { randomUUID } from 'node:crypto';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { DIAGNOSTICS_TOPIC } from '@stubb/contracts';
import { env } from './env.ts';

export interface CollectedMessage {
  partition: number;
  offset: number;
  key: string | null;
  headers: Record<string, string>;
  value: string;
}

/**
 * Lê `diagnostics.events` desde o início com um grupo descartável (sem commit) e devolve
 * as mensagens assim que o predicado aceita o conjunto coletado, ou o que houver após o timeout.
 */
export async function collectMessages(
  predicate: (messages: CollectedMessage[]) => boolean,
  timeoutMs = 20000,
): Promise<CollectedMessage[]> {
  const kafka = new KafkaJS.Kafka({
    // O localhost do host resolve também para ::1, onde a porta publicada não responde.
    'broker.address.family': 'v4',
    kafkaJS: { clientId: 'e2e', brokers: env.KAFKA_BROKERS },
  });
  const consumer = kafka.consumer({
    kafkaJS: { groupId: `e2e-${randomUUID()}`, fromBeginning: true, autoCommit: false },
  });
  const collected: CollectedMessage[] = [];
  let done: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });

  await consumer.connect();
  await consumer.subscribe({ topics: [DIAGNOSTICS_TOPIC] });
  const timer = setTimeout(done, timeoutMs);
  const running = consumer.run({
    eachMessage: ({ partition, message }) => {
      const headers: Record<string, string> = {};
      for (const [name, raw] of Object.entries(message.headers ?? {})) {
        const first = Array.isArray(raw) ? raw[0] : raw;
        if (first !== undefined) headers[name] = first.toString();
      }
      collected.push({
        partition,
        offset: Number(message.offset),
        key: message.key ? message.key.toString() : null,
        headers,
        value: message.value ? message.value.toString() : '',
      });
      if (predicate(collected)) done();
      return Promise.resolve();
    },
  });
  await finished;
  clearTimeout(timer);
  await running;
  await consumer.disconnect();
  return collected;
}
