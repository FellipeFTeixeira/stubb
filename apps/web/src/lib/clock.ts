// Isolado para o lint de pureza do React não confundir handlers de evento com render.
export const nowMs = (): number => performance.now();
