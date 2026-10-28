import {
  LoginRequestSchema,
  RegisterUserRequestSchema,
  ResendVerificationRequestSchema,
} from '@stubb/contracts';
import { z } from 'zod';

// Mesmas regras do contrato; só o e-mail troca a mensagem padrão (em inglês) do `z.email()`.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('E-mail inválido').max(254, 'Máximo 254 caracteres'));

export const registerFormSchema = RegisterUserRequestSchema.extend({ email: emailField });
export const loginFormSchema = LoginRequestSchema.extend({ email: emailField });
export const resendFormSchema = ResendVerificationRequestSchema.extend({ email: emailField });

export type RegisterFormInput = z.input<typeof registerFormSchema>;
export type RegisterFormOutput = z.output<typeof registerFormSchema>;
export type LoginFormInput = z.input<typeof loginFormSchema>;
export type LoginFormOutput = z.output<typeof loginFormSchema>;
export type ResendFormInput = z.input<typeof resendFormSchema>;
export type ResendFormOutput = z.output<typeof resendFormSchema>;
