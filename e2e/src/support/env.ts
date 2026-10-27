export const env = {
  // O Vitest define BASE_URL='/' no ambiente, então o nome precisa ser outro.
  BASE_URL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://stubb:stubb@127.0.0.1:5433/stubb',
  MONGO_URL: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017/?directConnection=true',
  MONGO_DB: process.env.MONGO_DB ?? 'stubb_read',
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS ?? '127.0.0.1:9094').split(','),
};
