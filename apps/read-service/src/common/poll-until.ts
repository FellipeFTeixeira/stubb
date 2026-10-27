export const POLL_INTERVAL_MS = 100;
export const POLL_TIMEOUT_MS = 3000;

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

// Read-your-writes (regra 7): reads the read store until `done` accepts the value or the
// timeout passes. On timeout it returns the last value read with `reached: false`.
// Read-only: it never changes state.
export async function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  options: PollOptions = {},
): Promise<{ value: T; reached: boolean }> {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? POLL_TIMEOUT_MS;
  const startedAt = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return { value, reached: true };
    if (Date.now() - startedAt >= timeoutMs) return { value, reached: false };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
