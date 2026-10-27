import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).default(3001),
  DATABASE_URL: z.string().min(1).default('postgres://stubb:stubb@localhost:5433/stubb'),
  // Produtor único da Fase 2 (sem autenticação ainda); o compose usa o mesmo valor no read-service.
  SEED_ORGANIZER_ID: z.uuid().default('0193a4f0-0000-7000-8000-000000000001'),
});

export const config = configSchema.parse(process.env);
