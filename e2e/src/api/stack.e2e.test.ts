import { describe, expect, it } from 'vitest';
import { compose } from '../support/compose.ts';
import { query } from '../support/db.ts';

// CA-6: estado da infra depois do `stack:up`, além do que os healthchecks do compose já garantem.
describe('stack', () => {
  it('a publication stubb_outbox contém só public.outbox', async () => {
    const rows = await query<{ schemaname: string; tablename: string }>(
      `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'stubb_outbox'`,
    );
    expect(rows).toEqual([{ schemaname: 'public', tablename: 'outbox' }]);
  });

  it('diagnostics.events tem 3 partições e retenção infinita', () => {
    const out = compose(
      'exec',
      '-T',
      'kafka',
      '/opt/kafka/bin/kafka-topics.sh',
      '--bootstrap-server',
      'kafka:9092',
      '--describe',
      '--topic',
      'diagnostics.events',
    );
    expect(out).toContain('PartitionCount: 3');
    expect(out).toContain('retention.ms=-1');
  });

  it('o broker não cria tópicos automaticamente', () => {
    const out = compose(
      'exec',
      '-T',
      'kafka',
      '/opt/kafka/bin/kafka-configs.sh',
      '--bootstrap-server',
      'kafka:9092',
      '--entity-type',
      'brokers',
      '--entity-name',
      '1',
      '--describe',
      '--all',
    );
    expect(out).toMatch(/auto\.create\.topics\.enable=false/);
  });
});
