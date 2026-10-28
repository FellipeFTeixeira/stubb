# ADR 0010 — Identity como contexto CRUD

**Status:** aceito (2026-10-27)

## Contexto

A Fase 3 traz contas reais: cadastro com CPF, verificação de e-mail, login, papéis (cliente, produtor, admin; portaria reservada) e pedido de produtor aprovado pelo admin. Nenhum outro contexto reage a esses fatos nesta fase, e login e `GET /api/identity/me` exigem consistência forte: quem acabou de aprovar um produtor ou de confirmar o e-mail precisa ver o efeito na requisição seguinte. As decisões vêm da pesquisa SDD da fase (`SDD/RESEARCH/2026-10-27-IdentityResearch.md`); os códigos `D-n` apontam para lá.

## Decisão

- **Identity é CRUD, sem CQRS (D-1).** Controller → serviço de aplicação → TypeORM, sem CommandBus nem QueryBus, sem agregado versionado, sem outbox e sem read model. Nenhum evento de domínio é emitido e nada da Identity vai ao MongoDB. É o contraponto do Catalog: o mesmo produto tem um contexto que justifica CQRS e outro que não.
- **Vive no write-service (D-2).** Módulo `identity`, tabelas `identity_*` no PostgreSQL. O Nginx manda `/api/identity/` inteiro ao write-service, **inclusive `GET`**: é a exceção por prefixo prevista no [ADR 0002](0002-gateway-nginx.md). Consultas da Identity leem o write store por desenho, então não existe uma versão eventual delas para o read-service servir.
- **Tokens (D-4).** Access token JWT assinado com EdDSA (Ed25519), 15 min, claims `sub`, `roles`, `iss`, `aud`, `iat`, `exp`. Refresh token opaco de 7 dias deslizantes, guardado como SHA-256, com rotação a cada uso e revogação da família quando um refresh já usado reaparece. Só o write-service assina; o read-service recebe apenas a chave pública e verifica.
- **Validação em cada serviço (D-6).** Guard global default-deny em write e read (`AuthModule` com `APP_GUARD`): `@Public()` libera, `@Roles(...)` exige um dos papéis, `@CurrentUser()` entrega `{ id, roles }`. O Nginx só repassa `Authorization` e `Cookie`; não autentica nada.
- **E-mail por SMTP, depois do commit (D-17).** Mailpit no compose (SMTP interno, interface em `127.0.0.1`), envio com `nodemailer`. O envio acontece depois do commit e só quando o cadastro realmente executou (não em replay idempotente). Falha de envio vai para o log e a pessoa usa o reenvio. E-mail é notificação, não evento de domínio.

## Alternativas

- **Identity com outbox e eventos desde já:** nenhum consumidor existe; geraria tópico, projeção e contrato sem lição nova, e deixaria CPF, e-mail e hash numa fonte de replay.
- **Identity no read-service ou serviço próprio:** um terceiro serviço para um CRUD pequeno, com o mesmo banco de escrita ou um segundo Postgres, sem ganho nesta fase.
- **Autenticar no Nginx** (`auth_request` ou Kong): esconde a regra de papel fora do código e não resolve `@Roles` nem posse por usuário, que precisam do serviço de qualquer jeito.
- **Chave simétrica (HS256) compartilhada:** o read-service poderia forjar tokens; com EdDSA ele só verifica.
- **Outbox para o e-mail:** garantia de entrega que esta fase não precisa; o reenvio cobre a falha.

## Consequências

- O gateway ganha uma exceção por prefixo (`location /api/identity/` → write-service, antes de `location /api/`). O ADR 0002 continua valendo para o resto: `GET` → read, demais → write.
- Sem `min_version` na Identity: a leitura vem do PostgreSQL, consistente por natureza. O web só renova a sessão (refresh) para o token refletir o papel novo.
- **Um evento da Identity no futuro exige**, no mínimo, criar o tópico em `infra/kafka/create-topics.sh` (auto-create desligado, retenção infinita) e **nunca leva PII**: CPF, e-mail, nome e hash não entram em evento. Se a Fase 5 precisar do CPF, a Identity expõe uma query pública in-process (regra 10), não um evento.
- O Debezium captura só a tabela `outbox`; as `identity_*` nunca chegam ao Kafka, e é isso que se quer.
- Segredos só em forma de hash no banco (`scrypt` para senha, SHA-256 para refresh e token de verificação); nenhum JSON de `idempotency_keys` os contém.
- A chave privada JWT é o único segredo sem default no compose (`pnpm jwt:keys` gera o par de dev); um par versionado seria reaproveitado por qualquer clone.
- Troca de senha, MFA, bloqueio por tentativas e rate limit ficam para depois (Fase 9 para os dois últimos).
