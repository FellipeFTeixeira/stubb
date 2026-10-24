import type { INestApplication, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { v7 } from 'uuid';

process.env.DATABASE_URL ??= 'postgres://stubb:stubb@localhost:55432/stubb';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  close: () => Promise<void>;
}

export interface ProviderOverride {
  provide: Type<unknown>;
  useValue: unknown;
}

// AppModule é importado dinamicamente porque config.ts lê process.env na importação.
export async function createTestApp(overrides: ProviderOverride[] = []): Promise<TestApp> {
  const { AppModule } = await import('../../src/app.module.js');
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { provide, useValue } of overrides) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.init();
  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();
  await truncateAll(dataSource);
  return { app, dataSource, close: () => app.close() };
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE diagnostics_pings, outbox, idempotency_keys');
}

export function newKey(): string {
  return v7();
}

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function countRows(dataSource: DataSource, table: string): Promise<number> {
  const result = await rows<{ n: number }>(dataSource, `SELECT count(*)::int AS n FROM ${table}`);
  return result[0]?.n ?? 0;
}

export function api(ctx: TestApp) {
  return request(ctx.app.getHttpServer() as Server);
}

export function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

export function rows<T = Record<string, unknown>>(
  dataSource: DataSource,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  return dataSource.query<T[]>(sql, params);
}
