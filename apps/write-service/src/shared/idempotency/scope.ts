// Escopo da Idempotency-Key. Com ator, a mesma chave de dois usuários não colide;
// sem ator (rotas públicas, como o cadastro) o escopo é só o template da rota.
export function idempotencyScope(template: string, actorId?: string): string {
  return actorId ? `${actorId} ${template}` : template;
}
