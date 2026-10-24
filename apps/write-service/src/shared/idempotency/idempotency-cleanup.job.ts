import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class IdempotencyCleanupJob {
  private readonly logger = new Logger(IdempotencyCleanupJob.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'idempotency-cleanup' })
  async deleteExpired(): Promise<number> {
    const result = await this.dataSource.query<[unknown[], number]>(
      "DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'",
    );
    const deleted = result[1];
    this.logger.log(`Deleted ${deleted} expired idempotency keys`);
    return deleted;
  }
}
