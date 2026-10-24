export const env = {
  // O Vitest define BASE_URL='/' no ambiente, então o nome precisa ser outro.
  BASE_URL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://stubb:stubb@localhost:5433/stubb',
  MONGO_URL: process.env.MONGO_URL ?? 'mongodb://localhost:27017/?directConnection=true',
  MONGO_DB: process.env.MONGO_DB ?? 'stubb_read',
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS ?? 'localhost:9094').split(','),
};
