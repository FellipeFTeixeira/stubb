export interface AppConfig {
  port: number;
  mongoUrl: string;
  mongoDb: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3002),
    mongoUrl: env.MONGO_URL ?? 'mongodb://localhost:27017/?directConnection=true',
    mongoDb: env.MONGO_DB ?? 'stubb_read',
  };
}
