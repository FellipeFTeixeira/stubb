import { config } from '../../config.js';
import type { MailMessage } from './mailer.js';

export function verificationLink(token: string): string {
  const base = config.PUBLIC_WEB_URL.replace(/\/+$/, '');
  return `${base}/verificar-email?token=${encodeURIComponent(token)}`;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function buildVerificationEmail(to: string, fullName: string, token: string): MailMessage {
  const link = verificationLink(token);
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;
  return {
    to,
    subject: 'Confirme seu e-mail no Stubb',
    text: [
      `Olá, ${firstName}!`,
      '',
      'Para ativar sua conta no Stubb, confirme seu e-mail abrindo o link abaixo (vale por 24 horas):',
      link,
      '',
      'Se você não criou uma conta, ignore esta mensagem.',
    ].join('\n'),
    html: [
      `<p>Olá, ${escapeHtml(firstName)}!</p>`,
      '<p>Para ativar sua conta no Stubb, confirme seu e-mail (o link vale por 24 horas):</p>',
      `<p><a href="${escapeHtml(link)}">Confirmar e-mail</a></p>`,
      '<p>Se você não criou uma conta, ignore esta mensagem.</p>',
    ].join('\n'),
  };
}
