export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Substitui o Mailer nos testes de integração: guarda o que seria enviado, sem SMTP.
export class FakeMailer {
  readonly sent: SentEmail[] = [];
  failNext = false;

  send(message: SentEmail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP indisponível'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  to(address: string): SentEmail[] {
    return this.sent.filter((email) => email.to === address);
  }

  // Token do link `.../verificar-email?token=<token>` no corpo de texto.
  extractToken(email: SentEmail): string {
    const match = /verificar-email\?token=([^\s&"]+)/.exec(email.text);
    if (!match?.[1]) throw new Error('Link de verificação não encontrado no e-mail');
    return decodeURIComponent(match[1]);
  }

  reset(): void {
    this.sent.length = 0;
    this.failNext = false;
  }
}
