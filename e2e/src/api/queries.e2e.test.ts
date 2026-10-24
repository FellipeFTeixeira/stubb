import { randomUUID } from 'node:crypto';
import { diagnosticsRoutes, type GetPingResponse } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { api, fetchText } from '../support/http.ts';
import { createPing } from '../support/pings.ts';

const getPing = (id: string, minVersion?: number) =>
  api<GetPingResponse>(
    'GET',
    `${diagnosticsRoutes.getPing(id)}${minVersion === undefined ? '' : `?min_version=${minVersion}`}`,
  );

describe('queries via gateway', () => {
  it('CA-25: read-your-writes com min_version', async () => {
    const created = await createPing();
    const id = created.body.id;

    const reached = await getPing(id, 1);
    expect(reached.status).toBe(200);
    expect(reached.body.minVersionReached).toBe(true);
    expect(reached.body.ping.version).toBe(1);

    const notReached = await getPing(id, 99);
    expect(notReached.status).toBe(200);
    expect(notReached.body.minVersionReached).toBe(false);
    expect(notReached.body.ping.version).toBe(1);
    expect(notReached.elapsedMs).toBeGreaterThan(2500);
    expect(notReached.elapsedMs).toBeLessThan(5000);
  });

  it('CA-25: id sem documento devolve 404 com minVersionReached false', async () => {
    const res = await api<{ statusCode: number; minVersionReached: boolean }>(
      'GET',
      `${diagnosticsRoutes.getPing(randomUUID())}?min_version=1`,
    );
    expect(res.status).toBe(404);
    expect(res.body.minVersionReached).toBe(false);
    expect(res.elapsedMs).toBeGreaterThan(2500);
  });

  it('CA-27: o Nginx roteia GET para o read-service, POST para o write-service e / para o web', async () => {
    const created = await createPing();
    expect(created.status).toBe(202);

    const read = await getPing(created.body.id, 1);
    expect(read.status).toBe(200);
    expect(read.body).toHaveProperty('minVersionReached');

    const page = await fetchText('/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('<div id="root">');
  });
});
