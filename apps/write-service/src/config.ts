import { z } from 'zod';

const booleanFlag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).default(3001),
  DATABASE_URL: z.string().min(1).default('postgres://stubb:stubb@localhost:5433/stubb'),

  // Chaves Ed25519 (PEM em base64). Opcionais no schema para não quebrar specs unitárias;
  // o AuthModule falha no bootstrap se faltarem.
  JWT_PRIVATE_KEY: z.string().min(1).optional(),
  JWT_PUBLIC_KEY: z.string().min(1).optional(),
  COOKIE_SECURE: booleanFlag('true'),

  SMTP_URL: z.string().min(1).default('smtp://localhost:1025'),
  MAIL_FROM: z.string().min(1).default('Stubb <nao-responda@stubb.local>'),
  PUBLIC_WEB_URL: z.url().default('http://127.0.0.1:8080'),

  IDENTITY_SEED_ENABLED: booleanFlag('false'),
  IDENTITY_ADMIN_ID: z.uuid().default('0193a4f0-0000-7000-8000-000000000000'),
  IDENTITY_ADMIN_EMAIL: z.string().min(1).default('admin@stubb.local'),
  IDENTITY_ADMIN_PASSWORD: z.string().min(1).default('stubb-admin-dev'),
  IDENTITY_ADMIN_NAME: z.string().min(1).default('Administrador Stubb'),
  IDENTITY_ADMIN_CPF: z.string().min(1).default('12345678909'),
  // O ID do produtor seed não deve mudar: os dados de demonstração do Catalog pertencem a ele.
  IDENTITY_SEED_ORGANIZER_ID: z.uuid().default('0193a4f0-0000-7000-8000-000000000001'),
  IDENTITY_SEED_ORGANIZER_EMAIL: z.string().min(1).default('produtor@stubb.local'),
  IDENTITY_SEED_ORGANIZER_PASSWORD: z.string().min(1).default('stubb-produtor-dev'),
  IDENTITY_SEED_ORGANIZER_NAME: z.string().min(1).default('Produtor Demo'),
  IDENTITY_SEED_ORGANIZER_CPF: z.string().min(1).default('98765432100'),
  IDENTITY_SEED_ORGANIZER_ORGANIZATION: z.string().min(1).default('Produtora Demo'),
  IDENTITY_SEED_ORGANIZER_CNPJ: z.string().min(1).default('11222333000181'),
});

export const config = configSchema.parse(process.env);
