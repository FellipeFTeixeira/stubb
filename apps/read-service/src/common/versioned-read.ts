import { pollUntil } from './poll-until.js';

// Read-your-writes for by-ID reads (regra 7): without min_version reads once; with it waits up
// to 3 s for the document to reach the version. `reached` is true only for a document that
// exists and satisfies min_version (I-15: also true for a tombstone or draft that does).
export async function readWithMinVersion<T extends { version: number }>(
  read: () => Promise<T | null>,
  minVersion: number | undefined,
): Promise<{ value: T | null; reached: boolean }> {
  if (minVersion === undefined) {
    const value = await read();
    return { value, reached: value !== null };
  }
  return pollUntil(read, (doc) => doc !== null && doc.version >= minVersion);
}
