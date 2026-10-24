export class ProjectionGapError extends Error {
  constructor(
    readonly eventId: string,
    readonly aggregateId: string,
    readonly aggregateVersion: number,
    readonly currentVersion: number | null,
  ) {
    super(
      `Lacuna de sequência: eventId=${eventId} aggregateId=${aggregateId} aggregateVersion=${aggregateVersion} currentVersion=${currentVersion ?? 'null'}`,
    );
    this.name = 'ProjectionGapError';
  }
}
