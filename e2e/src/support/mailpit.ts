import { env } from './env.ts';

const TIMEOUT_MS = 15000;
const POLL_MS = 250;

interface MessageSummary {
  ID: string;
  Created: string;
  To: { Address: string }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${env.MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit GET ${path} → ${response.status}`);
  return (await response.json()) as T;
}

/** Mensagens enviadas ao endereço, da mais nova para a mais antiga (ordem do Mailpit). */
async function messagesTo(email: string): Promise<MessageSummary[]> {
  const { messages } = await getJson<{ messages: MessageSummary[] }>('/api/v1/messages?limit=200');
  const target = email.toLowerCase();
  return messages.filter((m) => m.To.some((to) => to.Address.toLowerCase() === target));
}

export async function countMessagesTo(email: string): Promise<number> {
  return (await messagesTo(email)).length;
}

function extractToken(text: string): string {
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error(`e-mail sem link com token: ${text.slice(0, 200)}`);
  return match[1];
}

/**
 * Espera um e-mail de verificação para o endereço e devolve o token do link mais novo.
 * `after`: só considera mensagens criadas a partir desse instante.
 * `minCount`: só considera quando já há pelo menos essa quantidade de mensagens ao endereço
 * (evita o relógio do Mailpit, que roda em container, e serve para esperar o reenvio).
 */
export async function waitForVerificationToken(
  email: string,
  options: { after?: Date; minCount?: number } = {},
): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const found = (await messagesTo(email)).filter(
      (m) => options.after === undefined || new Date(m.Created) >= options.after,
    );
    const newest = found[0];
    if (newest && found.length >= (options.minCount ?? 1)) {
      const { Text } = await getJson<{ Text: string }>(`/api/v1/message/${newest.ID}`);
      return extractToken(Text);
    }
    if (Date.now() > deadline) {
      throw new Error(`nenhum e-mail de verificação para ${email} em ${TIMEOUT_MS / 1000}s`);
    }
    await sleep(POLL_MS);
  }
}
