export interface AppConfig {
  port: number;
  mongoUrl: string;
  mongoDb: string;
  seedOrganizerId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3002),
    mongoUrl: env.MONGO_URL ?? 'mongodb://localhost:27017/?directConnection=true',
    mongoDb: env.MONGO_DB ?? 'stubb_read',
    // Fixed organizer until Identity exists (Fase 2): organizer reads filter by it.
    seedOrganizerId: env.SEED_ORGANIZER_ID ?? '0193a4f0-0000-7000-8000-000000000001',
  };
}
