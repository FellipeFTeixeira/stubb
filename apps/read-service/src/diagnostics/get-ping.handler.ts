import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetPingQuery, type GetPingResult } from './get-ping.query.js';
import { PingReadRepository } from './ping-read.repository.js';

export const POLL_INTERVAL_MS = 100;
export const POLL_TIMEOUT_MS = 3000;

// Read-your-writes (RN-9): polls the read store until the projection reaches min_version.
// Read-only: a query never changes state.
@QueryHandler(GetPingQuery)
export class GetPingHandler implements IQueryHandler<GetPingQuery, GetPingResult> {
  constructor(@Inject(PingReadRepository) private readonly repository: PingReadRepository) {}

  async execute(query: GetPingQuery): Promise<GetPingResult> {
    const { id, minVersion } = query;
    const startedAt = Date.now();
    for (;;) {
      const ping = await this.repository.findById(id);
      if (minVersion === undefined) {
        return ping ? { found: true, ping, minVersionReached: true } : { found: false };
      }
      if (ping && ping.version >= minVersion) {
        return { found: true, ping, minVersionReached: true };
      }
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        return ping ? { found: true, ping, minVersionReached: false } : { found: false };
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
