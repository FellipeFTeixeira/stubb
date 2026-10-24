import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GetPingResponseSchema } from '@stubb/contracts';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DiagnosticsModule } from '../../src/diagnostics/diagnostics.module.js';
import { CqrsModule } from '@nestjs/cqrs';
import { MongoModule } from '../../src/mongo/mongo.module.js';

const MONGO_URL = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:58018/?directConnection=true';
const DB = 'stubb_read_it';
const ID = '0190a0a0-0000-7000-8000-000000000001';
const MISSING = '0190a0a0-0000-7000-8000-0000000000ff';

interface PingBody {
  minVersionReached: boolean;
  ping: { version: number };
}

describe('GET /api/diagnostics/pings/:id (MongoDB)', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;
  let client: MongoClient;

  const seed = (version: number) =>
    client
      .db(DB)
      .collection<{ _id: string }>('pings')
      .replaceOne(
        { _id: ID },
        {
          _id: ID,
          label: 'it',
          count: version - 1,
          version,
          createdAt: new Date('2026-10-24T00:00:00.000Z'),
          updatedAt: new Date('2026-10-24T00:00:01.000Z'),
        },
        { upsert: true },
      );

  beforeAll(async () => {
    client = await new MongoClient(MONGO_URL).connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        MongoModule.forRoot({ url: MONGO_URL, dbName: DB }),
        DiagnosticsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await client.db(DB).dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await client.db(DB).collection('pings').deleteMany({});
  });

  it('answers immediately when min_version is already reached', async () => {
    await seed(1);
    const started = Date.now();
    const res = await request(server()).get(`/api/diagnostics/pings/${ID}?min_version=1`);
    expect(Date.now() - started).toBeLessThan(500);
    expect(res.status).toBe(200);
    const body = GetPingResponseSchema.parse(res.body);
    expect(body.minVersionReached).toBe(true);
    expect(body.ping).toMatchObject({
      id: ID,
      label: 'it',
      count: 0,
      version: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:01.000Z',
    });
  });

  it('times out with reached=false and the current state', async () => {
    await seed(1);
    const started = Date.now();
    const res = await request(server()).get(`/api/diagnostics/pings/${ID}?min_version=2`);
    const elapsed = Date.now() - started;
    const body = res.body as PingBody;
    expect(res.status).toBe(200);
    expect(body.minVersionReached).toBe(false);
    expect(body.ping.version).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThanOrEqual(4000);
  });

  it('resolves when the projection catches up during the wait', async () => {
    await seed(1);
    setTimeout(() => void seed(2), 500);
    const res = await request(server()).get(`/api/diagnostics/pings/${ID}?min_version=2`);
    const body = res.body as PingBody;
    expect(res.status).toBe(200);
    expect(body.minVersionReached).toBe(true);
    expect(body.ping.version).toBe(2);
  });

  it('returns 404 with minVersionReached=false for a missing id', async () => {
    const res = await request(server()).get(`/api/diagnostics/pings/${MISSING}?min_version=1`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, minVersionReached: false });
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(server()).get('/api/diagnostics/pings/abc');
    expect(res.status).toBe(400);
  });
});
