import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).default(3001),
  DATABASE_URL: z.string().min(1).default('postgres://stubb:stubb@localhost:5433/stubb'),
});

export const config = configSchema.parse(process.env);
