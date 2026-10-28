---
feature: Identity
fase: 3 — Identity
date: 2026-10-27
status: draft
area: Integracao
---

# Identity — Research parcial: integração com o código existente

## Objetivo

Mapear onde a autenticação encosta no código das Fases 1 e 2 e o que muda para receber o usuário autenticado no lugar do produtor seed. Não decide domínio, modelo nem regras da Identity: isso é do Research oficial (`SDD/RESEARCH/2026-10-27-IdentityResearch.md`). As decisões D-n citadas abaixo são de lá. Esta parcial confirma D-2, D-5, D-6, D-7, D-8 e D-14 e acrescenta pontos que faltam (seção "Lacunas").

Conceito de CQRS exercitado: a identidade do ator é **entrada do command** (quem pede) e **filtro da query** (o que cada um enxerga). Ela não muda os eventos nem os read models, que já carregam `organizerId`.

## Escopo

**Dentro:** troca do produtor seed pelo `sub` do token no write-service e no read-service; checagem de posse nos handlers do Catalog; gateway; guards; cliente HTTP e rotas do web; testes, E2E e seed afetados; impacto mecânico caso a Identity publique eventos.

**Fora:** modelo de usuário, papéis, CPF, tokens e endpoints da Identity (Research oficial, D-1 a D-16); UX de login.

## Mapeamento da codebase

### 1. Produtor seed no Catalog

**Write-service.** Ator só entra na criação. Os demais commands não checam dono (Catalog RN-2, `SDD/SPEC/2026-10-26-CatalogSpec.md:38`).

| Ponto | Estado | Muda para |
|---|---|---|
| `apps/write-service/src/config.ts:7` | `SEED_ORGANIZER_ID` (Zod, com default) | Sai; entram as chaves JWT (D-13) |
| `apps/write-service/src/shared/actor/current-organizer.ts:4-10` e `.spec.ts:4-6` | Provider que devolve o seed | Removidos |
| `apps/write-service/src/shared/shared.module.ts:3,22,24` | Registra e exporta `CurrentOrganizer` | Remove o provider |
| `apps/write-service/src/catalog/application/create-event.handler.ts:15,20` | `this.organizer.id()` | `command.actorId` |
| `apps/write-service/src/catalog/application/register-venue.handler.ts:15,20` | idem | `command.actorId` |
| `apps/write-service/src/catalog/application/require.ts:8-21` | `requireVenue`/`requireEvent` carregam o agregado e lançam `AggregateNotFoundError` (404) | **Ponto único da posse:** recebem `actorId` e tratam agregado de outro dono como inexistente (mesmo 404). Usados por 11 handlers (todos os de `application/` exceto create/register) |
| `apps/write-service/src/catalog/application/schedule-session.handler.ts:23-24` | Carrega o `Venue` sem checar dono; inexistente vira 422 `VENUE_NOT_FOUND` | Local de outro dono também vira 422 `VENUE_NOT_FOUND` (Catalog RN-2: "a sessão só usa local do mesmo produtor") |
| `apps/write-service/src/catalog/application/*.command.ts` (14 arquivos) | Sem ator | Ganham `actorId: string` |
| `apps/write-service/src/catalog/http/events.controller.ts:58-252` e `venues.controller.ts:47-117` | 14 rotas, todas `@IdempotencyKey()` + `idempotency.execute(...)` + `commandBus.execute(new XCommand(...))` | `@Roles('organizer')` na classe; `@CurrentUser()` preenche o `actorId` do command e entra no escopo da idempotência (L-1) |

Ordem de checagem já favorável: `requireX` roda antes do `events.update(event, expected)`, então a posse (404) é decidida antes da versão (409) e o 409 não vaza a existência de recurso alheio.

**Read-service.**

| Ponto | Estado | Muda para |
|---|---|---|
| `apps/read-service/src/config.ts:14` | `seedOrganizerId` com default | Sai; entra `jwtPublicKey` |
| `apps/read-service/src/catalog/seed-organizer.ts:3` | Token de injeção | Removido |
| `apps/read-service/src/catalog/catalog.module.ts:16` | Provider do token | Removido |
| `apps/read-service/src/catalog/catalog.queries.ts` | `ListOrganizerEventsQuery(page, pageSize)`, `GetOrganizerEventQuery(eventId, minVersion)`, `ListVenuesQuery()`, `GetVenueQuery(venueId, minVersion)` | Ganham `organizerId` como primeiro campo |
| `apps/read-service/src/catalog/catalog.handlers.ts:101,109,125,135,153,157,175,184` | Filtram pelo seed injetado | Filtram por `query.organizerId`; a regra "outro dono = não encontrado" (`:135`, `:184`) fica |
| `apps/read-service/src/catalog/organizer.controller.ts:24-70` | 4 GETs públicos | `@Roles('organizer')` na classe; `@CurrentUser()` vai para a query |
| `apps/read-service/src/catalog/public-events.controller.ts:15-26` | Vitrine e página do evento | Continuam públicas (`@Public()`) |

Repositório (`catalog-read.repository.ts:92-114`) já recebe `organizerId` por parâmetro: não muda. Projector e contratos de eventos não mudam (`organizerId` já está em `VenueRegistered`/`EventCreated`, `catalog-event.mapper.ts:83,107`).

**Compose:** âncora `x-seed-organizer-id` (`docker-compose.yaml:15`) usada em `:193` (write) e `:219` (read). Sai; o UUID continua existindo só como ID do produtor seed da Identity (D-14).

### 2. Gateway Nginx

Estado: `infra/nginx/nginx.dev.conf:1-23` e `nginx.prod.conf:1-19` têm um `location /api/` com `map $request_method` (GET/HEAD → read, resto → write). Só o gateway publica porta; write e read não são alcançáveis de fora da rede do compose (`docker-compose.override.yaml` não publica portas dos serviços). O web é servido pelo mesmo Nginx (`location /`), e o Vite não tem proxy (`apps/web/vite.config.ts:9`): **web e API têm a mesma origem**, então não há CORS e o cookie do refresh é first-party.

Opções de validação de JWT:

| Opção | Avaliação |
|---|---|
| `auth_jwt` | Só no NGINX Plus. Fora |
| `auth_request` para um endpoint de verificação | Um salto HTTP a mais por requisição. Também não resolve a autorização: público ou protegido depende de método + caminho (`GET /api/catalog/events` é vitrine, `POST /api/catalog/events` é do produtor), e posse depende do agregado. Duplicaria a regra no Nginx |
| Gateway valida e injeta `X-User-Id` | Exige validação no gateway (cai num dos dois acima) e torna o serviço dependente de confiar num header |
| **Validação nos serviços** (guard global) | Cada serviço se defende sozinho; a regra de acesso fica junto do controller que ela protege |

Recomendação: validação nos serviços, o Nginx só repassa (D-6 do Research oficial; esta parcial confirma). O `proxy_pass` já repassa `Authorization` e `Cookie` e devolve `Set-Cookie` sem configuração extra. Única mudança no gateway: `location /api/identity/` → `write_service` para todos os métodos, nos dois arquivos (D-2), repetindo os `proxy_set_header` de `nginx.dev.conf:10-14`. Como o Nginx escolhe o prefixo mais longo, a ordem dos blocos não importa.

### 3. Guards no write-service e no read-service

- Prefixo global `api` com `exclude: ['health']` em `apps/write-service/src/main.ts:8` e `apps/read-service/src/main.ts:8`. O guard global entra por `APP_GUARD` num `AuthModule` próprio de cada serviço, não no `main.ts`, para valer também nos testes que montam o módulo (L-3).
- Guards do Nest rodam antes dos pipes e dos handlers de rota. Uma requisição sem token é recusada **antes** de `idempotency.execute`, então não reserva chave em `idempotency_keys`.
- Erros: `DomainErrorFilter` é aplicado por controller (`events.controller.ts:51`) e só mapeia erros de domínio para 404/409/422 (`domain-error.filter.ts:20-38`). O guard lança `UnauthorizedException`/`ForbiddenException`, que o Nest serializa sozinho. **Decisão do planner:** o corpo segue o formato de `DomainErrorResponseSchema` (`libs/contracts/src/http/errors.ts:44-48`), com os códigos `UNAUTHENTICATED` (401) e `FORBIDDEN` (403) acrescentados a `COMMAND_ERROR_CODES` (`errors.ts:3`). *Por quê:* o web já trata erro pelo `code` (`apps/web/src/api/http.ts:13-17`).

Rotas por acesso:

| Serviço | Rota | Acesso |
|---|---|---|
| write | `GET /health` | `@Public()` (healthcheck do compose, `docker-compose.override.yaml:17-23`) |
| write | `POST /api/diagnostics/pings`, `POST /api/diagnostics/pings/:id/increment` (`diagnostics/http/pings.controller.ts:20-59`) | `@Public()` (L-4) |
| write | 14 rotas de `/api/catalog/venues*` e `/api/catalog/events*` | `organizer` + posse |
| write | `/api/identity/*` | Definido pelo Research oficial (D-12) |
| read | `GET /health`, `GET /api/diagnostics/pings/:id` | `@Public()` |
| read | `GET /api/catalog/events`, `GET /api/catalog/events/:eventId` | `@Public()` (vitrine) |
| read | `GET /api/catalog/organizer/{events,events/:id,venues,venues/:id}` | `organizer`; filtro pelo `sub` |

Propagação da identidade: o guard verifica a assinatura e põe `{ sub, roles }` no request; `@CurrentUser()` lê dali. Nada de header injetado pelo gateway (ver seção 2). O read-service recebe só a chave pública (D-4) e não tem dependência nova proibida: a regra de arquitetura (`apps/read-service/test/unit/architecture.spec.ts:5-8`) só veta `pg`/`typeorm`, e `jose` passa.

### 4. Web

| Ponto | Estado | Impacto |
|---|---|---|
| `apps/web/src/api/http.ts:28-45` (`sendCommand`) | Envia `Idempotency-Key`; só aceita **202** | Passa a enviar `Authorization: Bearer`. As respostas da Identity (201/200, D-12) não cabem em `sendCommand`: precisam de função própria no mesmo arquivo |
| `apps/web/src/api/http.ts:50-62` (`getJson`) | 401/403 viram `ApiError` | Envia Bearer; refresh único em 401 e repete (D-16) |
| Chamadas HTTP | Todas passam por `http.ts` (`catalog-organizer.ts`, `catalog-public.ts`, `diagnostics.ts`, `lib/read-your-writes.ts`) | Um ponto só para o token. O polling de `min_version` (`read-your-writes.ts`) herda o refresh |
| `apps/web/src/api/mutation-retry.ts:5-10` | Retry só em rede/5xx | 401/403 não sofrem retry: correto, não muda |
| `apps/web/src/api/query-keys.ts:4-7` | Chaves `['catalog','organizer',...]` sem usuário | Cache de outro usuário sobreviveria a logout/login. **Decisão do planner:** `queryClient.clear()` no logout e na troca de usuário. *Por quê:* mais simples que pôr o `sub` em toda chave, e o cache público se refaz barato |
| `apps/web/src/app/router.tsx:24-32` | `/produtor/*` com `OrganizerLayout` | Guard de rota em volta de `OrganizerLayout`; novas rotas de login e cadastro (D-16) |
| `apps/web/src/app/root-layout.tsx:6-18` | Header com links fixos para `/produtor/eventos` e `/diagnostico` | Onde entra o estado de login |
| `apps/web/src/app/organizer-layout.tsx:7-18` | Navegação da área do produtor | Sem mudança além de ficar atrás do guard |

Armazenamento do token: D-5 (memória + cookie `httpOnly`) não colide com nada existente. O Zustand só tem `stores/diagnostics-store.ts` e o token não vai para lá (ADR 0008).

### 5. libs/contracts, Kafka e outbox

O Research oficial decide que a Identity não publica eventos na Fase 3 (D-1). Se um dia publicar, o caminho mecânico é este:

1. `OutboxWriter.append(boundedContext, envelopes)` (`apps/write-service/src/shared/outbox/outbox-writer.ts:11`) com `'identity'`, na mesma transação.
2. O EventRouter roteia por `bounded_context` para `${routedByValue}.events` (`infra/debezium/register-connector.sh:46-47`), então `identity.events` sai sem mexer no conector.
3. **Obrigatório** criar o tópico em `infra/kafka/create-topics.sh:7-11`, porque `KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'` (`docker-compose.yaml:86`).
4. Contratos em `libs/contracts/src/identity/{constants,events}.ts` + export em `src/index.ts`, no padrão de `catalog/constants.ts:1-2` (`BOUNDED_CONTEXT_*`, `*_TOPIC`) e `events/envelope.ts:18-35`.
5. Projector só se houver read model: entrada em `TOPIC_REGISTRY` (`apps/projector/src/projection/topic-registry.ts:9-12`); o consumer assina exatamente as chaves dele (`kafka-consumer.service.ts:29`).

Os tópicos têm `retention.ms=-1` (`create-topics.sh:8,11`): o que entra fica para sempre e é relido em todo replay. CPF, e-mail e hash de senha nunca podem ir para payload de evento. É mais um argumento a favor de D-1.

**Contratos HTTP:** `catalogRoutes`/`CATALOG_ROUTE_TEMPLATES` (`libs/contracts/src/catalog/constants.ts:107-153`) não mudam. Mudam só `COMMAND_ERROR_CODES` (seção 3) e entram os contratos da Identity (Research oficial).

### 6. Testes, E2E e seed

29 arquivos de teste citam organizer/seed. Pontos estruturais:

| Ponto | Estado | Impacto |
|---|---|---|
| `apps/write-service/test/integration/setup.ts:22-30` | `createTestApp` monta `AppModule` | Herda o guard global: precisa de par de chaves efêmero no env do teste e helper `authHeader(sub, roles)` |
| `apps/write-service/test/integration/catalog/helpers.ts:16,29-37` | `SEED_ORGANIZER_ID` fixo; `send()` só põe `Idempotency-Key` | `send()` ganha o Bearer do produtor padrão; um segundo produtor para os testes de posse |
| `apps/read-service/test/integration/catalog-setup.ts:35-44` | Monta `CatalogModule` **direto, sem `AppModule`**, e faz `overrideProvider(SEED_ORGANIZER_ID)` | Sem importar o `AuthModule`, o guard não existe nesse teste e as rotas ficam abertas sem ninguém notar (L-3). Troca o override pelo `AuthModule` com chave de teste |
| `apps/write-service/src/shared/actor/current-organizer.spec.ts` | Testa o seed | Removido |
| `e2e/src/support/http.ts:15-39` (`api()`) | Sem auth | Ganha opção `token` |
| `e2e/src/support/catalog.ts:22-78` | Commands e leituras do produtor via `api()` | Logam como o produtor seed (D-14) |
| `e2e/src/seed/catalog-seed.ts:204,315` | Lê `organizerEvents` e cria dados anonimamente | Faz login antes (D-14) |
| `e2e/src/replay/replay.ts:15` | Zera `READ_STORE_COLLECTION_NAMES` | Sem mudança (a Identity não tem read model) |
| `e2e/src/api/{commands,queries,idempotency,stack}.e2e.test.ts` | Diagnostics anônimo | Sem mudança se diagnostics ficar público (L-4) |
| `apps/web/e2e/catalog-organizer.spec.ts:19,41` | `page.goto('/produtor/...')` direto | Login antes de navegar |
| `apps/web/src/test/fake-api.ts`, `src/test/render.tsx` e testes de páginas do produtor (`pages/organizer/*.test.tsx`, `app/router.test.tsx`) | Renderizam a área do produtor sem sessão | Precisam de sessão fake (rotas da Identity no fake-api + usuário logado no render) |

## Lacunas no Research oficial (decisões do planner desta área)

- **L-1 Idempotência por usuário.** O escopo hoje é só o template da rota (`events.controller.ts:66-69`; PK `(key, scope)` em `idempotency-key.entity.ts:6-10`). Com vários usuários, a mesma chave e o mesmo corpo vindos de outro usuário devolveriam a resposta guardada do primeiro, e o command do segundo não executaria. **Decisão do planner:** em rota autenticada, o `scope` vira `${actorId} ${template}`. *Por quê:* cada usuário ganha um espaço próprio de chaves, sem migration (`scope` é `text`). Rotas anônimas, como o cadastro, mantêm o template puro.
- **L-2 Posse centralizada em `require.ts`.** É compatível com D-8: os helpers chamam `assertOwnedBy(actorId)` do agregado e convertem o erro em `AggregateNotFoundError`. *Por quê:* 11 handlers já passam por ali, e assim nenhum handler esquece a checagem.
- **L-3 Guard em `AuthModule` com `APP_GUARD`**, importado pelo `AppModule` e pelos setups de teste. *Por quê:* o setup do read-service não usa `AppModule` (`catalog-setup.ts:36`).
- **L-4 Diagnostics continua público** (write e read). *Por quê:* é ferramenta do walking skeleton, sem dado de usuário, e quatro suítes E2E dependem dele anônimo.
- **L-5 Códigos `UNAUTHENTICATED` e `FORBIDDEN`** em `COMMAND_ERROR_CODES`, no formato de `DomainErrorResponseSchema` (seção 3).
- **L-6 `queryClient.clear()`** no logout e na troca de usuário (seção 4).

Nenhuma lacuna contradiz uma decisão D-n do Research oficial.

## Riscos

- **R-I-1 Rota protegida aberta em teste:** um setup que não importa o `AuthModule` testa a rota sem o guard (L-3). Mitigação: teste de integração que espera 401 sem token em cada controller protegido.
- **R-I-2 Handler sem posse:** um command novo que carregue o agregado fora de `require.ts`. Mitigação: L-2, mais um teste de posse por command (outro produtor recebe 404).
- **R-I-3 Arquivos compartilhados entre trilhas:** `shared.module.ts`, `app.module.ts` (dos dois serviços), `libs/contracts/src/index.ts`, `http/errors.ts`, os dois `nginx.*.conf`, os dois compose, `web/src/api/http.ts`, `router.tsx`, `test/render.tsx`, `test/fake-api.ts`, `e2e/src/support/http.ts`. O Plan precisa de dono único ou de onda anterior para cada um (napkin, linha 46).
- **R-I-4 Lentidão no E2E:** um login por teste, com scrypt de cerca de 16 MiB (D-3). Mitigação: login uma vez por suíte, reaproveitando o token de 15 min.

## Open Questions

Nenhuma. Os pontos de negócio desta área já estão decididos: posse e "local do mesmo produtor" no Catalog (RN-2, OQ-6, OQ-10), vitrine pública (Catalog OQ-4) e produtor seed mantido (D-14). O resto é técnico e foi decidido acima.
