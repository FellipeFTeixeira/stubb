import { Query } from '@nestjs/cqrs';
import type { PingView } from '@stubb/contracts';

export type GetPingResult =
  { found: true; ping: PingView; minVersionReached: boolean } | { found: false };

export class GetPingQuery extends Query<GetPingResult> {
  constructor(
    public readonly id: string,
    public readonly minVersion?: number,
  ) {
    super();
  }
}
