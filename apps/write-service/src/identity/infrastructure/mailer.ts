import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { config } from '../../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// E-mail é efeito colateral de notificação, não evento de domínio (D-17): envio direto por SMTP.
@Injectable()
export class Mailer {
  private readonly transport = nodemailer.createTransport(config.SMTP_URL);

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: config.MAIL_FROM, ...message });
  }
}
