// Os defaults das credenciais do seed e da porta do Mailpit espelham o `.env.example`.
// O E2E não lê o `.env`: se os valores mudarem lá, exporte as `E2E_*` no shell antes do teste.
export const env = {
  // O Vitest define BASE_URL='/' no ambiente, então o nome precisa ser outro.
  BASE_URL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://stubb:stubb@127.0.0.1:5433/stubb',
  MONGO_URL: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017/?directConnection=true',
  MONGO_DB: process.env.MONGO_DB ?? 'stubb_read',
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS ?? '127.0.0.1:9094').split(','),
  MAILPIT_URL: process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025',
  ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? 'admin@stubb.local',
  ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? 'stubb-admin-dev',
  ORGANIZER_EMAIL: process.env.E2E_ORGANIZER_EMAIL ?? 'produtor@stubb.local',
  ORGANIZER_PASSWORD: process.env.E2E_ORGANIZER_PASSWORD ?? 'stubb-produtor-dev',
  /** Opcional: chave pública (PEM em base64, a mesma do `.env`) para o teste conferir a assinatura do JWT. */
  JWT_PUBLIC_KEY: process.env.E2E_JWT_PUBLIC_KEY,
};
