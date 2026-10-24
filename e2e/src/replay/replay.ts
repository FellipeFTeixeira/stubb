import { compose } from '../support/compose.ts';
import { withMongo } from '../support/mongo.ts';

const GROUP = 'projector';
const RESET_TIMEOUT_MS = 30000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reconstrói o read model. O offset do grupo só pode ser resetado com o grupo vazio. */
export async function replay(): Promise<void> {
  compose('stop', 'projector');

  await withMongo(async (db) => {
    await db.collection('pings').deleteMany({});
    await db.collection('processed_events').deleteMany({});
  });

  const deadline = Date.now() + RESET_TIMEOUT_MS;
  for (;;) {
    try {
      compose(
        'exec',
        '-T',
        'kafka',
        '/opt/kafka/bin/kafka-consumer-groups.sh',
        '--bootstrap-server',
        'kafka:9092',
        '--group',
        GROUP,
        '--reset-offsets',
        '--to-earliest',
        '--topic',
        'diagnostics.events',
        '--execute',
      );
      break;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(2000);
    }
  }

  compose('up', '-d', '--wait', 'projector');
}
