import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetPingQuery } from './get-ping.query.js';
import { PingsController } from './pings.controller.js';

const ID = '0190a0a0-0000-7000-8000-000000000001';

describe('PingsController', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;
  const execute = vi.fn();

  beforeEach(async () => {
    execute.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [PingsController],
      providers: [{ provide: QueryBus, useValue: { execute } }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(server()).get('/api/diagnostics/pings/not-a-uuid');
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('Validation failed');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'x'])('returns 400 for min_version=%s', async (value) => {
    const res = await request(server()).get(`/api/diagnostics/pings/${ID}?min_version=${value}`);
    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('passes undefined minVersion when absent', async () => {
    execute.mockResolvedValue({ found: false });
    const res = await request(server()).get(`/api/diagnostics/pings/${ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, minVersionReached: false });
    const query = execute.mock.calls[0]?.[0] as GetPingQuery;
    expect(query.id).toBe(ID);
    expect(query.minVersion).toBeUndefined();
  });

  it('parses min_version to a number', async () => {
    execute.mockResolvedValue({ found: false });
    await request(server()).get(`/api/diagnostics/pings/${ID}?min_version=3`);
    expect((execute.mock.calls[0]?.[0] as GetPingQuery).minVersion).toBe(3);
  });
});
