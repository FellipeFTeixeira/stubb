import { diagnosticsRoutes, type GetPingResponse } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { api } from '../support/http.ts';
import { createPing, incrementPing } from '../support/pings.ts';
import { replay } from './replay.ts';

const READ_TIMEOUT_MS = 30000;

async function readAtVersion(id: string, minVersion: number) {
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const res = await api<GetPingResponse>(
      'GET',
      `${diagnosticsRoutes.getPing(id)}?min_version=${minVersion}`,
    );
    if (res.status === 200 && res.body.minVersionReached) return res.body;
    if (Date.now() > deadline) throw new Error(`ping ${id} não chegou à versão ${minVersion}`);
  }
}

describe('replay', () => {
  it('CA-31: apagar o read model e reprocessar o tópico reproduz o mesmo documento', async () => {
    const created = await createPing();
    const id = created.body.id;
    await incrementPing(id);
    await incrementPing(id);

    const snapshot = await readAtVersion(id, 3);
    expect(snapshot.ping.version).toBe(3);

    await replay();

    const rebuilt = await readAtVersion(id, 3);
    expect(rebuilt.ping).toEqual(snapshot.ping);
  });
});
