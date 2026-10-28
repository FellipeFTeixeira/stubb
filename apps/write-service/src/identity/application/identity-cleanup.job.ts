import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Clock } from '../../shared/clock/clock.js';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class IdentityCleanupJob {
  private readonly logger = new Logger(IdentityCleanupJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  // Apaga refresh tokens e links de verificação vencidos ou revogados há mais de 7 dias.
  @Cron('0 4 * * *', { name: 'identity-cleanup' })
  async deleteExpired(): Promise<{ refreshTokens: number; verifications: number }> {
    const cutoff = new Date(this.clock.now().getTime() - RETENTION_MS);
    const refresh = await this.dataSource.query<[unknown[], number]>(
      'DELETE FROM identity_refresh_tokens WHERE expires_at < $1 OR revoked_at < $1',
      [cutoff],
    );
    const verifications = await this.dataSource.query<[unknown[], number]>(
      'DELETE FROM identity_email_verifications WHERE expires_at < $1',
      [cutoff],
    );
    const result = { refreshTokens: refresh[1], verifications: verifications[1] };
    this.logger.log(
      `Removidos ${result.refreshTokens} refresh tokens e ${result.verifications} links de verificação vencidos`,
    );
    return result;
  }
}
