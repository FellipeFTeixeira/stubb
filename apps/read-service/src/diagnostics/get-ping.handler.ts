import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { pollUntil } from '../common/poll-until.js';
import { GetPingQuery, type GetPingResult } from './get-ping.query.js';
import { PingReadRepository } from './ping-read.repository.js';

// Read-your-writes (RN-9): polls the read store until the projection reaches min_version.
// Read-only: a query never changes state.
@QueryHandler(GetPingQuery)
export class GetPingHandler implements IQueryHandler<GetPingQuery, GetPingResult> {
  constructor(@Inject(PingReadRepository) private readonly repository: PingReadRepository) {}

  async execute(query: GetPingQuery): Promise<GetPingResult> {
    const { id, minVersion } = query;
    if (minVersion === undefined) {
      const ping = await this.repository.findById(id);
      return ping ? { found: true, ping, minVersionReached: true } : { found: false };
    }
    const { value: ping, reached } = await pollUntil(
      () => this.repository.findById(id),
      (p) => p !== null && p.version >= minVersion,
    );
    return ping ? { found: true, ping, minVersionReached: reached } : { found: false };
  }
}
