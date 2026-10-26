---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-25
status: draft
---

# Catalog — Research

Research oficial da Fase 2, consolidado a partir de quatro pesquisas parciais feitas em paralelo:

- `SDD/WORK/2026-10-25-CatalogResearch-Dominio.md` (regras de negócio e modelo de domínio; 54 OQs)
- `SDD/WORK/2026-10-25-CatalogResearch-Backend.md` (write-service, `libs/contracts`, tópico e conector; 19 OQs)
- `SDD/WORK/2026-10-25-CatalogResearch-ReadSide.md` (projector, read-service, MongoDB, gateway, replay; 17 OQs)
- `SDD/WORK/2026-10-25-CatalogResearch-Frontend.md` (`apps/web`; 24 OQs)

As 114 dúvidas das parciais foram deduplicadas e renumeradas como **OQ-1 a OQ-97**. Cada OQ cita entre parênteses as OQs de origem (ex.: `Dominio-30` = `OQ-Dominio-30` da parcial de Domínio). Onde as áreas recomendaram coisas diferentes, a divergência está registrada dentro da OQ e não foi decidida aqui. Nenhuma OQ foi resolvida nesta consolidação.

## Objetivo

Entregar o primeiro bounded context real do Stubb: o **Catalog**. O produtor (usuário seed, sem Identity) cadastra local, evento, sessões, setores e lotes; o write-service grava no PostgreSQL e emite eventos de domínio pela outbox; o projector monta documentos desnormalizados no MongoDB; o read-service serve a vitrine e a página do evento; o web mostra tudo isso (`docs/roadmap.md:13`).

Conceitos de CQRS exercitados:

- **Primeiro fluxo real command → evento de domínio → projeção.** O Ping da Fase 1 provou o encanamento com um agregado de uma linha. O Catalog obriga a decidir agregado com entidades filhas e versão única, eventos com significado de negócio e contratos públicos que o Inventory (Fase 4) e o Ordering (Fase 5) vão consumir (ADR 0006, `docs/architecture/adr/0006-event-sourcing-ordering.md:22`).
- **Write model normalizado, read model desnormalizado por tela.** O write side guarda Local, Evento, Sessão, Setor e Lote como o domínio pede; a vitrine (`event_listing`, `docs/architecture/overview.md:97`) quer um documento pronto com nome do evento, cidade, próxima data e "a partir de R$ X"; a página do evento quer a árvore sessão → setor → lote (ADR 0005:11).
- **Invariantes no agregado.** Regras como "só publica com sessão, setor e lote" (OQ-44) definem a fronteira do agregado (OQ-60).
- **Consistência eventual entre agregados.** A ordem no Kafka só vale por agregado (regra 5, ADR 0004:20). Um documento que junta dados de agregados diferentes precisa tolerar chegada fora de ordem (OQ-62, OQ-67).
- **O tempo não é um command.** "Lote vigente", "vendas abertas", "sessão passada" e "evento encerrado" mudam com o relógio, sem evento. Não podem ser congelados pela projeção sem quebrar o replay (OQ-70).
- **Read-your-writes num fluxo de negócio.** O `min_version` sai do diagnóstico e entra no formulário do produtor, agora com documentos compostos (OQ-68).

## Escopo

**Dentro:**
- Domínio do Catalog: entidades Evento, Local, Sessão, Setor (assento marcado e pista), Lote; campos, validações, limites, ciclo de vida e regras de edição, conforme as respostas das OQs de negócio.
- Write-service: módulo `catalog` (commands, handlers, agregados, repositórios Data Mapper, entities TypeORM, controller HTTP), migration, produtor seed, erros de regra de negócio.
- Generalização do que hoje está preso ao `diagnostics` no write-service (outbox, providers compartilhados), no projector (schema, sequência, dispatcher), no read-service (espera do `min_version`), no web (cliente HTTP, retry, read-your-writes) e no E2E (replay).
- `libs/contracts`: constantes, schemas Zod de request, eventos `V1`, views de leitura e, conforme OQ-82, schemas de erro do Catalog; `CommandAcceptedSchema` fora de `diagnostics/`.
- Infra: tópico `catalog.events`; coleções e índices do MongoDB (local conforme OQ-86).
- Projector: consumo de `catalog.events`, documentos `event_listing` e, se aprovados, `event_detail` e read models do produtor; coleções auxiliares (lookup de locais, versões por agregado) conforme OQ-62 e OQ-67.
- Read-service: `ListEvents` (vitrine), `GetEvent` (página do evento) com `min_version`, e leituras do produtor se aprovadas (OQ-4, OQ-69).
- Web: vitrine, página do evento, área do produtor (se OQ-1 confirmar), layout global, página 404, formatação pt-BR de data e moeda, acessibilidade.
- Testes: unitários, integração, E2E de API, replay e Playwright do Catalog; diagnóstico continua funcionando como smoke test.
- Dados de demonstração, se OQ-8 confirmar.

**Fora:**
- Disponibilidade, hold, contagem de vendidos, "esgotado", mapa de assentos ao vivo, `session_seat_map`, `sector_availability`, SSE: Inventory, Fase 4 (`docs/roadmap.md:15`, `docs/architecture/overview.md:54`, `:98-99`).
- Meia-entrada, cota legal, taxa de conveniência, limite por CPF, pedido, pagamento, botão de compra funcional: Fase 5 (`docs/roadmap.md:16`). A OQ-42 confirma se nenhum campo disso entra agora.
- Reembolso e efeitos de cancelamento sobre compradores; `organizer_sales`: Fase 7 (`docs/roadmap.md:18`).
- Cadastro, login, JWT, papéis, proteção de rotas: Identity, Fase 3 (`docs/roadmap.md:14`).
- Cache HTTP, rate limit e fila no Nginx; Redis: Fase 9.
- MongoDB Search (`mongot`): fora (OQ-71).
- Upload de arquivos (salvo decisão contrária na OQ-25).
- Internacionalização além de pt-BR.
- Consumo de Kafka pelo write-service (sagas): Fase 5.

## Mapeamento da codebase

Não existe código do Catalog. O write-service tem os módulos `diagnostics`, `health`, `database` e `shared` (`apps/write-service/src/`); o único agregado é o `Ping` do walking skeleton. Os arquivos de compose foram movidos de `infra/` para a raiz (`docker-compose.yaml`, `docker-compose.override.yaml`); a mudança está no working tree e ainda não foi commitada (`git status`), e as referências abaixo usam a raiz.

### Write-service (`apps/write-service`)

| Onde | O que é | Relevância para o Catalog |
|---|---|---|
| `src/app.module.ts:12-15` | `CqrsModule.forRoot()`, `ScheduleModule.forRoot()`, `TypeOrmModule.forRootAsync`, `DiagnosticsModule` | `CatalogModule` entra nos `imports`; o `@nestjs/cqrs` descobre handlers registrados como provider em qualquer módulo |
| `src/diagnostics/diagnostics.module.ts:16-26` | Registra `PingEntity`, `OutboxEntity`, `IdempotencyKeyEntity` e, como providers, **também os compartilhados**: `OutboxWriter`, `TransactionContext`, `IdempotencyService`, `IdempotencyCleanupJob` | Não serve para um segundo contexto: registrar de novo cria segunda instância e um segundo cron `idempotency-cleanup`, que o `SchedulerRegistry` rejeita (R-3, OQ-77) |
| `src/diagnostics/application/create-ping.command.ts:4` | `extends Command<CommandAccepted>` | Mesmo padrão |
| `src/diagnostics/application/create-ping.handler.ts:12-17` | ID `v7()` gerado na aplicação; `repository.insert`; devolve `{ id, version: 1 }` | Mesmo padrão |
| `src/diagnostics/application/increment-ping.handler.ts:12-17` | Carrega, guarda `expected = ping.version`, muta, `update(ping, expected)`; inexistente → `AggregateNotFoundError` | Versão esperada vem do servidor, não do cliente (OQ-64) |
| `src/diagnostics/domain/ping.aggregate.ts:14-61` (`:13`, `:38-42`, `:55-60`) | Agregado state-stored sobre `AggregateRoot`; `apply()` só acumula (sem `commit()`); cada mutação faz `version += 1` e aplica um evento com a nova versão | Padrão a seguir: regra no agregado, um evento por mutação, uma versão por evento; outbox é do repositório (regra 3) |
| `src/diagnostics/domain/ping.events.ts:3-21` | Eventos de domínio internos (`IEvent`) com `aggregateVersion` e `occurredAt` | Distintos dos schemas públicos de `libs/contracts` |
| `src/diagnostics/infrastructure/ping.repository.ts:21-32`, `:35-46` | `insert` grava linha + `outbox.append(getUncommittedEvents())` + `uncommit()`; `update` faz `UPDATE ... WHERE id AND version = :expected` e lança `ConcurrencyConflictError` se `affected !== 1` | Precisa ser estendido para entidades filhas (OQ-63, OQ-72) |
| `src/diagnostics/infrastructure/ping.entity.ts:3` | Tabela `diagnostics_pings` (convenção `{contexto}_{tabela}`, snake_case) | Convenção a confirmar na OQ-72 |
| `src/diagnostics/http/pings.controller.ts:20-61` | `@Controller('diagnostics/pings')` + prefixo `api` (`src/main.ts:8`); `@HttpCode(202)`; `@IdempotencyKey()`; `ZodValidationPipe`; `idempotency.execute({ key, scope: template da rota, requestHash })` | Mesmo padrão para os controllers do Catalog |
| `src/shared/outbox/outbox-writer.ts:22-65` | `append(events: readonly PingDomainEvent[])` (`:22`), `boundedContext: BOUNDED_CONTEXT_DIAGNOSTICS` fixo (`:27`), `toEnvelope` por `instanceof` das classes do Ping (`:39-65`); valida com o schema `V1` antes de inserir (`:51`, `:58`) | **Preso ao Ping** (R-2, OQ-77) |
| `src/shared/outbox/outbox.entity.ts:3-35` | Entity da `outbox` | Reaproveitável |
| `src/database/migrations/1792869381065-InitialSchema.ts:7-18` (`:17`) | Tabela `outbox` com `bounded_context` como roteador de tópico | Eventos do Catalog saem com `bounded_context = 'catalog'` (decisão OQ-18 da Fase 1) |
| `src/shared/transaction/transaction-context.ts:12-20` | `AsyncLocalStorage<EntityManager>`; `run()` abre a transação | Reaproveitável |
| `src/shared/idempotency/idempotency.service.ts:12-54` | Reserva a chave, executa e grava a resposta na mesma transação; reuso com hash diferente → 422; grava `response_status = 202` fixo (`:50`) | Reaproveitável; o 202 fixo só muda se algum command do Catalog responder com outro status (OQ-80) |
| `src/shared/idempotency/idempotency-key.decorator.ts:5-11` | Header obrigatório, UUID, senão 400 | Reaproveitável |
| `src/shared/idempotency/idempotency-cleanup.job.ts:11` | `@Cron(EVERY_HOUR, { name: 'idempotency-cleanup' })` | Só pode existir uma instância |
| `src/shared/idempotency/request-hash.ts:3-5` | SHA-256 de `{ method, path, body }` | Reaproveitável |
| `src/shared/errors.ts:1-20`, `src/shared/http/domain-error.filter.ts:9-22` | Só `ConcurrencyConflictError` → 409, `AggregateNotFoundError` → 404, `IdempotencyKeyMismatchError` → 422; corpo `{ statusCode, message, error }` | Não há erro de regra de negócio com código estável (OQ-82) |
| `src/shared/http/zod-validation.pipe.ts:7-18` (`:11-17`) | 400 `{ message: 'Validation failed', issues: [{ path, message }] }`; sem schema em `libs/contracts` | Contrato de erro (OQ-82) |
| `src/database/data-source.ts:12`, `:20` | Lista explícita de entities | Adicionar as do Catalog |
| `src/database/migrations/index.ts:3`, `src/database/migrate.ts:6`, `package.json:16` | Lista explícita de migrations; `migration:generate` sobre o `dist/`; one-shot `db-migrate` com `transaction: 'each'` | Nova migration; `nest build` antes de gerar (napkin, 2026-10-24) |
| `src/config.ts:3-6` | Zod sobre `process.env` com defaults | Candidato a guardar o ID do produtor seed (OQ-73) |
| `test/integration/setup.ts:22-40` (`:39`) | App Nest real contra Postgres de teste (porta 55432); `truncateAll` com lista fixa de tabelas | Incluir tabelas do Catalog |
| `test/unit/architecture.spec.ts:6-16` | Proíbe `mongodb`/`mongoose` no write-service | Manter (regra 1) |

### Contratos (`libs/contracts`)

| Onde | O que é | Relevância |
|---|---|---|
| `src/events/envelope.ts:4-21` | `createEventEnvelopeSchema(eventType, aggregateType, payload)`; `schemaVersion: z.literal(1)` (`:12`); `aggregateId` uuid (`:14`); `aggregateVersion >= 1`; `occurredAt` ISO; `correlationId`/`causationId` nulos | Serve para os eventos `V1` do Catalog sem mudança; `aggregateType` depende da OQ-60 |
| `src/diagnostics/events.ts:6-21` (`:18-21`) | Um schema por evento e versão; `DiagnosticsEventSchema` (união discriminada por `eventType`) | O projector precisa de uma `CatalogEventSchema` equivalente |
| `src/diagnostics/constants.ts:1-17` (`:2`, `:7-11`) | Bounded context, tópico, aggregate type, nomes de evento, rotas e `DIAGNOSTICS_ROUTE_TEMPLATES` | Padrão para `CATALOG_TOPIC`, `catalogRoutes` (OQ-79) |
| `src/diagnostics/http.ts:13` | **`CommandAcceptedSchema` mora em `diagnostics/`**, mas é o contrato genérico de qualquer command (regra 2) | Mover para módulo compartilhado (R-4, OQ-79) |
| `src/diagnostics/http.ts:15-33`, `:35-36` | View + resposta com `minVersionReached` + 404; exporta `z.output` (request) e `z.input` (form) do mesmo schema | Padrão para as views do Catalog e para os forms |
| `src/shared/schemas.ts:3-5` | `uuidSchema`, `idempotencyKeySchema`, `minVersionSchema` | Não há schema de dinheiro, data/hora com fuso, UF ou texto com trim; as validações decididas viram schemas Zod compartilhados com o web (decisão OQ-5 da Fase 1) |
| `src/http/constants.ts:1-2` | `IDEMPOTENCY_KEY_HEADER`, `MIN_VERSION_QUERY_PARAM` | Reaproveitáveis |
| `src/index.ts:1-6` | Barrel com `export *` | Nomes do Catalog não podem colidir entre si nem com os do diagnóstico |
| `package.json:8-13` | O web importa o `dist/` compilado | Rodar o build do contrato antes de typecheck/test (R-33) |
| `docker-compose.override.yaml:28-29`, `:54-55`, `:80-81`, `:106-113` | Mudança em `libs/contracts/src` dispara `rebuild` dos apps no dev | Sem ação |

### Caminho do evento até o Kafka e gateway

| Onde | O que é | Relevância |
|---|---|---|
| `infra/debezium/register-connector.sh:33`, `:42`, `:44-45`, `:48` | `table.include.list = public.outbox`; key = `aggregate_id`; `route.by.field = bounded_context`, `route.topic.replacement = ${routedByValue}.events`; `eventId`/`eventType` em headers | Um evento com `bounded_context = 'catalog'` vai para `catalog.events` **sem mudar o conector** |
| `infra/kafka/create-topics.sh:7-10` | Só cria `diagnostics.events` (3 partições, `retention.ms=-1`) | **`catalog.events` não existe** (R-1, OQ-78) |
| `docker-compose.yaml:76` | `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false` | Sem o tópico, a task do Debezium falha |
| `docker-compose.yaml:206-232` (`:211`, `:222`), `:183-204` (`:194`) | projector depende de `kafka-init` e `mongo-init`, com `restart: unless-stopped`; read-service depende de `mongo-init` | Ordem de subida já cobre tópico e coleções se os scripts forem atualizados; `restart` + `exit(1)` = crash loop em erro persistente (R-7) |
| `infra/nginx/nginx.prod.conf:3`, `:7-14`, `:15-18`; `infra/nginx/nginx.dev.conf:3`, `:16-22` | `map $request_method`: GET/HEAD → read-service, resto → write-service; `proxy_read_timeout 15s`; fallback SPA `try_files ... /index.html`; no dev, fora de `/api/` vai para o Vite | Queries GET e commands não-GET do Catalog funcionam sem mudar o gateway; deep link da página do evento funciona. Uma busca via POST exigiria exceção por prefixo (ADR 0002:22, `docs/architecture/overview.md:29`) |
| `infra/mongo/init-replica-set.js:21-27` | Cria `pings` e `processed_events`; nenhum índice | Candidato para coleções e índices do Catalog (OQ-86) |

### Projector (`apps/projector`)

| Onde | O que faz | Impacto |
|---|---|---|
| `src/kafka/kafka-consumer.service.ts:29` | `subscribe([DIAGNOSTICS_TOPIC])` | Assinar `catalog.events` (OQ-83) |
| `src/kafka/kafka-consumer.service.ts:35` | `DiagnosticsEventSchema.parse` em toda mensagem | **Preso ao diagnóstico**: um evento do Catalog seria schema inválido → `exit(1)` (R-5) |
| `src/kafka/kafka-consumer.service.ts:36-38`, `:39-46` (`:45`) | `dispatch` e só depois `commit`; qualquer erro: loga, não commita e `exit(1)` | Reaproveitável; erro "esperado" de ordem entre agregados viraria crash loop (R-7) |
| `src/kafka/confluent-event-consumer.ts:12-14`, `:25-42`, `:45-53` | Grupo `projector`, `fromBeginning: true`, `autoCommit: false`; `eachMessage` serial com `topic` na `ConsumedMessage`; commit de `offset + 1` | Base para roteamento por tópico; tópico novo começa do início no grupo existente |
| `src/kafka/event-consumer.ts:10-16` | Interface `EventConsumer`; `subscribe(topics: string[])` | Já aceita vários tópicos |
| `src/projection/event-dispatcher.ts:5-9` | Mapa `eventType → handler` tipado pela union `DiagnosticsEvent` | Virar registro por contexto |
| `src/projection/ping.projection.ts:38-40`, `:41-53` | Uma transação Mongo por evento; dedupe em `processed_events` (`_id = eventId`) | Padrão a manter; dedupe independe do read model |
| `src/projection/ping.projection.ts:55-72`, `:88-106` | Sequência lê o `version` do **próprio documento**; `updateOne` condicionado a `version = aggregateVersion - 1` | Não serve para documento composto (R-6, OQ-67) |
| `src/projection/ping.projection.ts:74` | Datas do documento vêm de `occurredAt` | Regra de determinismo para o replay |
| `src/projection/sequence.ts:4-14` (`:8-14`, `:11`) | `decideProjection` puro, com `PingIncremented` fixo no código | **Um agregado por documento**; generalizar (R-6, OQ-67, OQ-84) |
| `src/projection/projection-gap.error.ts:1-13` | Erro de lacuna | Reaproveitável |
| `src/mongo/mongo.module.ts:11-16`, `src/config.ts:1-8` | `MongoClient`/`Db` globais; config por env | Reaproveitáveis |
| `src/app.module.ts:7-9` | Sem `@nestjs/cqrs` (decisão OQ-27 da Fase 1) | Manter |
| `test/integration/ping-projection.int.test.ts:9`, `:55-60` | Integração com Mongo real (porta 58017), cria coleções antes | Modelo para os testes do Catalog |
| `test/unit/architecture.spec.ts:5-10` | Proíbe `pg`/`typeorm` | Manter |

### Read-service (`apps/read-service`)

| Onde | O que faz | Impacto |
|---|---|---|
| `src/main.ts:8`; `src/app.module.ts:8` | Prefixo `api` (exceto `health`); `CqrsModule` + `MongoModule` + `DiagnosticsModule` | `CatalogModule` entra aqui |
| `src/diagnostics/pings.controller.ts:12-34` | Controller fino: `ZodPipe`, `QueryBus`, 404 com `minVersionReached: false` | Padrão para `ListEvents`/`GetEvent` |
| `src/diagnostics/get-ping.handler.ts:6-7`, `:15-31` | `min_version`: polling de 100 ms até 3 s **dentro do handler**; no timeout devolve o estado atual com `minVersionReached: false` | Extrair helper comum (R-4) |
| `src/diagnostics/get-ping.query.ts:4-5`; `src/diagnostics/ping-read.repository.ts:19-30` | Resultado `found`/`not found`; repositório mapeia documento → view (Date → ISO) | Padrões a copiar |
| `src/common/zod-pipe.ts:5-23`; `src/mongo/mongo.module.ts:26-45` | 400 com `issues`; `MongoModule.forRoot(options?)` | Reaproveitáveis |
| `test/integration/get-ping.int.test.ts:12`, `:27-42`; `test/unit/architecture.spec.ts:5-10` | Integração com Mongo semeado (porta 58018); fronteira sem write store | Modelo de teste; manter |

### Web (`apps/web`)

| Onde | Papel hoje | Impacto |
|---|---|---|
| `src/main.tsx:9-15` | `StrictMode` + `QueryClientProvider` + `RouterProvider` | Mantém |
| `src/app/router.tsx:4` | `createBrowserRouter` com **uma rota: `/` → `DiagnosticsPage`** | **Rota `/` ocupada pelo diagnóstico** (R-11, OQ-88); falta layout, `errorElement`, 404; arquivo compartilhado entre trilhas |
| `src/app/query-client.ts:3` | `new QueryClient()` sem `defaultOptions` | Avaliar defaults de retry ao criar as queries do Catalog |
| `src/api/diagnostics.ts:11-19`, `:21-42` (`:40`), `:58-68`, `:70-87` (`:77`) | `ApiError`, `readBody`, `postCommand` (exige 202, valida com `CommandAcceptedSchema`), `getPing` com `min_version`, `describeCommandError` (mensagem "Ping não encontrado") | **Código genérico preso no módulo de diagnóstico** (R-4, OQ-91); só POST |
| `src/features/diagnostics/mutation-retry.ts:5-12` | Retry só em rede/5xx, até 2 vezes, 500 ms, mesma chave | Genérico (OQ-91) |
| `src/features/diagnostics/use-ping.ts:4-21` (`:12`, `:13-18`) | `minVersion` na `queryKey`, `keepPreviousData`, `refetchInterval` 250 ms **sem limite** | Base do hook genérico de read-your-writes; limite na OQ-97 |
| `src/features/diagnostics/ping-panel.tsx:24-45` (`:43`) | Detecta versão alcançada; semeia o cache da chave sem `min_version` | Mesmo cuidado ao navegar do form para o item criado |
| `src/pages/diagnostics-page.tsx:13-15` | Estado "pendente" e erro em `useState` local | Padrão: estado transitório de UI é local |
| `src/features/diagnostics/create-ping-form.tsx:27-30`, `:34-36` (`:36`), `:48`, `:61-65` | `useForm` + `zodResolver(schema do contrato)`; uma `Idempotency-Key` por submit; `noValidate`; erro com `role="alert"` | Padrão dos forms; ciclo da chave na OQ-92 |
| `src/stores/diagnostics-store.ts:18-24` | Zustand com `selectedPingId` e latências | Catalog não precisa de Zustand salvo wizard (OQ-3) |
| `src/test/render.tsx:5-21`; `src/test/setup.ts:1-5` | `createTestQueryClient`, `renderWithClient`, `jsonResponse`; `afterEach(cleanup)` | **Sem wrapper de router**: criar helper com `createMemoryRouter` |
| `src/pages/diagnostics-page.test.tsx:12-57` | Servidor falso com `vi.stubGlobal('fetch')` e projeção atrasada | Padrão de teste (OQ-94) |
| `e2e/diagnostics.spec.ts:4`; `playwright.config.ts:7` | Playwright abre `/` esperando o diagnóstico; `baseURL: 'http://localhost:8080'` | Quebra se a vitrine ocupar `/`; `localhost` → `::1` no Windows (R-34, OQ-95) |
| `vite.config.ts:8-9`; `vitest.config.ts:7-12`; `index.html:2` | Alias `@`; HMR pela 8080; jsdom; `lang="pt-BR"` | Mantém |
| `components.json:4`, `:16-20`; `src/components/ui/` | shadcn `radix-nova`; só `button`, `card`, `input`, `label` | Faltam componentes de form, lista e estado (OQ-93) |
| `package.json:13-30` | React 19.3.1, React Router 8.5.0, TanStack Query 5.104.5, Zustand 5.0.16, RHF 7.91.0, `@hookform/resolvers` 6.0.0, Zod 4.6.7 | Nada de data/hora, máscara de moeda ou MSW |
| `eslint.config.js:15`, `:33-38` | `components/ui/**` fora do lint; regras do React Compiler | `Date.now()` no render reprova em `react-hooks/purity` (napkin); usar `src/lib/clock.ts` |

Documentação atual consultada pela parcial Frontend (2026-10-25): shadcn/ui com RHF + Zod usa `Field`, `FieldLabel`, `FieldError` etc., `data-invalid`/`aria-invalid`, `useFieldArray` para listas dinâmicas; React Router 8.5 em data mode oferece `loader`/`action`/`errorElement`; TanStack Query v5 pagina com página/cursor na `queryKey` + `keepPreviousData`.

### E2E e replay (`e2e/`)

| Onde | O que faz | Impacto |
|---|---|---|
| `src/replay/replay.ts:4`, `:13-16`, `:21-35` | Grupo `projector` fixo; `deleteMany` só em `pings` e `processed_events`; reseta offsets só de `diagnostics.events` | **Replay amarrado ao Ping** (R-9, OQ-85) |
| `src/replay/replay.e2e.test.ts:22-35` (`:34`) | Lê com `min_version`, faz replay e compara com `toEqual` | Exige documento determinístico |
| `src/api/queries.e2e.test.ts:14-29`, `:41-52` | `min_version` via gateway; roteamento GET/POST/`/` | Padrão para vitrine e página |
| `src/support/http.ts:14-17` | Helper `api` só com GET e POST | Cresce se houver PATCH/DELETE (R-38) |
| `src/support/env.ts:3` | `E2E_BASE_URL` padrão `http://localhost:8080` | Mesmo problema de `localhost` (R-34) |
| `package.json:7` | `test:e2e` roda `src/api` e depois `src/replay` | Novos testes nas mesmas pastas |

### Documentação de domínio e arquitetura

| Onde | Conteúdo |
|---|---|
| `docs/domain/glossary.md:7` | Evento: o espetáculo; tem uma ou mais sessões; não confundir com evento de domínio |
| `docs/domain/glossary.md:9` | Local: lugar físico **com sua planta de setores** |
| `docs/domain/glossary.md:10` | Sessão: ocorrência do evento em data e horário específicos |
| `docs/domain/glossary.md:11` | Setor: área do local **para uma sessão**; assento marcado ou pista |
| `docs/domain/glossary.md:12-13` | Assento numerado em setor marcado; pista vendida por quantidade |
| `docs/domain/glossary.md:14` | Lote: faixa de preço de um setor válida por período ou até esgotar |
| `docs/domain/glossary.md:22-24`, `:28` | Meia-entrada (50%, Lei 12.933/2013), taxa de conveniência, Produtor; valores e limites a confirmar no SDD |
| `docs/architecture/overview.md:11` | O read model serve para exibir; o write model é a verdade |
| `docs/architecture/overview.md:53-54` | Catalog: eventos, locais, sessões, setores, lotes e preços; "leve; quase CRUD". Inventory: disponibilidade e holds |
| `docs/architecture/overview.md:97-99` | `event_listing` (vitrine e busca), `session_seat_map`, `sector_availability`. Não existe `event_detail` |
| `docs/architecture/overview.md:104-116` (`:109`) | Regras candidatas, nenhuma confirmada, incluindo "virada de lote por data ou por esgotamento" |
| ADR 0004:11, :20 | Um tópico por contexto; ordem só por agregado |
| ADR 0005:11 | Página do evento com sessões e setores embutidos |
| ADR 0007:11, :19-20 | Assento marcado e pista a partir da Fase 4; dois modelos de concorrência |
| ADR 0009:40-41, :43, :48, :63-64, :68 | Dedupe/sequência, `min_version`, replay, E2E/Playwright, padrão herdado, diagnóstico como smoke test, lacuna derruba o processo |
| `SDD/RESEARCH/2026-10-24-SkeletonResearch.md:519` | Decisão OQ-42 da Fase 1 (texto com trim, 1 a 50): precedente de **estilo** de validação, não regra do Catalog |

**Tensões nas fontes:** (1) `docs/domain/glossary.md:9` põe a planta de setores no Local e `:11` define Setor como área "para uma sessão"; as duas leituras levam a modelos diferentes (OQ-14). (2) `docs/roadmap.md:13` entrega lotes na Fase 2 e `:16` lista "lotes" de novo na Fase 5 (OQ-33).

Bibliotecas consultadas pelas parciais: [NestJS CQRS recipe](https://docs.nestjs.com/recipes/cqrs) (o projeto não chama `commit()`, ADR 0009, OQ-27 da Fase 1); [TypeORM 1.0 release notes](https://typeorm.io/docs/releases/1.0/release-notes/) (nada muda o padrão do skeleton); MongoDB 8.0.34 (`docker-compose.yaml:33`): índice de texto `$text` em português, um por coleção, sem prefixo; MongoDB Search na Community exige 8.2+ e `mongot`, em public preview.

## Regras de negócio identificadas

Somente o que já tem fonte. Tudo o mais está nas Open Questions.

| ID | Regra | Fonte |
|---|---|---|
| RC-1 | Um Evento tem uma ou mais Sessões (o que vale para rascunho está na OQ-31). | `docs/domain/glossary.md:7` |
| RC-2 | Uma Sessão é uma ocorrência do Evento em data e horário específicos. | `docs/domain/glossary.md:10` |
| RC-3 | Existem dois tipos de setor: assento marcado e pista. Os dois são suportados (a venda, a partir da Fase 4). | `docs/domain/glossary.md:11`, ADR 0007:11, `CLAUDE.md:37` |
| RC-4 | Em setor de assento marcado, cada assento é numerado e único; pista é vendida por quantidade. | `docs/domain/glossary.md:12-13`, ADR 0007:19 |
| RC-5 | Lote é uma faixa de preço **de um setor**, válida por período ou até esgotar. A semântica exata não está definida (OQ-33). | `docs/domain/glossary.md:14`, `docs/architecture/overview.md:109` (candidata) |
| RC-6 | O Catalog é dono de eventos, locais, sessões, setores, lotes e preços. | `docs/architecture/overview.md:53` |
| RC-7 | Disponibilidade e holds são do Inventory (Fase 4); o Catalog não decide disponibilidade. O agregado de inventário é por sessão + setor, então sessão e setor precisam de identidade estável que o Inventory consiga referenciar. | `docs/architecture/overview.md:54`, `CLAUDE.md:44`, `docs/roadmap.md:15` |
| RC-8 | Na Fase 2 o produtor é um usuário seed; não há Identity. | `docs/roadmap.md:13-14` |
| RC-9 | Meia-entrada, taxa de conveniência, limite por CPF, pedido e pagamento são da Fase 5. | `docs/roadmap.md:16` |
| RC-10 | Cancelamento com reembolso é da Fase 7. | `docs/roadmap.md:18` |
| RC-11 | Módulos só se comunicam por commands, queries e eventos públicos; tudo o que o Inventory precisar do Catalog chega por evento público. | `CLAUDE.md:50` |
| RC-12 | Os eventos do Catalog são contrato público versionado em `libs/contracts`, desenhado pensando em evolução. | `CLAUDE.md:56`, ADR 0006:22 |

**Restrições arquiteturais e técnicas já decididas** (não são regras de negócio, mas valem para o Catalog):

- O write-service nunca lê do MongoDB para decidir; toda validação (ex.: "o local existe", "a sessão tem lote") usa o PostgreSQL (regra 1, `CLAUDE.md:41`). O projector pode ler o próprio read store.
- Command devolve só ack, ID e versão; query nunca altera estado (regra 2). Na Fase 1, `202 { id, version }`.
- Evento gravado na `outbox` na mesma transação do agregado (regra 3); concorrência otimista por `version` (regra 4); partition key = ID do agregado (regra 5); projector idempotente e read model reconstruível por replay (regra 6); `min_version` (regra 7); `Idempotency-Key` em commands do cliente (regra 9); comunicação só por contratos públicos (regra 10).
- Padrão herdado do ADR 0009: agregado e entity separados, UPDATE condicional à mão, contrato Zod `V1`, ID uuid v7 gerado na aplicação, mesmo schema Zod no form e no write-service (OQ-5 da Fase 1).
- Web: dado da API vive só no TanStack Query, nunca no Zustand (ADR 0008; RN-15 da Fase 1); retry de mutation só em rede/5xx, até 2 vezes, 500 ms, mesma chave; read-your-writes com polling de 250 ms enquanto `minVersionReached === false` (ADR 0009, OQ-24 e OQ-25 da Fase 1).

## Impacto CQRS

Tudo abaixo é **candidato**: os nomes, a lista e os payloads dependem das OQs. As parciais usaram nomes diferentes para as mesmas operações; isso está na OQ-61.

### Modelo de domínio candidato (resultado das recomendações, não confirmado)

```
Organizer (seed, fora do Catalog: só um organizerId)
   │ 1..n
   ├── Venue (agregado)                 nome, cidade/UF, endereço, fuso
   │      └── SectorTemplate 1..n       nome, tipo (seated | general_admission),
   │             └── layout             capacidade (pista) ou filas × assentos (marcado)
   │
   └── Event (agregado)                 título, descrição, categoria, classificação, imagem, status
          └── Session 1..n              venueId, início, status
                 └── SessionSector 1..n cópia do SectorTemplate na criação da sessão, ativo/inativo
                        └── Batch 1..n  nome, ordem, preço (centavos BRL), quantidade?, período?
```

Pontos que mudam esse desenho: OQ-9 (Local é cadastro?), OQ-14 (onde vivem os setores), OQ-16 (cópia ou referência), OQ-18/19 (layout de assentos), OQ-28 (local por sessão), OQ-32 (lote por sessão), OQ-51 (estado por sessão), OQ-60 (fronteira de agregados).

| Tipo | Itens (candidatos) |
|---|---|
| Commands | Local: `CreateVenue` ou `RegisterVenue`, `UpdateVenueDetails`, comandos da planta (`AddVenueSector`/`UpdateVenueSector`/`RemoveVenueSector`). Evento: `CreateEvent` (nasce rascunho), `UpdateEventDetails`, `AddSession` ou `ScheduleSession`, `UpdateSession`, `RemoveSession`, `SetSessionSectorActive` ou `AddSector`, `AddBatch`, `UpdateBatch`, `RemoveBatch`, `PublishEvent`, `PublishSession` (se OQ-51 = B), `DiscardEvent` (se OQ-49 = A). Fora salvo decisão contrária: `CancelEvent`, `CancelSession`, `RescheduleSession`, `UnpublishEvent`. Todos com `Idempotency-Key`. Conjunto final: OQ-2, OQ-61 |
| Events | Passado dos commands acima (`VenueCreated`/`VenueRegistered`, `EventCreated`, `SessionAdded`/`SessionScheduled`, `BatchAdded`, `EventPublished` ...), todos `V1`, no envelope de `libs/contracts/src/events/envelope.ts:4-21`, com `bounded_context = 'catalog'`, publicados em `catalog.events` |
| Queries | `ListEvents` (vitrine: filtros, busca, ordenação, paginação), `GetEvent` (página do evento, com `min_version`). Se houver back-office (OQ-1, OQ-4): `ListOrganizerEvents`, `GetOrganizerEvent` (inclui rascunhos), `ListVenues`/`GetVenue`. Nenhuma query no write-service |
| Aggregates | Recomendação consensual das três áreas técnicas (OQ-60): `Venue` (com a planta) e `Event` (com sessões, setores da sessão e lotes como entidades filhas), versão única na raiz |
| Read models | `event_listing` (`docs/architecture/overview.md:97`); `event_detail` proposto (OQ-66); read models do produtor (OQ-69); auxiliares internos do projector: lookup de locais (OQ-62), `aggregate_versions` (OQ-67); `processed_events` (existente) |
| Sagas / process managers | Não se aplica na Fase 2: o Catalog não reage a eventos de outros contextos e o write-service não consome Kafka antes da Fase 5. Na Fase 4, eventos do Catalog (ex.: publicação de sessão) vão inicializar os agregados de inventário por sessão + setor; o contrato desenhado agora precisa carregar o que o Inventory vai precisar (capacidade da pista, layout dos assentos, identidade estável de sessão e setor) |

## Riscos

**Código preso ao diagnóstico (Fase 1 desenhada para um contexto só)**

- **R-1 Tópico `catalog.events` ausente.** Auto-create desligado (`docker-compose.yaml:76`) e `infra/kafka/create-topics.sh:7-10` só cria `diagnostics.events`. O primeiro evento do Catalog quebra a task do Debezium, e **todos** os eventos (inclusive os do diagnóstico) param, porque a outbox e o slot são únicos. Mitigação: OQ-78; E2E confere a mensagem no tópico.
- **R-2 `OutboxWriter` preso ao Ping.** Assinatura com `PingDomainEvent` (`outbox-writer.ts:22`), contexto fixo (`:27`) e `instanceof` das classes do Ping (`:39-65`). Mitigação: OQ-77.
- **R-3 Providers compartilhados dentro do `DiagnosticsModule`** (`diagnostics.module.ts:16-26`). Registrá-los de novo no Catalog cria instâncias duplicadas e um segundo cron com o mesmo nome. Mitigação: OQ-77.
- **R-4 Código genérico preso no módulo `diagnostics`.** `CommandAcceptedSchema` em `libs/contracts/src/diagnostics/http.ts:13`; no web, `ApiError`/`readBody`/`postCommand`/`describeCommandError` (`api/diagnostics.ts:11-87`), `mutation-retry.ts:5-12` e o polling de `use-ping.ts:4-21`; no read-service, a espera do `min_version` dentro de `get-ping.handler.ts:15-31`. Mitigação: OQ-79, OQ-91.
- **R-5 Projector preso ao `DiagnosticsEventSchema`** (`kafka-consumer.service.ts:29`, `:35`). Assinar `catalog.events` sem escolher o schema por tópico faz qualquer evento do Catalog falhar no parse e derrubar o processo. Mitigação: OQ-83.
- **R-6 `sequence.ts` assume um agregado por documento** (`sequence.ts:8-14`, `PingIncremented` fixo em `:11`; `ping.projection.ts:55-72`). Com vários agregados num documento, ou um agregado alimentando vários documentos, o controle atual dá falsos "já aplicado" ou falsas lacunas. Mitigação: OQ-67, OQ-84.
- **R-7 Crash loop do projector por ordem entre agregados.** Eventos de agregados diferentes caem em partições diferentes e chegam em qualquer ordem (ADR 0004:20). Se "referência ainda não projetada" for tratada como lacuna, o `exit(1)` (`kafka-consumer.service.ts:45`) + `restart: unless-stopped` (`docker-compose.yaml:211`) vira crash loop permanente. Mitigação: OQ-60, OQ-62.
- **R-8 `min_version` em documento composto.** O command devolve a versão do **seu** agregado (`http.ts:13`); se o documento junta vários agregados, um único `version` não serve nem para a sequência nem para o read-your-writes, e o front espera para sempre ou mostra dado velho. Mitigação: OQ-60, OQ-68.
- **R-9 Replay amarrado ao Ping e não determinístico.** `replay.ts:4`, `:13-16`, `:21-35` apaga só `pings`/`processed_events` e reseta só `diagnostics.events`. Além disso, arrays montados por ordem de chegada (ex.: `$push` de sessões de partições diferentes) saem em ordem diferente no replay e quebram o `toEqual` (`replay.e2e.test.ts:34`). Todo array precisa ser ordenado por chave estável e toda data vir de `occurredAt` (exceto `processedAt`, não comparado). Mitigação: OQ-85, OQ-87.
- **R-10 Estados que dependem do relógio calculados no lugar errado.** "Lote vigente", "vendas abertas", "sessão passada" e "evento encerrado" mudam sem evento. Se o projector gravá-los, ficam congelados e o replay dá resultado diferente conforme o dia em que roda. Precisam ser calculados na query (com o `now` do read-service) ou, se o usuário preferir, gravados por um scheduler do write-service, **nunca no projector**. No web, `Date.now()` no render reprova em `react-hooks/purity`. Mitigação: OQ-43, OQ-70.
- **R-11 Rota `/` ocupada pelo diagnóstico** (`apps/web/src/app/router.tsx:4`; `apps/web/e2e/diagnostics.spec.ts:4`). A vitrine em `/` quebra o Playwright do diagnóstico se ele não mudar de rota no mesmo passo. Mitigação: OQ-88.
- **R-12 Refatoração do compartilhado quebra o diagnóstico.** Mexer em `OutboxWriter`, providers, projector e helpers do web afeta o smoke test permanente (ADR 0009:64). Mitigação: refatoração isolada numa primeira etapa, validada com integração, E2E e replay do diagnóstico antes de qualquer código do Catalog.

**Domínio**

- **R-13 Ambiguidades nas fontes.** Glossário Local x Setor (`glossary.md:9` x `:11`) e lotes nas Fases 2 e 5 (`roadmap.md:13` x `:16`). Mitigação: OQ-14, OQ-33.
- **R-14 Lote "até esgotar" depende de vendas que ainda não existem.** O esgotamento é conhecido pelo Inventory/Ordering (Fases 4-5). Mitigação: OQ-33, OQ-34, OQ-37.
- **R-15 Fan-out da desnormalização.** Nome ou cidade do local dentro do `event_listing` exige `updateMany` em muitos documentos ao editar o local; com eventos fora de ordem, versão antiga pode sobrescrever nova sem guarda de versão. Mitigação: OQ-16, OQ-62.
- **R-16 Edição pós-publicação sem regra quebra o Inventory.** Capacidade, layout, data ou local alterados à vontade viram dados que o Inventory da Fase 4 não acompanha. Mitigação: OQ-50.
- **R-17 Agregado e documentos grandes.** Evento com muitas sessões, setores e lotes é carregado inteiro a cada command; `session_seat_map` (um documento por sessão) tem limite de 16 MB no Mongo. Mitigação: OQ-21, OQ-31, OQ-60.
- **R-18 Fuso horário.** O Brasil tem mais de um fuso; data sem fuso mostra horário errado; `Intl.DateTimeFormat` sem `timeZone` explícito usa o fuso da máquina e deixa testes instáveis entre máquinas. Mitigação: OQ-13.
- **R-19 Questões legais reais.** Lei 12.933/2013 e Decreto 8.537/2015 (meia-entrada em 40% dos ingressos; há entendimento do MP-CE de que vale por setor); Lei 13.146/2015 (acessibilidade); classificação indicativa. Mitigação: OQ-20, OQ-24, OQ-42 declaram o que fica fora.
- **R-20 Escopo crescendo.** São 97 OQs; cada "incluir já" aumenta cadastro, contrato e telas. As recomendações tentam o mínimo que ensina CQRS sem quebrar as Fases 4 e 5.

**Write side**

- **R-21 Nome `Event` no código.** `@types/node` e o `lib.dom` do TypeScript declaram a classe global `Event`; uma classe ou tipo `Event` sombreia o global e confunde com "evento de domínio" (`glossary.md:7`). Mitigação: OQ-79.
- **R-22 Entidades filhas sem bump da raiz.** Gravar filho sem o UPDATE condicional da raiz deixa duas transações alterarem o mesmo agregado sem conflito. Mitigação: OQ-63, OQ-72.
- **R-23 Migration no dev.** `db-migrate` é one-shot; com Compose Watch a migration nova não roda sozinha; `migration:generate` exige `nest build` antes (napkin). Mitigação: Plan documenta os passos.
- **R-24 Regra de negócio implícita em validação.** Limites e transições são fáceis de presumir num schema Zod. Mitigação: nenhum limite entra sem decisão (blocos de negócio das OQs).
- **R-25 Contratos públicos difíceis de mudar.** Payload magro demais agora vira `V2` cedo quando Inventory e Ordering chegarem. Mitigação: OQ-61, OQ-62.
- **R-39 `IdempotencyService` grava 202 fixo** (`idempotency.service.ts:50`). Só importa se algum command responder com outro status. Mitigação: OQ-80.

**Read side**

- **R-26 Falha compartilhada.** Com um consumer group só, um bug na projeção do Catalog para também a do diagnóstico, e vice-versa. Mitigação: OQ-83.
- **R-27 Índice de texto.** Um por coleção; `$text` falha sem índice; não busca por prefixo ("roc" não acha "rock"). Testes de integração usam Mongo próprio (58017/58018) e precisam criar os mesmos índices. Mitigação: OQ-71, OQ-86.
- **R-28 Rascunhos expostos.** Sem autenticação até a Fase 3, qualquer GET que devolva rascunhos é público. Mitigação: OQ-4.
- **R-29 Crescimento de `processed_events`.** Sem limpeza; aceitável para estudo.

**Web e testes**

- **R-30 Espera sem fim.** O polling do cliente não tem limite (`use-ping.ts:13-18`); com o projector parado (falha barulhenta proposital, ADR 0009), o form fica "aguardando projeção" para sempre. Mitigação: OQ-97.
- **R-31 Reenvio manual gera duplicata.** Chave nova por submit (`create-ping-form.tsx:36`): se o command gravou e a resposta se perdeu depois dos retries, o próximo clique cria outro evento. Mitigação: OQ-92.
- **R-32 Form de edição preenchido com read model atrasado.** O command com versão esperada deve dar 409 e a UI recarregar. Mitigação: OQ-2, OQ-64.
- **R-33 Contrato não compilado.** O web consome `libs/contracts/dist`; rodar só o teste do web depois de mudar o contrato mostra tipos antigos. Mitigação: scripts da raiz já fazem o build; o Plan lembra.
- **R-34 `localhost` x `127.0.0.1`.** `playwright.config.ts:7` e `e2e/src/support/env.ts:3` usam `localhost`, que no Windows com WSL mirrored resolve primeiro para `::1` e dá timeout (napkin). Mitigação: OQ-95.
- **R-35 Dados acumulados na stack.** E2E roda contra a stack de produção sem reset; asserções de contagem ficam frágeis. Mitigação: OQ-95.
- **R-36 Arquivos compartilhados entre trilhas.** Web: `app/router.tsx`, `test/render.tsx`, `api/http.ts`, `components/ui/*`, `lib/format.ts`. Write: `app.module.ts`, `data-source.ts`, `migrations/index.ts`, `test/integration/setup.ts`. Contratos: `libs/contracts/src/index.ts`. Infra: `create-topics.sh`, `init-replica-set.js`. E2E: `replay.ts`, `support/http.ts`. O Plan precisa de dono único ou onda anterior para cada um.
- **R-37 CLI do shadcn altera `src/index.css` e `package.json`** (napkin). Mitigação: OQ-93 (instalar tudo numa trilha só, antes das telas).
- **R-38 Helper `api` do E2E só com GET e POST** (`e2e/src/support/http.ts:14-17`). Precisa crescer se houver PATCH/DELETE (OQ-80).
- **R-40 Compose movido para a raiz sem commit.** As referências usam a raiz; se o working tree for revertido, os caminhos mudam.

## Open Questions

### Guia para o Gate 1

As OQs estão em blocos de dependência. Levar ao usuário nesta ordem:

1. **Blocos de negócio N1 a N9 (OQ-1 a OQ-59).** Ordem lógica: escopo e atores → local → setores e assentos → evento → sessão → lote e preço → ciclo de vida → edição → vitrine e página. Valores numéricos nas recomendações são **sugestões para o usuário confirmar ou trocar**, não regras.
2. **Bloco T1 (OQ-60 a OQ-76): técnicas que dependem de respostas de negócio.** Só levar depois dos blocos N. Dentro do T1, há um subgrupo que precisa de discussão e outro com recomendação óbvia que pode ir em lote depois que as dependências estiverem respondidas.
3. **Bloco T2 (OQ-77 a OQ-96): técnicas independentes, com recomendação óbvia.** Podem ser aprovadas em lote, a qualquer momento (sugestão: junto com o T1-lote).
4. **Bloco T3 (OQ-97): técnica que exige um valor do usuário.**

**OQs que caem conforme respostas anteriores:** OQ-3 e OQ-4 caem se OQ-1 = B; OQ-15 e OQ-16 só valem se OQ-14 = A ou D; OQ-19 só vale se OQ-18 = A; OQ-43 a OQ-51 caem em grande parte se OQ-2 = A (sem publicação nem edição); OQ-64 cai para "versão lida no servidor" se não houver edição; OQ-69 cai se OQ-4 = C; OQ-71 cai se OQ-57 não tiver busca; OQ-76 cai se OQ-8 = B.

**Divergências entre áreas registradas (o usuário decide):** OQ-2, OQ-10, OQ-14, OQ-18, OQ-56, OQ-57, OQ-58, OQ-61 (nomes), OQ-68, OQ-69.

#### Índice

| Bloco | OQ | Pergunta curta |
|---|---|---|
| N1 Escopo e atores | OQ-1 | Back-office do produtor no web ou só API? |
| | OQ-2 | Quais operações entram (criar, publicar, editar, remover)? |
| | OQ-3 | Fluxo de cadastro: telas por entidade, wizard ou form único? |
| | OQ-4 | Produtor lista rascunhos? Aceita expô-los sem auth até a Fase 3? |
| | OQ-5 | Produtor seed: quantos e com quais dados? |
| | OQ-6 | Regra de propriedade e quem pode chamar os commands na Fase 2 |
| | OQ-7 | Nome do produtor aparece na página do evento? |
| | OQ-8 | Seed cria locais e eventos de demonstração? |
| N2 Local | OQ-9 | Local é cadastro próprio reutilizável? |
| | OQ-10 | Quem cria e quem enxerga os locais? |
| | OQ-11 | Campos do local e validações |
| | OQ-12 | Local tem capacidade total que limita os setores? |
| | OQ-13 | Fuso horário das sessões (gravação e exibição) |
| N3 Setores e assentos | OQ-14 | Onde vivem os setores: local, sessão ou evento? |
| | OQ-15 | Sessão pode usar só parte da planta? |
| | OQ-16 | Mudança na planta afeta sessões existentes? |
| | OQ-17 | Campos do setor |
| | OQ-18 | Layout dos assentos do setor marcado já na Fase 2? |
| | OQ-19 | Formato do layout |
| | OQ-20 | Assentos de acessibilidade entram no modelo? |
| | OQ-21 | Limites numéricos de setores e capacidade |
| N4 Evento | OQ-22 | Campos do evento e limites |
| | OQ-23 | Categoria: lista fixa? Quais valores? |
| | OQ-24 | Classificação indicativa |
| | OQ-25 | Imagem do evento |
| | OQ-26 | Todo evento é presencial? |
| | OQ-27 | Festival de vários dias e passaporte |
| N5 Sessão | OQ-28 | Sessões do mesmo evento em locais diferentes? |
| | OQ-29 | Quais horários a sessão tem? |
| | OQ-30 | Quando uma sessão pode acontecer? |
| | OQ-31 | Quantidade de sessões e conflitos |
| N6 Lote e preço | OQ-32 | A que o lote pertence? |
| | OQ-33 | Como funciona a virada de lote? |
| | OQ-34 | Campos do lote |
| | OQ-35 | Mais de um lote vigente no mesmo setor? |
| | OQ-36 | Quantidade dos lotes x capacidade do setor |
| | OQ-37 | Sobra de lote virado por data passa para o próximo? |
| | OQ-38 | Lote em setor marcado vale para qualquer assento? |
| | OQ-39 | Preço: moeda, precisão, mínimo, máximo, gratuidade |
| | OQ-40 | Preço precisa crescer de um lote para o seguinte? |
| | OQ-41 | Período de vendas da sessão |
| | OQ-42 | Meia, cota, taxa e limite por CPF totalmente fora? |
| N7 Ciclo de vida | OQ-43 | Quais estados o evento tem? |
| | OQ-44 | O que é exigido para publicar? |
| | OQ-45 | Publicação agendada? |
| | OQ-46 | Despublicar? |
| | OQ-47 | Cancelar evento entra na Fase 2? |
| | OQ-48 | Cancelar ou remarcar sessão entra na Fase 2? |
| | OQ-49 | O que pode ser excluído? |
| N8 Edição | OQ-50 | O que pode ser editado depois de publicar? |
| | OQ-51 | Sessão adicionada a evento publicado nasce publicada? |
| N9 Vitrine e página | OQ-52 | Vitrine lista eventos ou sessões? |
| | OQ-53 | O que aparece na vitrine e na página, e quando some |
| | OQ-54 | O que o card da vitrine mostra |
| | OQ-55 | Qual preço a vitrine mostra |
| | OQ-56 | O que a página do evento mostra de setores e lotes |
| | OQ-57 | Busca, filtros e ordenação da vitrine |
| | OQ-58 | Paginação: forma e tamanho de página |
| | OQ-59 | Botão de compra nesta fase? |
| T1 Técnicas dependentes (discussão) | OQ-60 | Fronteira dos agregados |
| | OQ-61 | Commands e eventos: tarefa x CRUD, payload, nomes |
| | OQ-62 | Dados do local no read side: lookup ou snapshot |
| | OQ-64 | Versão esperada vinda do cliente em edições |
| | OQ-66 | Um ou dois read models (vitrine e página) |
| | OQ-67 | Controle de sequência com documentos compostos |
| | OQ-68 | Qual versão o `min_version` compara |
| | OQ-69 | Read models e queries do produtor |
| | OQ-70 | Estados que dependem do relógio: derivados ou gravados, e onde |
| | OQ-71 | Implementação da busca textual |
| | OQ-76 | Mecanismo do seed de demonstração |
| T1 Técnicas dependentes (lote após o negócio) | OQ-63 | Semântica da versão em agregado com filhos |
| | OQ-65 | Resposta do command que cria entidade filha |
| | OQ-72 | Tabelas, FKs e persistência das filhas |
| | OQ-73 | Como o produtor seed chega ao handler |
| | OQ-74 | Entrada de preço no formulário |
| | OQ-75 | Entrada de data/hora no formulário |
| T2 Técnicas independentes (lote) | OQ-77 | Infra compartilhada do write-service (módulo e outbox) |
| | OQ-78 | Tópico `catalog.events` |
| | OQ-79 | Organização de `libs/contracts` e nome `CatalogEvent` |
| | OQ-80 | Rotas, status HTTP e `Idempotency-Key` |
| | OQ-81 | Identificador nas URLs: UUID ou slug |
| | OQ-82 | Contrato de erro e exibição no form |
| | OQ-83 | Topologia de consumo do projector |
| | OQ-84 | Migrar a projeção do Ping para o mecanismo genérico |
| | OQ-85 | Escopo do replay |
| | OQ-86 | Onde criar coleções e índices do Mongo |
| | OQ-87 | Cobertura E2E e de replay do read side |
| | OQ-88 | Vitrine em `/` e diagnóstico em outra rota |
| | OQ-89 | Idioma das URLs do web |
| | OQ-90 | Loaders do React Router x TanStack Query |
| | OQ-91 | Extrair cliente HTTP e read-your-writes do diagnóstico |
| | OQ-92 | Ciclo de vida da `Idempotency-Key` nos forms |
| | OQ-93 | Componentes shadcn e feedback de sucesso |
| | OQ-94 | Simulação da API nos testes de componente |
| | OQ-95 | Dados e host dos testes Playwright/E2E |
| | OQ-96 | Seletores de teste e acessibilidade |
| T3 Valor do usuário | OQ-97 | Limite de espera pela projeção na UI |

---

### Bloco N1 — Escopo e atores

### OQ-1 [negócio] O cadastro tem tela do produtor no web ou é só via API?
- **Origem:** Dominio-1.
- **Contexto:** `docs/roadmap.md:13` entrega "cadastro de evento, local, sessão, setores e lotes" e "vitrine e página do evento no web", sem dizer se o produtor cadastra por uma tela. As parciais Frontend e ReadSide assumiram uma área do produtor; esta OQ confirma. Tela de produtor também pede lista dos próprios eventos, incluindo rascunhos (OQ-4).
- **Opções:** A) back-office mínimo no web: cadastrar local e planta, criar evento, sessões, setores e lotes, publicar, listar os próprios eventos (com rascunhos); B) cadastro só pela API (HTTP + seed/script); o web tem só vitrine e página do evento; C) back-office parcial: criar e publicar evento pela tela, locais só por seed.
- **Recomendação:** A. O aprendizado da fase (command → evento → projeção) fica visível quando o usuário escreve pela tela e vê o `min_version` funcionando. É a opção mais cara; se o escopo pesar, C.

### OQ-2 [negócio] Quais operações de cadastro entram na Fase 2?
- **Origem:** Backend-1, Frontend-12 (relacionadas: Dominio-46, Dominio-48, Dominio-54).
- **Contexto:** o roadmap diz "cadastro" (`docs/roadmap.md:13`), sem dizer se inclui publicação, edição ou remoção. Cada operação é um command, um evento público, um caso de projeção e um formulário. Edição traz a versão esperada vinda do cliente (OQ-64) e o caso didático do formulário preenchido com read model atrasado + 409 (R-32).
- **Opções:** A) só criação; tudo o que é criado aparece na vitrine; B) criação + publicação (rascunho fica fora da vitrine); sem edição nem remoção; C) B + edição dos dados descritivos e remoção de sessão/setor/lote **enquanto rascunho**; D) C + edição depois de publicado (regras na OQ-50) e cancelamento de evento/sessão (OQ-47, OQ-48).
- **Divergência entre áreas:** Backend recomenda B (menor conjunto com vitrine coerente; edição pode esperar a Identity). Frontend recomenda criação + edição (concorrência otimista vista pelo usuário prepara a Fase 4), deixando remoção para a Fase 7. Domínio modela edição de dados descritivos (`UpdateEventDetails`), descarte de rascunho (Dominio-46 A) e edição pós-publicação restrita (Dominio-48 B), o que equivale a D sem cancelamento.
- **Recomendação (consolidada):** C, com a edição pós-publicação decidida à parte na OQ-50. C exercita a concorrência otimista ponta a ponta (regras 4 e 7) e permite corrigir rascunho; A conflita com a existência de rascunho (OQ-43); o cancelamento de D pertence à Fase 7.

### OQ-3 [negócio] Como é o fluxo de cadastro do produtor?
- **Origem:** Frontend-11.
- **Condicional:** cai se OQ-1 = B.
- **Contexto:** são cinco entidades (local, evento, sessão, setor, lote). Cada submit gera um command, uma versão e uma espera por projeção. A forma depende da granularidade dos commands (OQ-61) e do agregado (OQ-60).
- **Opções:** A) telas separadas seguindo as entidades: "Locais" (lista + novo); "Meus eventos" (lista + novo); página de gestão do evento onde se adicionam sessões, setores e lotes; um submit = um command, com espera pela projeção antes de mostrar o item; B) wizard de várias etapas com rascunho no cliente (Zustand) e todos os commands enviados no final; C) um formulário único que envia um command com tudo aninhado.
- **Recomendação:** A. Cada formulário corresponde a um command e mostra o ciclo command → `{ id, version }` → projeção → tela. B espalha uma operação de negócio em vários commands sem atomicidade e põe dado de negócio no Zustand; C depende de um agregado gigante e de um command que cria tudo.

### OQ-4 [negócio] O produtor lista os próprios eventos, inclusive rascunhos? Aceita-se que essas leituras fiquem públicas até a Fase 3?
- **Origem:** ReadSide-11 (parte de negócio), Frontend-13 (parte de leitura), Dominio-1.
- **Condicional:** cai se OQ-1 = B.
- **Contexto:** para editar ou adicionar sessões, o produtor precisa ver seus eventos, inclusive os não publicados, e escolher um local já cadastrado. Na Fase 2 não há autenticação: qualquer GET que devolva rascunhos é público (R-28). Qual read model serve essas telas é a OQ-69.
- **Opções:** A) o produtor lista os próprios eventos (com rascunhos) e os próprios locais; os endpoints ficam públicos sem auth até a Fase 3, risco aceito e registrado; B) o produtor só vê o que já foi publicado (rascunho não é listado); C) sem listagem: o produtor só cria, num fluxo linear de cadastro.
- **Recomendação:** A. Projeto de estudo, sem dados reais; mostra que o back-office também lê do read side, com read-your-writes.

### OQ-5 [negócio] Produtor seed: quantos e com quais dados?
- **Origem:** Dominio-2, Backend-4 (parte "o que o seed é").
- **Contexto:** "produtor via usuário seed" (`docs/roadmap.md:13`); Identity só na Fase 3. Os eventos precisam de dono (`organizerId`) para a Fase 3 não mudar o contrato.
- **Opções:** A) um produtor seed com ID fixo (UUID) e, se a OQ-7 pedir, nome de exibição; B) dois ou mais produtores seed, para exercitar a regra de propriedade (só faz sentido se OQ-6 validar posse); C) nenhum produtor modelado; eventos sem dono até a Fase 3.
- **Recomendação:** A. Basta para o cadastro; o `organizerId` já entra no agregado e nos eventos.

### OQ-6 [negócio] A regra "o produtor só gerencia o que é dele" vale na Fase 2? Quem pode chamar os commands de cadastro?
- **Origem:** Dominio-3, Backend-5.
- **Contexto:** sem Identity, qualquer forma de dizer "sou o produtor X" é forjável, e qualquer pessoa que acesse o site pode chamar os commands. A regra é central na Fase 3.
- **Opções:** A) aberto: todo command é executado em nome do produtor seed; o `organizerId` é gravado; a validação de posse entra na Fase 3; limitação documentada; B) posse validada já, com identificação provisória (ex.: `organizerId` informado pela requisição); C) token estático de "produtor" num header, configurado no compose; D) rotas de cadastro só por porta/rota separada no Nginx; E) nenhum registro de dono.
- **Recomendação:** A (as duas áreas concordam). Grava o dono (contrato estável) sem construir autenticação provisória que a Fase 3 descarta. O mecanismo técnico está na OQ-73.

### OQ-7 [negócio] O nome do produtor aparece na página do evento?
- **Origem:** Dominio-4, Backend-4 (opção C).
- **Contexto:** plataformas costumam mostrar "Organizado por ...". O produtor seed não tem perfil real; o perfil vem da Fase 3. Mostrar o nome agora significa replicar no Catalog um dado que será da Identity.
- **Opções:** A) sim, nome do seed desnormalizado no read model (vindo do evento de criação ou de um evento próprio); B) não na Fase 2.
- **Recomendação:** B. Sem Identity não há dado real; quando houver, vira um bom exemplo de desnormalização entre contextos.

### OQ-8 [negócio] O seed também cria locais e eventos de demonstração?
- **Origem:** Dominio-5.
- **Contexto:** sem dados, a vitrine começa vazia. O read model precisa ser reconstruível por replay (regra 6), então dado escrito direto no Mongo não serve. O mecanismo técnico é a OQ-76.
- **Opções:** A) sim, um conjunto pequeno criado **via commands** (passando pela outbox), cobrindo assento marcado e pista, rascunho e publicado; B) não; só o produtor seed; C) seed escrito direto no read model.
- **Recomendação:** A, com o conteúdo (quantos locais, quantos eventos, quais nomes) definido pelo usuário. C viola a reconstrução por replay.

### Bloco N2 — Local

### OQ-9 [negócio] Local é um cadastro próprio e reutilizável?
- **Origem:** Dominio-6.
- **Contexto:** `docs/domain/glossary.md:9` descreve o Local como lugar físico "com sua planta de setores", o que sugere cadastro reutilizado por vários eventos.
- **Opções:** A) Local é cadastro próprio, criado uma vez e escolhido nas sessões; B) Local é só um conjunto de campos (nome, endereço) preenchido em cada evento ou sessão, sem reuso.
- **Recomendação:** A. Bate com o glossário e evita redigitar a planta a cada evento.

### OQ-10 [negócio] Quem cria e quem enxerga os locais?
- **Origem:** Dominio-7, Backend-4 (opções A e B).
- **Contexto:** os papéis previstos são cliente, produtor e portaria (`docs/roadmap.md:14`); não há administrador da plataforma. Com um único produtor seed, as opções A e B são iguais na prática na Fase 2, mas mudam o contrato (`Venue` com ou sem `organizerId`).
- **Opções:** A) cada produtor cadastra os próprios locais, visíveis só para ele (`Venue` com `organizerId`); B) qualquer produtor cadastra e todos os locais são compartilhados (`Venue` global, sem dono); C) locais só por seed (lista fixa), o produtor apenas escolhe; D) criar um papel de administrador.
- **Divergência entre áreas:** Domínio recomenda A (a edição da planta por um produtor não afeta eventos de outro). Backend recomendou `Venue` global (B), para não inventar posse que é da Identity, e listou A como alternativa.
- **Recomendação (consolidada):** A. Gravar o dono agora custa um campo e evita mudar o contrato na Fase 3, mesmo argumento que o Backend usa para o `organizerId` do evento.

### OQ-11 [negócio] Campos do local e validações.
- **Origem:** Dominio-8, Backend-6 (local).
- **Contexto:** a vitrine provavelmente mostra e filtra por cidade (OQ-57). Endereço brasileiro tem formato próprio. Cada campo vira coluna, campo de evento público e regra Zod compartilhada com o form.
- **Opções:** A) nome, cidade, UF, endereço em texto livre; B) nome + endereço estruturado (logradouro, número, complemento opcional, bairro, cidade, UF, CEP); C) B + coordenadas (latitude/longitude) para mapa.
- **Sub-perguntas:** só locais no Brasil (UF obrigatória entre as 27)? Nome único por produtor? Tamanhos máximos?
- **Recomendação:** A, só Brasil, UF entre as 27 siglas, nome obrigatório com trim e 1 a 100 caracteres, cidade 1 a 100, endereço 1 a 200, nome **não** único (valores a confirmar). Endereço estruturado não acrescenta aprendizado de CQRS.

### OQ-12 [negócio] O local tem capacidade total, e ela limita a soma dos setores?
- **Origem:** Dominio-9, Backend-6 (capacidade total do local).
- **Contexto:** a capacidade de venda é por setor. Um teto do local seria uma segunda fonte de verdade.
- **Opções:** A) local tem capacidade máxima; a soma dos setores precisa ser menor ou igual; B) não há capacidade do local; a total é a soma dos setores (derivada); C) capacidade informativa, sem validação.
- **Recomendação:** B. Uma fonte só para capacidade.

### OQ-13 [negócio] Fuso horário das sessões: como gravar e em que fuso exibir.
- **Origem:** Dominio-10, Backend-8, Frontend-10.
- **Contexto:** o Brasil tem mais de um fuso; exibir em horário de Brasília um show em Manaus mostra a hora errada para quem vai ao local. O fuso afeta a coluna, o evento público, a validação de "sessão no passado", o filtro de datas da vitrine (OQ-57) e a formatação no web (sempre com `timeZone` explícito, R-18).
- **Opções:** A) instante (`timestamptz`, ISO com offset na API) e tudo exibido em `America/Sao_Paulo`; B) instante + fuso IANA no Local (ex.: `America/Manaus`), escolhido no cadastro com padrão `America/Sao_Paulo`; exibição no fuso do local; C) data e hora locais sem fuso; D) exibir no fuso do navegador de quem acessa.
- **Recomendação:** B (as três áreas convergem quando há locais fora do horário de Brasília). O instante fica correto para ordenação e regras; a exibição respeita o lugar do evento. C não serve para comparar com "agora"; D mostra horários diferentes para pessoas diferentes.

### Bloco N3 — Setores, planta e assentos

### OQ-14 [negócio] Onde vivem os setores: no local, na sessão ou no evento?
- **Origem:** Dominio-11, Backend-3 (parte "dono do setor").
- **Contexto:** o glossário diz que o Local tem "sua planta de setores" (`glossary.md:9`) e que o Setor é "área do local para uma sessão" (`:11`) (R-13). O Inventory vai precisar de setor por sessão (`CLAUDE.md:44`).
- **Opções:** A) planta no local (setores-modelo); cada sessão cria os seus setores a partir da planta, e os lotes são definidos por setor da sessão; B) setores definidos direto em cada sessão, sem planta no local; C) setores definidos no evento, iguais para todas as sessões; D) planta no local, e a sessão apenas referencia a planta (sem cópia).
- **Divergência entre áreas:** Domínio recomenda A (concilia as duas definições do glossário). Backend não recomendou opção de negócio; do ponto de vista do write side, B é o mais simples e casa com o agregado `Event` (OQ-60), e uma referência viva ao `Venue` põe dado da vitrine em outro agregado (R-7).
- **Recomendação (consolidada):** A combinada com cópia na criação da sessão (OQ-16 = A). Com a cópia, os setores vendáveis passam a viver dentro do agregado do evento, o que elimina a preocupação técnica do Backend: o `Venue` só é lido no PostgreSQL no momento de criar a sessão, dentro do mesmo contexto (regras 1 e 10 respeitadas).

### OQ-15 [negócio] A sessão pode usar só parte da planta ou mudar um setor?
- **Origem:** Dominio-12.
- **Condicional:** só vale se OQ-14 = A ou D.
- **Contexto:** a mesma arena pode ter palco montado de formas diferentes; parte dos setores não é vendida.
- **Opções:** A) a sessão usa sempre todos os setores; B) a sessão pode desativar setores, mas não alterar capacidade nem layout; C) pode desativar setores e reduzir capacidade (ou bloquear assentos); D) livre (equivale à planta copiada e editável na sessão, sugerida pelo Backend-3 C).
- **Recomendação:** B. Cobre o caso comum sem abrir edição de capacidade por sessão.

### OQ-16 [negócio] O que acontece com as sessões quando a planta do local muda?
- **Origem:** Dominio-13.
- **Condicional:** só vale se OQ-14 = A ou D.
- **Contexto:** se a sessão referencia a planta, editar o local muda sessões publicadas (e, na Fase 4, sessões com ingressos vendidos).
- **Opções:** A) a sessão copia a planta quando é criada; mudanças posteriores não afetam sessões existentes; B) a cópia acontece na publicação; antes, a sessão acompanha a planta; C) a planta fica bloqueada depois de usada; mudar exige novo local; D) mudanças se propagam para todas as sessões.
- **Recomendação:** A. Regra simples e isola sessões publicadas (R-16).

### OQ-17 [negócio] Campos do setor.
- **Origem:** Dominio-14, Backend-6 (setor).
- **Contexto:** os tipos já estão confirmados (RC-3). Faltam os demais campos e a unicidade do nome.
- **Opções:** A) nome, tipo, e capacidade (pista) ou layout (assento marcado); B) A + descrição curta (ex.: "visão parcial do palco"); C) A + atributos visuais (cor, posição no mapa).
- **Sub-perguntas:** nome único dentro da planta (ou da sessão, se OQ-14 = B)? Tamanho máximo? Ordem de exibição definida pelo produtor?
- **Recomendação:** A, nome único na planta (sem diferenciar maiúsculas, após trim), 1 a 50 caracteres (a confirmar), ordem de exibição = ordem de cadastro. Visual do mapa fica para a Fase 4.

### OQ-18 [negócio] O layout dos assentos do setor marcado é definido no Catalog já na Fase 2?
- **Origem:** Dominio-15, Backend-3 (parte "assento marcado na Fase 2"), Frontend-24.
- **Contexto:** o Catalog é dono da configuração do que existe (`overview.md:53`); o Inventory, da disponibilidade (`:54`). A venda dos dois tipos começa na Fase 4 (ADR 0007:11), e o Inventory vai precisar saber quais assentos existem, por evento público (RC-11). No web, o impacto vai de um campo numérico a um editor de fileiras (`useFieldArray`).
- **Opções:** A) o Catalog define o layout na Fase 2 (formato na OQ-19) e os eventos já o carregam; o Inventory consome na Fase 4; B) na Fase 2 o setor marcado guarda só tipo + capacidade numérica; o layout entra na Fase 4 (por um command e evento novos do Catalog); C) a Fase 2 aceita só setores de pista.
- **Divergência entre áreas:** Domínio recomenda A (contrato definido uma vez, dono certo do dado). Backend e Frontend recomendam B (o mapa e a concorrência por assento são o tema da Fase 4; a estrutura nasce junto com quem a usa).
- **Recomendação (consolidada):** A com o formato mais simples (grade da OQ-19). Em B, a capacidade numérica cadastrada agora teria de ser reconciliada com o layout da Fase 4 (duas fontes para o mesmo número). B continua válida se o usuário quiser reduzir o escopo do formulário.

### OQ-19 [negócio] Formato do layout dos assentos.
- **Origem:** Dominio-16.
- **Condicional:** só vale se OQ-18 = A.
- **Contexto:** plantas reais têm filas de tamanhos diferentes, numeração par/ímpar, corredores. Quanto mais fiel, maior o formulário e o contrato.
- **Opções:** A) grade simples: lista de filas, cada uma com rótulo (ex.: "A") e quantidade de assentos numerados de 1 a N; assento = fila + número; B) A + assentos inexistentes e numeração customizada; C) lista explícita de assentos com rótulo livre; D) coordenadas x/y para desenhar o mapa.
- **Recomendação:** A. Capacidade do setor = soma dos assentos das filas; rótulo de fila único no setor. Desenho do mapa fica para a Fase 4.

### OQ-20 [negócio] Assentos de acessibilidade entram no modelo?
- **Origem:** Dominio-17.
- **Contexto:** a Lei Brasileira de Inclusão (Lei 13.146/2015) exige espaços reservados em locais de espetáculo (R-19).
- **Opções:** A) fora do escopo do estudo, registrado como lacuna consciente; B) o layout marca assentos/espaços como acessíveis, sem regra de venda; C) com regras de venda (reserva, acompanhante).
- **Recomendação:** A. Pode virar fase futura.

### OQ-21 [negócio] Limites numéricos de setores e capacidade.
- **Origem:** Dominio-18, Backend-6 (capacidade mínima e máxima do setor).
- **Contexto:** sem limite, uma planta pode estourar o agregado e o documento `session_seat_map` da Fase 4 (R-17).
- **Opções:** A) limites definidos agora; sugestão: pista de 1 a 100.000 lugares; até 50 setores por planta; setor marcado com até 100 filas e 100 assentos por fila (máx. 10.000 por setor); B) só "inteiro positivo", sem teto; C) outros valores.
- **Recomendação:** A, com os valores que o usuário escolher. Os números sugeridos são só ponto de partida.

### Bloco N4 — Evento

### OQ-22 [negócio] Campos do evento e limites.
- **Origem:** Dominio-19, Backend-6 (evento).
- **Contexto:** a vitrine e a página precisam de dados mínimos. Cada campo vira formulário, validação e contrato.
- **Opções:** A) título, descrição, categoria (OQ-23), classificação indicativa (OQ-24), imagem (OQ-25); B) só título e descrição; C) A + atrações/artistas, tags e política do evento.
- **Sub-perguntas:** tamanhos máximos? Descrição em texto puro ou markdown? Dois eventos podem ter o mesmo título?
- **Recomendação:** A, título com trim e 1 a 120 caracteres, descrição de 1 a 5.000 caracteres em texto puro, títulos repetidos permitidos (valores a confirmar).

### OQ-23 [negócio] Categoria: lista fixa? Quais valores?
- **Origem:** Dominio-20.
- **Contexto:** a categoria pode virar filtro da vitrine (OQ-57).
- **Opções:** A) lista fixa (sugestão: Show, Teatro, Stand-up, Esporte, Festival, Infantil, Outros); B) texto livre; C) sem categoria.
- **Recomendação:** A, com os valores que o usuário definir. Lista fixa permite filtro confiável.

### OQ-24 [negócio] Classificação indicativa.
- **Origem:** Dominio-21.
- **Contexto:** no Brasil, espetáculos públicos informam a classificação indicativa (Livre, 10, 12, 14, 16 e 18 anos).
- **Opções:** A) obrigatória, com as categorias oficiais; nenhum controle de idade na compra; B) opcional; C) fora do modelo.
- **Recomendação:** A. Custa um campo; controle de idade na compra não entra.

### OQ-25 [negócio] Imagem do evento.
- **Origem:** Dominio-22, Frontend-5 (opção B do card).
- **Contexto:** a vitrine fica pobre sem imagem; upload exige armazenamento de arquivos, que a stack não tem. O Frontend descartou imagem no card supondo upload; URL externa não precisa de infra nova.
- **Opções:** A) URL externa (https) informada pelo produtor, opcional, com imagem padrão quando ausente; B) upload de arquivo (exige storage novo); C) sem imagem; placeholder por categoria.
- **Recomendação:** A. Não adiciona infraestrutura.

### OQ-26 [negócio] Todo evento é presencial?
- **Origem:** Dominio-23.
- **Opções:** A) sim; toda sessão tem local; B) suportar evento online (sessão sem local, com link).
- **Recomendação:** A. Evento online não tem setor nem assento e foge do foco (concorrência por lugar).

### OQ-27 [negócio] Festival de vários dias e passe para mais de uma sessão.
- **Origem:** Dominio-24.
- **Contexto:** festivais vendem ingresso por dia e "passaporte" para vários dias. O glossário só define ingresso para uma sessão.
- **Opções:** A) fora: cada sessão é vendida separadamente; B) uma sessão pode durar vários dias, vendida como uma só; C) produto "passaporte" que reserva lugar em várias sessões.
- **Recomendação:** A. C cria uma reserva que cruza vários agregados de inventário e muda a concorrência da Fase 4.

### Bloco N5 — Sessão

### OQ-28 [negócio] As sessões de um mesmo evento podem ser em locais diferentes?
- **Origem:** Dominio-25.
- **Contexto:** turnês têm o mesmo espetáculo em várias cidades. Afeta a vitrine (um evento em várias cidades) e o filtro por cidade.
- **Opções:** A) sim, o local é da sessão; B) não, o local é do evento e vale para todas as sessões.
- **Recomendação:** A. Mais geral; com OQ-14 = A os setores já são por sessão.

### OQ-29 [negócio] Quais horários a sessão tem?
- **Origem:** Dominio-26, Backend-6 (término ou duração, abertura dos portões).
- **Opções:** A) só início; B) início e término; C) abertura dos portões + início (+ término opcional).
- **Recomendação:** A. Com as recomendações das OQ-41 e OQ-53, nenhuma regra usa o término.

### OQ-30 [negócio] Quando uma sessão pode acontecer?
- **Origem:** Dominio-27, Backend-6 (sessão no passado).
- **Opções:** A) o início precisa estar no futuro ao criar ou editar; sem limite máximo; B) antecedência mínima de X horas; C) A + no máximo N meses à frente.
- **Recomendação:** A. Não há regra conhecida que peça mais.

### OQ-31 [negócio] Quantidade de sessões e conflitos.
- **Origem:** Dominio-28, Backend-6 (duas sessões no mesmo horário, do mesmo evento ou no mesmo local).
- **Contexto:** RC-1 diz que o evento tem uma ou mais sessões; falta dizer se isso vale para o rascunho.
- **Opções:** A) rascunho pode ter zero sessões; publicar exige pelo menos uma; até 100 sessões por evento; duas sessões do mesmo evento não podem ter o mesmo local e o mesmo início; conflito de agenda do local com outros eventos **não** é validado; B) A com validação de conflito de agenda do local; C) sem limite máximo.
- **Recomendação:** A (o número 100 é sugestão). Conflito de agenda do local exigiria regra entre agregados sem ganho de aprendizado.

### Bloco N6 — Lote e preço

### OQ-32 [negócio] A que o lote pertence?
- **Origem:** Dominio-29.
- **Contexto:** o glossário diz "faixa de preço de um setor" (`glossary.md:14`), sem dizer se é o setor da sessão ou do evento.
- **Opções:** A) ao setor de uma sessão: cada sessão tem os próprios lotes; B) ao setor no nível do evento: mesmos lotes e preços em todas as sessões, com quantidades por sessão; C) ao evento inteiro: preço único para todos os setores.
- **Recomendação:** A. Bate com o agregado de inventário por sessão + setor (`CLAUDE.md:44`). Se cadastrar sessão a sessão pesar, o back-office pode oferecer "copiar lotes de outra sessão" sem mudar o modelo.

### OQ-33 [negócio] Como funciona a virada de lote?
- **Origem:** Dominio-30, Backend-6 (sobreposição de janelas entre lotes do mesmo setor).
- **Contexto:** o glossário fala em "por período ou até esgotar" e o overview lista "virada por data ou por esgotamento" como candidata não confirmada (`overview.md:109`). O roadmap cita lotes nas Fases 2 e 5 (`roadmap.md:13`, `:16`, R-13). Esgotamento depende de vendas, que só existem a partir da Fase 4/5 (R-14).
- **Opções:** A) **sequencial**: os lotes têm ordem; o 1º começa numa data de início de vendas; cada lote fica vigente até esgotar a quantidade **ou** chegar à sua data de fim, o que vier primeiro, e o seguinte fica vigente na hora; B) **janelas independentes**: cada lote tem início e fim próprios; vigente é o de menor ordem cuja janela contém o momento atual e que não esgotou; pode haver intervalo sem venda; C) virada manual pelo produtor; D) A ou B, mas na Fase 2 só a virada por data existe; o esgotamento entra quando houver venda.
- **Recomendação:** A como regra de negócio, com a parte "esgotar" passando a ter efeito só quando houver venda (o que a D deixa explícito). É o comportamento comum em plataformas brasileiras e não deixa intervalo sem venda. A sub-pergunta "lote vigente é gravado ou derivado" está na OQ-70.

### OQ-34 [negócio] Campos do lote.
- **Origem:** Dominio-31 (exceto a sub-pergunta derivado/gravado, movida para a OQ-70), Backend-6 (lote).
- **Contexto:** depende da OQ-33. Na opção A, só o primeiro lote precisa de data de início.
- **Opções:** A) nome (ex.: "1º lote"), ordem, preço, quantidade opcional, data de fim opcional; data de início de vendas só no 1º lote; B) todos os lotes com início e fim obrigatórios e quantidade opcional (combina com OQ-33 = B); C) quantidade obrigatória, sem datas.
- **Sub-perguntas:** tamanho do nome do lote? Nome ou número?
- **Recomendação:** A, nome com 1 a 50 caracteres (a confirmar).

### OQ-35 [negócio] Pode haver mais de um lote vigente no mesmo setor ao mesmo tempo?
- **Origem:** Dominio-32.
- **Contexto:** algumas plataformas vendem "promocional" e "regular" em paralelo.
- **Opções:** A) não; no máximo um lote vigente por setor da sessão; B) sim.
- **Recomendação:** A. Lotes paralelos são, na prática, tipos de ingresso, outro conceito.

### OQ-36 [negócio] Como a quantidade dos lotes se relaciona com a capacidade do setor?
- **Origem:** Dominio-33, Backend-6 (quantidade obrigatória; soma pode passar da capacidade).
- **Opções:** A) todos os lotes, exceto o último, têm quantidade; o último fica com o restante; a soma das quantidades informadas precisa ser menor que a capacidade; B) a soma precisa ser igual à capacidade; C) livre; a capacidade do setor é o teto real e a quantidade do lote só dispara a virada.
- **Recomendação:** A. O setor inteiro é vendável sem exigir conta exata do produtor.

### OQ-37 [negócio] Quando um lote vira por data, os ingressos não vendidos dele passam para o próximo?
- **Origem:** Dominio-34.
- **Contexto:** só tem efeito quando houver venda (Fase 4/5), mas muda o significado de "quantidade do lote".
- **Opções:** A) sim, a sobra passa para o próximo lote, ao preço do próximo; B) não, a sobra se perde; C) adiar a decisão para a Fase 4/5.
- **Recomendação:** A. A capacidade do setor não diminui, e fechar agora deixa o contrato estável.

### OQ-38 [negócio] Em setor de assento marcado, o lote vale para qualquer assento?
- **Origem:** Dominio-35.
- **Opções:** A) sim; o lote conta assentos vendidos no setor, qualquer que seja a posição; B) o lote é ligado a um subconjunto de filas/assentos (preço por região); C) setor marcado não tem lotes, só preço único.
- **Recomendação:** A. Preço por região se resolve criando setores diferentes.

### OQ-39 [negócio] Preço: moeda, precisão, mínimo, máximo e gratuidade.
- **Origem:** Dominio-36, Backend-7.
- **Contexto:** dinheiro em ponto flutuante gera erro de arredondamento; a Fase 5 vai calcular meia (50%) e taxa sobre esse preço (e 50% de um valor ímpar em centavos vai precisar de regra de arredondamento, assunto da Fase 5).
- **Opções:** A) só BRL, inteiro em centavos (`price_cents integer`, `priceCents` no JSON), preço maior que zero, máximo sugerido de R$ 100.000,00; B) A, mas permitindo preço zero (gratuito); C) moeda por evento.
- **Recomendação:** A. Ingresso gratuito tem regras próprias (checkout sem pagamento) da Fase 5. O preço cadastrado é o da **inteira**. O máximo é sugestão. A representação em centavos é consenso técnico das áreas.

### OQ-40 [negócio] O preço precisa crescer de um lote para o seguinte?
- **Origem:** Dominio-37.
- **Opções:** A) não validar; B) o lote seguinte precisa ter preço maior ou igual ao anterior.
- **Recomendação:** A. Nenhuma fonte exige.

### OQ-41 [negócio] Período de vendas da sessão.
- **Origem:** Dominio-38, Backend-6 (fim de venda do lote pode passar do início da sessão?).
- **Contexto:** sem venda na Fase 2, "vendas abertas" é só status exibido; a partir da Fase 5 decide se a compra é aceita.
- **Opções:** A) vendas começam no início do 1º lote e terminam no início da sessão; a data de fim de um lote não pode passar do início da sessão; B) o produtor define o fim das vendas (menor ou igual ao início da sessão); C) A + vendas só abrem depois da publicação, mesmo que o 1º lote tenha começado antes.
- **Recomendação:** C. "Publicar é o que expõe à venda" evita venda de evento em rascunho.

### OQ-42 [negócio] Meia-entrada, cota legal, taxa de conveniência e limite por CPF ficam totalmente fora da Fase 2?
- **Origem:** Dominio-39.
- **Contexto:** são da Fase 5 (`roadmap.md:16`). A Lei 12.933/2013 (Decreto 8.537/2015) assegura meia-entrada em 40% dos ingressos de cada evento, com entendimento do MP-CE de que vale por setor (R-19). Parte disso pode virar configuração do Catalog.
- **Opções:** A) totalmente fora; nenhum campo agora; a Fase 5 decide onde a configuração vive; B) criar já os campos no Catalog, sem uso.
- **Recomendação:** A. Campo sem regra é suposição sobre a Fase 5.

### Bloco N7 — Ciclo de vida

### OQ-43 [negócio] Quais estados o evento tem?
- **Origem:** Dominio-40.
- **Contexto:** "encerrado" depende só da passagem do tempo (R-10). Como os estados dependentes do relógio são calculados é a OQ-70.
- **Opções:** A) Rascunho → Publicado (→ Cancelado, se a OQ-47 incluir); "encerrado" é **derivado** da data da última sessão, sem estado gravado; B) Rascunho, Publicado, Cancelado e Encerrado gravados, com a passagem para Encerrado feita por um scheduler do write-service (como a expiração de hold, regra 8); C) sem rascunho: o evento nasce publicado.
- **Recomendação:** A. Ensina a diferença entre fato de negócio (publicar, cancelar) e estado derivado do relógio.

### OQ-44 [negócio] O que é exigido para publicar?
- **Origem:** Dominio-41, Backend-6 (publicação).
- **Opções:** A) campos obrigatórios do evento preenchidos; pelo menos uma sessão futura; cada sessão com pelo menos um setor ativo; cada setor ativo com pelo menos um lote; B) só pelo menos uma sessão; C) nenhum pré-requisito.
- **Recomendação:** A. Todo evento visível na vitrine fica vendável quando houver venda. É a invariante que justifica a fronteira do agregado (OQ-60).

### OQ-45 [negócio] A publicação pode ser agendada?
- **Origem:** Dominio-42.
- **Opções:** A) só imediata; B) agendada para data/hora (exige scheduler).
- **Recomendação:** A. O momento em que as vendas abrem já é controlado pelo 1º lote (OQ-41).

### OQ-46 [negócio] Um evento publicado pode voltar a rascunho (despublicar)?
- **Origem:** Dominio-43.
- **Opções:** A) não; depois de publicado, só cancelamento (se houver); B) sim, enquanto não houver venda (bloqueado com venda a partir da Fase 5); C) sempre.
- **Recomendação:** A. Menos estados e nenhuma regra que dependa de venda.

### OQ-47 [negócio] Cancelar evento entra na Fase 2?
- **Origem:** Dominio-44, Backend-1 (opção D).
- **Contexto:** o cancelamento com consequências (reembolso, compradores) é da Fase 7 (`roadmap.md:18`). Na Fase 2 seria só um estado.
- **Opções:** A) sim; o evento cancelado sai da vitrine e a página continua acessível com aviso "Cancelado"; B) sim; continua na vitrine com selo "Cancelado" até a última sessão; C) não; cancelamento entra na Fase 7.
- **Recomendação:** C. Na Fase 7 o cancelamento ganha os efeitos que o tornam interessante (evento compensatório). Para corrigir erros, há a exclusão de rascunho (OQ-49).

### OQ-48 [negócio] Cancelar ou remarcar uma sessão individual entra na Fase 2?
- **Origem:** Dominio-45, Backend-1 (opção D).
- **Opções:** A) não; fica com o cancelamento (Fase 7); B) cancelar sessão entra; C) remarcar (mudar data/local de sessão publicada) entra.
- **Recomendação:** A.

### OQ-49 [negócio] O que pode ser excluído?
- **Origem:** Dominio-46, Backend-1 (opção C), Frontend-12 (opção C).
- **Opções:** A) evento em rascunho pode ser descartado (sai do write e dos read models); evento publicado nunca; sessão, setor e lote podem ser removidos enquanto o evento está em rascunho; local pode ser excluído se nenhuma sessão o usa; B) nada é excluído; C) tudo pode ser excluído.
- **Recomendação:** A. Corrige erro de cadastro sem apagar histórico do que já foi público.

### Bloco N8 — Edição depois da publicação

### OQ-50 [negócio] O que pode ser editado depois de publicar?
- **Origem:** Dominio-48, Backend-1 (opção D), Frontend-12.
- **Contexto:** na Fase 2 não há venda, mas o Inventory (Fase 4) vai herdar o que for permitido agora (R-16).
- **Opções:** A) tudo editável na Fase 2; as restrições entram na Fase 4/5; B) restrições definitivas já: textos, imagem, categoria e classificação editáveis; sessões, setores ativos e lotes novos podem ser adicionados; **não** se altera data nem local de sessão publicada (seria remarcação, OQ-48); **não** se desativa setor nem se altera layout ou capacidade; **não** se altera preço nem quantidade de lote já iniciado ou passado; lotes futuros são editáveis e removíveis; C) nada editável depois de publicar.
- **Recomendação:** B. As regras não dependem de venda, ficam estáveis quando o Inventory chegar e ainda permitem corrigir o que não afeta quem compraria.

### OQ-51 [negócio] Sessão adicionada a um evento já publicado nasce publicada?
- **Origem:** Dominio-49.
- **Opções:** A) sim; ao ser adicionada a evento publicado, a sessão precisa já cumprir os pré-requisitos (setor ativo com lote) e aparece na hora; B) a sessão tem estado próprio (rascunho/publicada) e é publicada separadamente, com os mesmos pré-requisitos da OQ-44.
- **Recomendação:** B. Permite montar a sessão aos poucos sem expor uma sessão incompleta.

### Bloco N9 — Vitrine e página do evento

### OQ-52 [negócio] A vitrine lista eventos ou sessões?
- **Origem:** ReadSide-2.
- **Contexto:** um evento pode ter várias sessões. Um card por evento ou por sessão define a granularidade do `event_listing` e a ordenação por data.
- **Opções:** A) um card por evento, com as datas resumidas (ex.: "3 datas" ou a próxima data), e a página do evento lista as sessões; B) um card por sessão.
- **Recomendação:** A. Padrão de sites de ingresso; um documento por evento; a "próxima data" é calculada na query (OQ-70).

### OQ-53 [negócio] O que aparece na vitrine e na página pública, e quando some?
- **Origem:** Dominio-47, Dominio-50 (parte "o que entra"), ReadSide-3, Frontend-6.
- **Contexto:** depende do ciclo de vida (OQ-43). "Sessão passada" muda com o tempo, sem evento, então não pode ser decidida pelo projector (R-10).
- **Opções:**
  - (a) Estado: A) só eventos publicados com ao menos uma sessão futura; B) todos com ao menos uma sessão futura (sem publicação); C) todos, inclusive rascunhos; D) publicados e cancelados (com selo).
  - (b) Sessão que já começou: i) some da página; ii) aparece como encerrada; iii) continua igual.
  - (c) Quando o evento sai da vitrine: 1) quando a última sessão começa; 2) quando a última termina (exige término, OQ-29); 3) nunca, só vai para o fim da ordenação.
  - (d) Página de evento encerrado: x) continua acessível pela URL com "Evento encerrado"; y) 404.
  - (e) Página de evento não visível (rascunho) na rota pública: p) 404; q) devolve com indicador.
- **Recomendação:** (a) A, ou B se não houver publicação; (b) ii; (c) 1; (d) x; (e) p. Filtros por tempo sempre calculados na query.

### OQ-54 [negócio] O que o card da vitrine mostra?
- **Origem:** Frontend-5.
- **Contexto:** depende dos campos do evento (OQ-22) e do que o `event_listing` desnormaliza.
- **Opções:** A) nome do evento, nome do local + cidade, data/hora da próxima sessão (e "+N sessões" se houver mais) e "a partir de R$ X" (OQ-55); B) A + imagem; C) só nome, local e data.
- **Recomendação:** A, mais a imagem se OQ-25 = A (URL externa não traz upload). Mostra o valor da desnormalização (local e preço dentro do documento do evento).

### OQ-55 [negócio] Qual preço a vitrine mostra?
- **Origem:** Dominio-51, ReadSide-4 (parte vitrine), Frontend-5 (parte preço).
- **Opções:** A) "a partir de R$ X", com X = menor preço entre os lotes **vigentes agora**, em todas as sessões futuras e setores ativos; B) menor preço entre todos os lotes ainda não encerrados (vigentes ou futuros); C) menor preço entre todos os lotes cadastrados, sem considerar vigência; D) não mostrar preço na vitrine.
- **Recomendação:** A, sem taxa de conveniência (Fase 5). Como "vigente agora" muda com o relógio, é calculado na query (OQ-70); ordenar a vitrine por preço vigente fica caro nesse modelo, por isso a ordenação por preço não é recomendada na OQ-57.

### OQ-56 [negócio] O que a página do evento mostra de setores e lotes?
- **Origem:** Dominio-52, ReadSide-4 (parte página), Frontend-8 (parte exibição).
- **Contexto:** disponibilidade e "esgotado" são da Fase 4.
- **Opções:** A) por sessão e setor ativo, só o lote vigente (nome e preço); sem lote vigente, "vendas a partir de dd/mm" ou "vendas encerradas"; B) por setor, todos os lotes com datas, preços e selo (encerrado, vigente, em breve); C) só setores e preço vigente, sem nome do lote.
- **Divergência entre áreas:** Domínio recomenda A (é o que o comprador precisa; histórico de lotes é informação do produtor). Frontend recomenda B (mostrar a sequência ensina a virada de lote).
- **Recomendação (consolidada):** A na página pública e a sequência completa com selos na área do produtor (se OQ-1 = A). Atende o comprador e preserva a visualização didática da virada.

### OQ-57 [negócio] Busca, filtros e ordenação da vitrine.
- **Origem:** Dominio-50 (filtros e busca), ReadSide-5, ReadSide-6 (parte "se haverá busca"), Frontend-7 (busca, filtros, ordenação).
- **Contexto:** `event_listing` serve "vitrine e busca" (`overview.md:97`), sem definição. Cada filtro vira índice e parâmetro de `ListEvents`; filtro de data precisa de fuso (OQ-13). O estado de busca/filtro fica na URL (`useSearchParams`), não no Zustand.
- **Opções:**
  - Busca: a) nenhuma; b) texto no título; c) título + nome do local/cidade.
  - Filtros: i) cidade; ii) intervalo de datas; iii) categoria (exige OQ-23 = A); iv) local; v) nenhum.
  - Ordenação padrão: 1) próxima sessão mais cedo primeiro; 2) mais recentes cadastrados; 3) alfabética. Ordenação escolhível pelo usuário: s) não; t) sim (data e nome).
- **Divergência entre áreas:** Domínio recomenda busca b + filtros i e iii; ReadSide recomenda filtros i e ii, e busca só se o usuário quiser; Frontend recomenda busca b + filtro i. As três recomendam ordenação 1, fixa.
- **Recomendação (consolidada):** busca b; filtros i e iii (iii só se OQ-23 = A); ordenação 1 fixa (s). Intervalo de datas (ii) fica de fora salvo pedido do usuário, porque depende do fuso e não acrescenta lição nova de índice. A busca por título também ajuda os E2E a achar o evento criado.

### OQ-58 [negócio] Paginação da vitrine: forma e tamanho de página.
- **Origem:** ReadSide-7, Frontend-7 (paginação).
- **Contexto:** a vitrine precisa de limite. Offset é mais simples e combina com `$text` (ordenação por score dificulta keyset); cursor (keyset) é mais estável sob escrita concorrente. O tamanho de página é um valor e precisa vir do usuário.
- **Opções:** (forma na API) A) offset: `page` e `pageSize`, resposta com `items`, `page`, `pageSize`, `total`; B) cursor opaco + `limit`, resposta com `items` e `nextCursor`; C) sem paginação nesta fase. (UI) x) páginas numeradas; y) "carregar mais" (`useInfiniteQuery`). (tamanho) valor do usuário; sugestão do ReadSide: padrão 20, máximo 50.
- **Divergência entre áreas:** ReadSide recomenda offset (A); Frontend recomenda "carregar mais" com cursor (B + y).
- **Recomendação (consolidada):** A na API + y na UI (`useInfiniteQuery` funciona sobre `page`), com o tamanho definido pelo usuário. Keyset pode ser exercitado na Fase 9.

### OQ-59 [negócio] A página do evento tem botão de compra nesta fase?
- **Origem:** Frontend-9.
- **Contexto:** compra só existe a partir das Fases 4 e 5.
- **Opções:** A) sem botão; B) botão desabilitado "Vendas em breve"; C) botão que leva a uma página "em construção".
- **Recomendação:** A. O botão entra junto com o `HoldSeats` na Fase 4.

### Bloco T1 — Técnicas que dependem de respostas de negócio

Levar depois dos blocos N. As OQ-63, 65, 72, 73, 74 e 75 têm recomendação óbvia uma vez respondidas as dependências e podem ir em lote; as demais pedem discussão.

### OQ-60 [técnica] Qual é a fronteira dos agregados do Catalog?
- **Origem:** Dominio-53, Backend-2, ReadSide-8 (opção C).
- **Depende de:** OQ-9, OQ-14, OQ-16, OQ-28, OQ-32, OQ-44, OQ-51.
- **Contexto:** agregado = fronteira de consistência, unidade de concorrência (uma coluna `version`) e, pela regra 5, unidade de ordem no Kafka. A invariante de publicação (OQ-44) cruza evento, sessões, setores e lotes. O Catalog tem pouca disputa (`overview.md:53`). Read-your-writes usa a versão do agregado (regra 7). O agregado de Inventory por sessão + setor é de outro contexto e não precisa coincidir.
- **Opções:** A) dois agregados: `Venue` (com a planta) e `Event` (com sessões, setores da sessão e lotes como entidades filhas); B) três: `Venue`, `Event`, `Session` (com setores e lotes); C) um agregado por entidade.
- **Consequências:** A: ordem total dos eventos de um evento; um documento da vitrine por agregado (só o local é dado externo); `min_version` usa a versão do evento; custo: agregado inteiro carregado a cada command e qualquer alteração conflita com outra no mesmo evento (com um produtor, quase nunca). B: menos contenção, mas sessão e evento chegam fora de ordem ao projector e o documento tem duas fontes de versão (R-7, R-8). C: invariantes viram checagens entre agregados e o projector junta cinco fontes.
- **Recomendação:** A (consenso das três áreas). A cópia da planta para a sessão (OQ-16 = A) lê o `Venue` no PostgreSQL, dentro do contexto, sem ferir a regra 1. O tamanho do agregado é controlado pelos limites (OQ-21, OQ-31).

### OQ-61 [técnica] Commands e eventos: orientados a tarefa ou CRUD, conteúdo do payload e nomes.
- **Origem:** Dominio-54, Backend-10 (parte granularidade).
- **Depende de:** OQ-2, OQ-14, OQ-60.
- **Contexto:** o overview chama o Catalog de "quase CRUD" (`overview.md:53`), mas eventos como a publicação carregam significado que o Inventory vai consumir. O read side nunca consulta o PostgreSQL: tudo o que a vitrine e a página mostram precisa estar nos eventos (R-25). As parciais usaram nomes diferentes para as mesmas operações.
- **Opções (estilo):** A) transições e mudanças com significado têm command e evento próprios (`PublishEvent`, adicionar sessão, adicionar lote ...); campos descritivos agrupados (`UpdateEventDetails`, `UpdateVenueDetails`); B) CRUD puro (`UpdateEvent` com o agregado inteiro, `EventUpdated`); C) um command por campo.
- **Opções (payload):** a) um evento por command, com o estado completo da entidade afetada (ex.: o evento de sessão traz todos os campos da sessão; o de lote traz todos os campos do lote e os IDs de sessão e setor); b) eventos magros, só com o que mudou; c) um "EventChanged" com o estado completo do agregado a cada mudança.
- **Opções (nomes):** n1) vocabulário da parcial Domínio: `CreateVenue`/`VenueCreated`, `AddSession`/`SessionAdded`, `SetSessionSectorActive`, `AddBatch`/`BatchAdded`; n2) vocabulário da parcial Backend: `RegisterVenue`/`VenueRegistered`, `ScheduleSession`/`SessionScheduled`, `AddSector`/`SectorAdded`, `AddBatch`/`BatchAdded`. (O par `AddSector` x `SetSessionSectorActive` também depende de OQ-14.)
- **Recomendação:** A + a (consenso). Para os nomes, verbos que revelam a intenção de negócio (`ScheduleSession`, `RegisterVenue`) onde o glossário não tiver termo melhor; a lista final entra no Spec a partir das respostas de negócio.

### OQ-62 [técnica] Como o read side obtém os dados do local, que é outro agregado?
- **Origem:** Backend-10 (parte "dado do local na sessão"), ReadSide-8 (opções A e B).
- **Depende de:** OQ-9, OQ-10, OQ-16, OQ-28, OQ-60; e de OQ-2 (se há edição de local, há fan-out).
- **Contexto:** se o documento mostra nome/cidade do local e o local é outro agregado, o evento de sessão pode chegar antes do evento de criação do local (R-7). Tratar isso como lacuna gera crash loop.
- **Opções:** A) **lookup no projector + merge comutativo**: o evento de sessão leva só `venueId`; o projector mantém uma coleção interna de locais (alimentada pelos eventos do `Venue`); se a referência ainda não chegou, grava placeholder (`venue: { id, pending: true }`) e completa quando o local chegar (`updateMany` com guarda de versão); queries públicas ignoram documentos incompletos; B) **event-carried state transfer**: o evento de sessão leva uma cópia dos campos do local exibidos, lida do PostgreSQL no command; mudança no local faz fan-out com guarda de versão do local; acopla o payload às necessidades da tela; C) tratar referência ausente como lacuna (descartável: crash loop).
- **Recomendação:** A (consenso Backend e ReadSide). Eventos enxutos e sem viés de tela, uma única fonte do local, resultado independente da ordem de chegada (replay seguro) e a lição mais realista de consistência eventual entre agregados. Se o usuário preferir não manter coleção auxiliar, B.

### OQ-63 [técnica] Semântica da versão num agregado com entidades filhas.
- **Origem:** Backend-11.
- **Depende de:** OQ-60.
- **Lote:** sim, depois da OQ-60.
- **Contexto:** regra 4 + sequência `aggregateVersion = version + 1` (`sequence.ts:4-14`). No Ping, um command gera um evento e soma 1.
- **Proposta:** (i) `version` só na raiz; (ii) todo command que altera qualquer filha faz o UPDATE condicional da raiz, mesmo sem mudar coluna da raiz; (iii) cada evento soma 1 e carrega a versão resultante; um command que emite N eventos soma N e devolve a última; (iv) criação gera a versão 1.
- **Opções:** A) proposta + convenção de **um evento por command** sempre que possível; B) proposta permitindo commands que emitem vários eventos; C) versão por entidade filha.
- **Recomendação:** A. (ii) impede duas transações de alterar o mesmo agregado sem conflito (R-22); C quebra a ideia de agregado como unidade de consistência.

### OQ-64 [técnica] A versão esperada vem do cliente nos commands de edição?
- **Origem:** Backend-12 (relacionada ao risco de form com read model atrasado da parcial Frontend).
- **Depende de:** OQ-2, OQ-50.
- **Contexto:** no Ping a versão esperada é a lida no handler (`increment-ping.handler.ts:14`): protege contra transações simultâneas, mas não contra o produtor que editou um formulário com dado velho (lost update).
- **Opções:** A) commands de edição exigem `expectedVersion` no corpo (divergência → 409); commands que só adicionam filhos usam a versão lida no servidor; B) todos usam a versão lida no servidor (como o Ping); C) todos exigem `expectedVersion`; D) A, mas com `If-Match` em vez do corpo.
- **Recomendação:** A se houver edição: concorrência otimista ponta a ponta (a UI mostra a versão, o servidor rejeita se mudou), ligando as regras 4 e 7. Corpo em vez de `If-Match` para o hash da idempotência cobrir a versão. Sem edição, B.

### OQ-65 [técnica] O que o command devolve quando cria uma entidade filha?
- **Origem:** Backend-13.
- **Depende de:** OQ-60.
- **Lote:** sim, depois da OQ-60.
- **Contexto:** regra 2: só ack, ID e versão. Com OQ-60 = A, criar sessão gera um ID novo, mas a versão é do `Event`. O web precisa do ID da sessão para cadastrar setores e do ID + versão do evento para o `min_version`.
- **Opções:** A) `{ id: <agregado>, version, entityId: <filha> }` (novo `EntityCommandAcceptedSchema`, extensão do `CommandAcceptedSchema`); B) `{ id: <filha>, version }` (ambíguo); C) o cliente gera o uuid v7 da filha e envia no corpo.
- **Recomendação:** A. `id` + `version` sempre do agregado (o par do `min_version`); C contraria a decisão OQ-17 da Fase 1 (IDs gerados na aplicação).

### OQ-66 [técnica] Um read model para vitrine e página do evento, ou dois?
- **Origem:** ReadSide-1.
- **Depende de:** OQ-52 a OQ-56.
- **Contexto:** `overview.md:97` só lista `event_listing`; o ADR 0005:11 fala em "página do evento com sessões e setores embutidos". A vitrine quer resumo e índices; a página quer a árvore completa.
- **Opções:** A) só `event_listing`, com a árvore embutida, e projeção de campos na query; B) `event_listing` (resumo indexado) + `event_detail` (árvore completa, lido por `_id`), atualizados na mesma transação do projector; C) só `event_detail`, com a vitrine agregando em tempo de query.
- **Recomendação:** B. "Um documento por tela", índices da vitrine sem o peso da árvore, e mostra o mesmo evento de domínio alimentando vários read models. Exige registrar `event_detail` no `docs/architecture/overview.md` (fora do SDD, feito na implementação).

### OQ-67 [técnica] Controle de sequência quando um documento junta vários agregados (ou um agregado alimenta vários documentos).
- **Origem:** ReadSide-9.
- **Depende de:** OQ-60, OQ-62, OQ-66.
- **Contexto:** hoje a sequência usa o `version` do próprio documento (`ping.projection.ts:55-57`, `sequence.ts:8-14`) (R-6).
- **Opções:** A) coleção `aggregate_versions` no projector (`_id = aggregateId`, `aggregateType`, `version`), lida e atualizada na mesma transação; a decisão `apply`/`already-applied`/`gap` é por agregado; os documentos guardam só a versão usada pelo `min_version`; B) mapa `sourceVersions: { [aggregateId]: n }` dentro de cada documento; C) manter por documento e exigir um único agregado de origem por documento.
- **Recomendação:** A. Separa infraestrutura do projector de read model, funciona com fan-out e com vários read models, e mantém a semântica de lacuna da Fase 1 (ADR 0009:40) dentro de cada agregado. O replay apaga `aggregate_versions` junto com `processed_events`.

### OQ-68 [técnica] Qual versão o `min_version` compara num documento composto, e como o web espera?
- **Origem:** ReadSide-10, Frontend-14.
- **Depende de:** OQ-60, OQ-63, OQ-65.
- **Contexto:** o command devolve `{ id, version }` do agregado que alterou (R-8). O web precisa saber o que esperar antes de navegar.
- **Opções:** A) `GET /api/catalog/events/:id?min_version=n` compara com a versão do agregado raiz do evento (só funciona se sessões, setores e lotes forem parte dele, OQ-60 = A); B) parâmetro extra com o agregado de referência (`?aggregate_id=X&min_version=n`), comparado com versões por agregado (`sourceVersions` ou `aggregate_versions`); C) cada agregado tem leitura própria com `min_version` (ex.: `GET /api/catalog/venues/:id?min_version=n`), e a página do evento só aceita a versão do evento; D) o web refaz a query até o item aparecer, sem versão (só serve para criação); E) invalida e refaz sem garantia. (Listas) i) `List*` não aceita `min_version`: o web espera na query por ID e depois invalida a lista; ii) `List*` aceita `min_version` de um agregado.
- **Divergência entre áreas:** ReadSide recomenda A se OQ-60 = A, senão C. Frontend recomenda B, senão C.
- **Recomendação (consolidada):** com OQ-60 = A, A para tudo o que é do evento + C para o `Venue` (leitura própria do local com `min_version`) + i. As duas áreas convergem nesse cenário.

### OQ-69 [técnica] Quais read models e queries servem a área do produtor?
- **Origem:** ReadSide-11 (parte técnica), Frontend-13 (parte leitura).
- **Depende de:** OQ-1, OQ-4, OQ-66.
- **Contexto:** a área do produtor precisa listar os próprios eventos (com rascunhos, se OQ-4 = A), abrir um evento para gestão e listar locais para escolher na sessão.
- **Opções:** A) `ListOrganizerEvents` servido pelos mesmos `event_listing`/`event_detail` com campo `status` (a vitrine filtra por publicado); `ListVenues` servido pela coleção de lookup de locais da OQ-62 (ou outra); B) read models próprios do produtor (ex.: `organizer_events` para a lista, mais `event_detail` com status para a gestão, e uma lista de locais), com o `event_listing` contendo só publicados; C) não há leitura do produtor (se OQ-4 = C).
- **Divergência entre áreas:** ReadSide recomenda A (menos projeções). Frontend recomenda B ("um read model por tela"; a vitrine pública nunca carrega dado de rascunho).
- **Recomendação (consolidada):** B. É coerente com a OQ-66 B e com a lição "um documento por tela", e mantém o índice da vitrine livre de rascunhos. O custo é mais um handler de projeção por evento.

### OQ-70 [técnica] Estados que dependem do relógio: derivados ou gravados, e onde são calculados?
- **Origem:** Dominio-31 (sub-pergunta "lote vigente derivado ou gravado"), Frontend-8 (parte cálculo), ReadSide-3 (filtros por tempo), ReadSide-4 (parte técnica).
- **Depende de:** OQ-33, OQ-41, OQ-43, OQ-53, OQ-55, OQ-56.
- **Contexto:** "lote vigente", "vendas abertas", "sessão passada", "próxima sessão" e "evento encerrado" mudam com o tempo, sem evento (R-10). Se a OQ-43 escolher "Encerrado" gravado por scheduler, esta OQ trata só dos demais estados.
- **Opções:** A) derivados e calculados no read-service, na query, com o `now` do servidor (o documento guarda as janelas e as datas; o cálculo é função pura documento + `now`); B) derivados e calculados no web com o relógio do navegador (via `src/lib/clock.ts`, por causa do `react-hooks/purity`); C) gravados no write side: um scheduler varre o PostgreSQL e emite commands/eventos (ex.: `BatchActivated`), como a expiração de hold (regra 8); D) gravados pelo projector no momento da projeção (descartada: congela o estado e torna o replay não determinístico).
- **Recomendação:** A (consenso ReadSide e Frontend; Domínio recomenda "derivado, nunca gravado pelo Catalog"). Uma fonte de "agora" (o servidor), front sem regra de negócio, projeção determinística. C seria uma boa lição, mas cria eventos que não são fatos de negócio.

### OQ-71 [técnica] Como implementar a busca textual da vitrine?
- **Origem:** ReadSide-6 (parte técnica).
- **Depende de:** OQ-57 (cai se não houver busca).
- **Contexto:** MongoDB 8.0.34 tem `$text` (insensível a caixa e acento na versão 3, `default_language: 'portuguese'` com stemming, um índice por coleção, sem prefixo). MongoDB Search na Community exige 8.2+ e `mongot`, em public preview (R-27).
- **Opções:** A) `$text` com índice de texto em português sobre os campos da OQ-57; B) regex ancorada num campo normalizado (`searchText` sem acento, minúsculo): permite prefixo, mas não usa índice de forma eficiente para substring; C) MongoDB Search com `mongot` (upgrade para 8.2+).
- **Recomendação:** A. Simples, nativo e ensina índice de texto; busca via GET com query string, sem exceção no Nginx. C fica fora (preview, outro serviço).

### OQ-72 [técnica] Tabelas, nomes, chaves e persistência das entidades filhas.
- **Origem:** Backend-16.
- **Depende de:** OQ-14, OQ-60.
- **Lote:** sim, depois da OQ-60.
- **Contexto:** padrão atual: `diagnostics_pings`, UPDATE condicional à mão, Data Mapper. Validações que dependem de outro agregado do mesmo contexto leem o PostgreSQL na mesma transação (regras 1 e 10).
- **Opções (nomes):** A) prefixo do contexto no schema `public` (`catalog_venues`, `catalog_events`, `catalog_sessions`, `catalog_sectors`, `catalog_batches`); B) schema PostgreSQL por contexto (`catalog.venues` ...), com a `outbox` em `public`.
- **Opções (integridade):** a) FKs entre tabelas do contexto (sessão → evento, setor → sessão, lote → setor, sessão → local) com `ON DELETE RESTRICT`; b) sem FKs.
- **Opções (filhos no repositório):** x) raiz com UPDATE condicional; filhos com `INSERT ... ON CONFLICT (id) DO UPDATE` e `DELETE` dos que saíram, na mesma transação; y) apaga e reinsere todos os filhos; z) relações TypeORM com `cascade` e `save()`.
- **Recomendação:** A + a + x. Segue a convenção existente; FKs pegam bug sem custo; x deixa o SQL explícito, como o UPDATE condicional (ADR 0009), enquanto z esconde o que é gravado (o projeto evitou `@VersionColumn` pelo mesmo motivo).

### OQ-73 [técnica] Como o produtor seed chega ao handler, e o que o web envia?
- **Origem:** Backend-19, Frontend-13 (parte identidade).
- **Depende de:** OQ-5, OQ-6.
- **Lote:** sim, depois das OQ-5 e OQ-6.
- **Contexto:** a Fase 3 vai trocar o seed pelo usuário do JWT.
- **Opções (write-service):** A) `SEED_ORGANIZER_ID` em `config.ts` (Zod, default com um uuid fixo documentado) + provider `CurrentOrganizer` (`src/shared/actor/`) que o controller usa para preencher o command; sem tabela de produtores; B) tabela `catalog_organizers` com uma linha inserida por migration; C) constante em `libs/contracts`.
- **Opções (web):** a) o web não envia nada; o write-service atribui ao seed; b) o web envia um `organizerId` fixo no corpo; c) header `X-Organizer-Id` fixo.
- **Recomendação:** A + a. Um ponto único a trocar na Fase 3, sem mudar o corpo dos commands; B cria no Catalog um cadastro da Identity; C expõe detalhe do write-service no contrato público.

### OQ-74 [técnica] Entrada de preço no formulário de lote.
- **Origem:** Frontend-18.
- **Depende de:** OQ-39 (representação), OQ-1.
- **Lote:** sim, se OQ-39 = centavos.
- **Contexto:** o usuário digita no formato brasileiro (`1.234,56`).
- **Opções:** A) `Input` de texto com `inputMode="decimal"` e prefixo "R$" (`Input Group`), convertido para centavos num schema de formulário que termina no schema do contrato (`.pipe`); B) máscara com biblioteca nova (ex.: `react-number-format`); C) campo em centavos.
- **Recomendação:** A. Sem dependência nova; conversão num ponto testável; o schema do contrato continua sendo a validação final.

### OQ-75 [técnica] Entrada de data/hora (sessão e janelas de lote).
- **Origem:** Frontend-19.
- **Depende de:** OQ-13 (fuso), OQ-29, OQ-34, OQ-1.
- **Lote:** sim, depois da OQ-13.
- **Contexto:** o Date Picker do shadcn usa `Calendar` + `Popover` e traz dependência de calendário; não há biblioteca de datas instalada.
- **Opções:** A) `<input type="datetime-local">` nativo, interpretado no fuso decidido na OQ-13 e convertido para o formato do contrato; B) Date Picker do shadcn + campo de hora; C) campos nativos separados de data e hora.
- **Recomendação:** A. Acessível, sem dependência, fácil no Playwright.

### OQ-76 [técnica] Como o seed de demonstração é executado?
- **Origem:** dependência apontada pela parcial Domínio (Dominio-5, tabela de dependências: "mecanismo do seed de catálogo, via commands") sem OQ correspondente nas parciais Backend e Infra; registrada aqui para não se perder.
- **Depende de:** OQ-8 (cai se OQ-8 = B), OQ-1.
- **Contexto:** o seed precisa passar pela outbox (regra 6). A retenção das chaves de idempotência é de 24 h, então rodar o mesmo seed toda vez que a stack sobe pode duplicar dados depois desse prazo.
- **Opções:** A) script sob demanda (ex.: `pnpm seed:catalog`) que chama a API pelo gateway com `Idempotency-Key`, rodado manualmente uma vez; B) serviço one-shot no compose que roda o script a cada `up` (exige checagem de "já semeado" para não duplicar); C) comando CLI dentro do write-service que despacha os commands no `CommandBus`, sem HTTP; D) migration que insere linhas e eventos na outbox (descartável: migration emitindo eventos de domínio mistura schema com dados).
- **Recomendação:** A. Exercita o pipeline inteiro como um cliente real, não roda sozinho (sem duplicação) e não mexe no compose. A checagem automática de B pode vir depois.

### Bloco T2 — Técnicas independentes, recomendação óbvia (aprovação em lote)

### OQ-77 [técnica] Como tornar a infraestrutura compartilhada do write-service usável por dois contextos?
- **Origem:** Backend-9.
- **Contexto:** R-2 e R-3.
- **Opções (módulo):** A) `SharedModule` (`src/shared/shared.module.ts`) com `TypeOrmModule.forFeature([OutboxEntity, IdempotencyKeyEntity])`, `TransactionContext`, `OutboxWriter`, `IdempotencyService`, `IdempotencyCleanupJob`, exportando os três primeiros; importado por `DiagnosticsModule` e `CatalogModule`; B) o mesmo com `@Global()`; C) cada contexto registra os seus (duplica o cron).
- **Opções (outbox):** a) `OutboxWriter.append(boundedContext, envelopes)` genérico, recebendo envelopes já montados e validados; cada contexto tem um mapper (`ping-event.mapper.ts`, `catalog-event.mapper.ts`) que converte o evento de domínio no envelope `V1`; b) registro de mappers por classe de evento, preenchido no `onModuleInit`; c) os eventos de domínio sabem gerar o próprio envelope (`toEnvelope()`).
- **Recomendação:** A + a. Importação explícita mostra quem depende do compartilhado; o `OutboxWriter` fica sem conhecimento de domínio; c mistura domínio com formato de transporte.

### OQ-78 [técnica] Tópico `catalog.events`.
- **Origem:** Backend-18 (e dependência apontada pela parcial ReadSide).
- **Contexto:** R-1. Decisão da Fase 1 para `diagnostics.events`: criação explícita, 3 partições, `retention.ms=-1` (OQ-19 da Fase 1); retenção infinita permite o replay.
- **Opções:** A) mesmo padrão: `catalog.events`, 3 partições, `retention.ms=-1`, criado no `infra/kafka/create-topics.sh`; B) criar já os quatro tópicos do ADR 0004; C) outro número de partições.
- **Recomendação:** A. O conector não muda (`register-connector.sh:44-45`).

### OQ-79 [técnica] Organização de `libs/contracts` e nome do agregado "Evento" no código.
- **Origem:** Backend-17, Frontend (dependências D-Dom-8 e D-Back-4).
- **Contexto:** R-4 e R-21.
- **Proposta de arquivos:** `libs/contracts/src/catalog/constants.ts` (`BOUNDED_CONTEXT_CATALOG`, `CATALOG_TOPIC`, `VENUE_AGGREGATE_TYPE`, `EVENT_AGGREGATE_TYPE`, `CATALOG_EVENT_TYPES`, `catalogRoutes`, `CATALOG_ROUTE_TEMPLATES`), `catalog/http.ts` (requests e views), `catalog/events.ts` (schemas `V1` e `CatalogEventSchema`); `CommandAcceptedSchema` movido para `libs/contracts/src/http/command-accepted.ts`, reexportado pelo barrel (o import `@stubb/contracts` não muda).
- **Opções (nome):** A) `CatalogEvent` no código TS (e views como `EventListingView`, `EventDetailView`); `aggregateType: 'Event'` e eventos públicos seguindo o glossário (`EventCreated`, `EventPublished`); B) classe `Event` (sombreia o global do Node e do DOM); C) outro termo (`Show`, `Production`), mudando o glossário.
- **Recomendação:** proposta de arquivos + A.

### OQ-80 [técnica] Rotas, status HTTP e `Idempotency-Key` dos commands; prefixo das rotas da API.
- **Origem:** Backend-14, ReadSide-16 (parte prefixo), Frontend (dependências D-Back-1, D-Back-4, D-Back-5).
- **Contexto:** Fase 1: `POST` → `202 { id, version }`, `Idempotency-Key` obrigatório, scope = template da rota. O Nginx já separa GET de não-GET. Se houver PATCH/DELETE, o helper `api` do E2E e o `postCommand` do web precisam aceitar o método (R-38).
- **Opções (estilo):** A) orientado a tarefa, prefixo do contexto: `POST /api/catalog/venues`, `POST /api/catalog/events`, `POST /api/catalog/events/:eventId/sessions`, `POST /api/catalog/events/:eventId/sessions/:sessionId/sectors`, `POST .../sectors/:sectorId/batches`, `POST /api/catalog/events/:eventId/publish`; edição por `PATCH` no recurso, remoção por `DELETE`; queries `GET /api/catalog/events`, `GET /api/catalog/events/:id`, etc.; B) prefixo sem contexto (`/api/events`); C) REST CRUD com `PUT` do recurso inteiro; D) endpoint único `POST /api/catalog/commands` com `type`.
- **Opções (status):** a) 202 para todos, inclusive criação; b) 201 + `Location` na criação.
- **Opções (idempotência):** i) obrigatória em todos os commands do Catalog, mesmo mecanismo e 24 h; ii) opcional.
- **Recomendação:** A + a + i. Cada intenção visível na URL; rotas aninhadas carregam o ID do agregado; 202 mantém o padrão e não muda o `IdempotencyService` (R-39); ii violaria a regra 9.

### OQ-81 [técnica] Identificador do evento nas URLs (API e web): UUID ou slug?
- **Origem:** ReadSide-16 (parte identificador), Frontend-2 (opção C).
- **Contexto:** slug legível exige geração e unicidade no write side e índice único no read model, o que seria uma **regra de negócio nova** (se o usuário quiser slug, ela vira OQ de negócio).
- **Opções:** A) UUID do agregado; B) slug legível.
- **Recomendação:** A.

### OQ-82 [técnica] Contrato de erro dos commands e como o formulário mostra os erros.
- **Origem:** Backend-15, Frontend-17 (e dependência "erro de regra de negócio" da parcial Domínio).
- **Contexto:** hoje: Zod → 400 com `issues` (sem schema em `libs/contracts`), inexistente → 404, concorrência → 409, chave reusada → 422 (`domain-error.filter.ts:9-22`). O Catalog é o primeiro contexto que rejeita commands por regra de negócio (ex.: publicar sem sessão) e por referência inexistente no corpo (ex.: `venueId`).
- **Opções:** A) novo `BusinessRuleViolationError(code, message)` → 422 com `{ statusCode, error, message, code }`, `code` estável em inglês (ex.: `VENUE_NOT_FOUND`); agregado da URL inexistente → 404; referência inexistente no corpo → 422; schemas de erro (`ValidationErrorResponse` com `issues`, `BusinessRuleErrorResponse` com `code`) em `libs/contracts`; o web mapeia `issues[].path` para `setError` e `code` para mensagem PT-BR, o resto vira alerta no topo do form; B) invariante → 409, referência inexistente → 404; C) tudo 400; D) o web mostra a `message` do servidor como veio, ou mensagem genérica por status (como na Fase 1).
- **Recomendação:** A. 404 só para "o recurso da URL não existe"; 422 para "entendi, mas viola uma regra"; 409 continua só para conflito de versão; o `code` evita o web depender do texto do servidor; erro no campo certo é acessibilidade.

### OQ-83 [técnica] Topologia de consumo no projector.
- **Origem:** ReadSide-12.
- **Contexto:** R-5 e R-26.
- **Opções:** A) um grupo `projector` assinando `diagnostics.events` e `catalog.events`; schema e handlers escolhidos por `message.topic` (registro tópico → schema → handlers); B) um consumer (e grupo) por tópico no mesmo processo; o processo ainda cai inteiro no `exit(1)`; C) um serviço de projector por contexto no compose.
- **Recomendação:** A. Menor mudança; replay continua "um grupo, todos os tópicos"; isolamento por consumidor é tema da Fase 6 (`roadmap.md:17`).

### OQ-84 [técnica] Migrar a projeção do Ping para o mecanismo genérico?
- **Origem:** ReadSide-13.
- **Contexto:** o mecanismo novo (OQ-67) muda onde fica a checagem de sequência; a `PingProjection` (`ping.projection.ts:35-112`) tem a sua, com `PingIncremented` fixo (`sequence.ts:11`).
- **Opções:** A) migrar o Ping para o executor genérico (um mecanismo só; `pings` mantém `version` para o `min_version`); B) manter os dois mecanismos.
- **Recomendação:** A. As próximas fases herdam um mecanismo (ADR 0009:63); integração, E2E e replay do diagnóstico cobrem a refatoração (R-12).

### OQ-85 [técnica] Escopo do replay.
- **Origem:** ReadSide-14.
- **Contexto:** R-9.
- **Opções:** A) replay total: para o projector, `deleteMany` em todas as coleções do projector (read models, lookups, `aggregate_versions`, `processed_events`), reseta o grupo em todos os tópicos assinados, sobe o projector; listas de coleções e tópicos em constantes num lugar só; B) replay por contexto (`pnpm replay catalog`), exigindo campo de contexto em `processed_events`/`aggregate_versions`; C) A + B.
- **Recomendação:** A. Replay por projeção é tema da Fase 8.

### OQ-86 [técnica] Onde criar coleções e índices do MongoDB?
- **Origem:** ReadSide-15.
- **Contexto:** hoje no `mongo-init` (`infra/mongo/init-replica-set.js:21-27`), sem índice; `$text` falha sem índice; apps sobem depois do `mongo-init` (`docker-compose.yaml:194`, `:222`); testes de integração usam Mongo próprio.
- **Opções:** A) no `mongo-init` (declarativo, antes dos apps); testes de integração criam os índices de que dependem; B) bootstrap do projector (`createIndexes` idempotente); C) bootstrap do read-service; D) script versionado de migração do read store.
- **Recomendação:** A. Mantém o padrão e independe do replay (`deleteMany` preserva índices). Mudança de índice em volume existente exige rodar o script de novo (`createIndex` é idempotente). Dono do arquivo definido no Plan.

### OQ-87 [técnica] Cobertura E2E e de replay do read side.
- **Origem:** ReadSide-17.
- **Contexto:** a Fase 1 tem E2E de API, replay e Playwright (ADR 0009:48). A composição entre agregados é o ponto mais frágil.
- **Opções:** A) E2E de API (cadastro completo → vitrine e página via gateway com `min_version`; mensagem em `catalog.events` com key = ID do agregado) + replay total comparando `event_listing` e `event_detail` + teste de integração do projector que aplica os mesmos eventos em ordens diferentes e confere documento idêntico; B) só E2E de API e replay; C) A + E2E que força ordem entre partições.
- **Recomendação:** A. A ordem entre partições não é controlável no E2E; a comutatividade é testada na integração.

### OQ-88 [técnica] Onde ficam a vitrine e o diagnóstico nas rotas do web, e como é o layout global?
- **Origem:** Frontend-1.
- **Contexto:** R-11. Não existe layout nem página 404.
- **Opções:** A) vitrine em `/`; diagnóstico em `/diagnostico` (ou `/diagnostics`, conforme OQ-89), com link discreto no rodapé; layout raiz com header (logo → vitrine, link "Área do produtor") e `errorElement` com 404; Playwright do diagnóstico atualizado no mesmo passo; B) vitrine em `/eventos`, diagnóstico continua em `/`; C) vitrine em `/` e diagnóstico só pela URL.
- **Recomendação:** A.

### OQ-89 [técnica] Idioma das URLs do web.
- **Origem:** Frontend-2 (opções A e B).
- **Contexto:** a convenção de código é inglês, mas a URL é texto visível ao usuário. O identificador está na OQ-81.
- **Opções:** A) PT-BR: `/eventos/:eventId`, `/produtor/eventos/novo`, `/produtor/locais`; B) inglês: `/events/:eventId`, `/organizer/events/new`.
- **Recomendação:** A. O site é pt-BR; arquivos e componentes continuam em inglês.

### OQ-90 [técnica] Quem carrega os dados das telas: loaders do React Router ou TanStack Query?
- **Origem:** Frontend-3.
- **Contexto:** o router está em data mode e oferece `loader`; dois mecanismos seriam dois caches.
- **Opções:** A) só TanStack Query nos componentes; o router cuida de rotas, layout e `errorElement`; B) loaders com `queryClient.ensureQueryData` + `useQuery`/`useSuspenseQuery`; C) loaders puros com `useLoaderData`.
- **Recomendação:** A. Um cache só (o "read model do cliente" do ADR 0008).

### OQ-91 [técnica] Extrair o cliente HTTP e o read-your-writes do diagnóstico para módulos compartilhados?
- **Origem:** Frontend-4 (e o helper de espera do read-service apontado pela parcial ReadSide).
- **Contexto:** R-4.
- **Opções:** A) extrair para `apps/web/src/api/http.ts` e `apps/web/src/lib/read-your-writes.ts` (e, no read-service, um helper `pollUntil` comum); o diagnóstico passa a usá-los com o mesmo comportamento e os testes atuais passando; B) copiar para o Catalog e deixar o diagnóstico como está; C) extrair sem tocar no diagnóstico.
- **Recomendação:** A. Uma implementação do padrão de consistência eventual, testada uma vez; o diagnóstico prova que a extração não mudou nada.

### OQ-92 [técnica] Ciclo de vida da `Idempotency-Key` nos formulários.
- **Origem:** Frontend-16.
- **Contexto:** R-31. Reusar a chave com payload diferente dá 422 (RN-11 da Fase 1).
- **Opções:** A) uma chave por submit (como hoje); B) uma chave por intenção: gerada quando o formulário abre, reusada em todo reenvio com o mesmo payload, trocada depois de sucesso ou quando o payload enviado muda; C) uma chave por formulário aberto, nunca trocada.
- **Recomendação:** B. Fecha o buraco do reenvio manual e evita o 422 quando o usuário corrige um campo.

### OQ-93 [técnica] Componentes shadcn a adicionar e feedback de sucesso.
- **Origem:** Frontend-20.
- **Contexto:** R-37.
- **Opções (componentes):** A) `field`, `input-group`, `textarea`, `native-select`, `badge`, `skeleton`, `empty`, `spinner`, `alert`, `separator`, `breadcrumb` e, conforme OQ-58, `pagination`; B) A com `select` (Radix) no lugar de `native-select`; C) A + `table` para as listas do produtor.
- **Opções (sucesso):** a) status inline (`aria-live`), sem toast; b) toast.
- **Recomendação:** A + a, todos instalados de uma vez numa trilha só, antes das trilhas de tela.

### OQ-94 [técnica] Como simular a API nos testes de componente?
- **Origem:** Frontend-21.
- **Contexto:** a Fase 1 usa `vi.stubGlobal('fetch')` (`diagnostics-page.test.tsx:12-57`); o Catalog terá vários endpoints por tela.
- **Opções:** A) manter `vi.stubGlobal('fetch')` com um helper `createFakeApi` em `src/test/` que roteia por método + caminho e simula projeção atrasada; B) MSW (dependência nova); C) `vi.mock` dos módulos de `api/`.
- **Recomendação:** A. Sem dependência nova; o contrato HTTP continua testado.

### OQ-95 [técnica] Dados e host dos testes Playwright e E2E.
- **Origem:** Frontend-22 (e observação da parcial ReadSide sobre `e2e/src/support/env.ts:3`).
- **Contexto:** R-34 e R-35.
- **Opções (dados):** A) o spec do produtor cria tudo pela UI com nomes únicos (sufixo aleatório); specs de vitrine/página semeiam via API (`request` do Playwright, com `Idempotency-Key`) e acham o evento pela busca ou pela URL direta; asserções procuram o item criado, nunca a contagem total; B) tudo pela UI; C) resetar os bancos antes da suíte (conflita com o replay).
- **Opções (host):** a) default `http://127.0.0.1:8080` com override por `E2E_BASE_URL`, no Playwright do web e também no pacote `e2e`; b) só no Playwright do web; c) manter `localhost`.
- **Recomendação:** A + a.

### OQ-96 [técnica] Seletores de teste e verificação de acessibilidade.
- **Origem:** Frontend-23.
- **Opções:** A) priorizar `getByRole`/`getByLabelText` no RTL e no Playwright, `data-testid` só onde não há papel; acessibilidade verificada por essas consultas + checklist no Plan (labels, `aria-invalid`, `FieldError` anunciado, foco no primeiro campo inválido, `aria-live` no status, um `h1` por página); B) A + `@axe-core/playwright` (dependência nova); C) `data-testid` em tudo.
- **Recomendação:** A. B é boa evolução se o usuário quiser checagem automática.

### Bloco T3 — Técnica que exige valor do usuário

### OQ-97 [técnica] O que a UI faz quando a projeção demora?
- **Origem:** Frontend-15.
- **Contexto:** R-30. O cliente refaz a cada 250 ms sem limite; o servidor espera até 3 s por requisição (`get-ping.handler.ts:7`). O limite é um valor e precisa vir do usuário.
- **Opções:** A) sem limite, com "aguardando projeção" visível (`aria-live`); B) limite no cliente (valor a definir; ex.: 10 s ou 30 s); depois, "Salvo. Os dados podem demorar a aparecer." com botão "Atualizar", e o polling para; C) navegar na hora para a tela do item e mostrar aviso enquanto a versão não chega.
- **Recomendação:** B, com o valor definido pelo usuário. Mostra que o command foi aceito (a verdade está no write) mesmo quando a leitura atrasa (`overview.md:11`).

### Surgidas na escrita da Spec e do Plan (2026-10-26)

### OQ-99 [negócio] Valores do seed de demonstração que a OQ-8 não fixou
- **Origem:** escrita da Spec/Plan (planner, modo spec-plan). Afeta só RN-48, CA-54 e a T-52 do Plan.
- **Contexto:** a OQ-8 aprovada define locais, plantas, eventos, sessões, setores e lotes do seed, mas não fixa valores que os commands exigem (todos são obrigatórios ou precisam de hora): (a) a **descrição** dos quatro eventos (obrigatória, 1 a 5.000 caracteres, OQ-22); (b) a **hora** das datas dadas só como dia: "fim em D+15" (Hamlet, 1º lote da Plateia), "fim em D+20" e "fim em D+40" (Horizonte, 1º e 2º lotes da Pista) e "vendas a partir de D+10" (Riso Solto, Manaus); (c) o **início das vendas** (`salesStartsAt`, obrigatório, OQ-41) de "Horizonte Rock Festival" e de "Bolhas de Sabão", que a tabela não cita (Hamlet e Riso Solto em São Paulo dizem "a partir do momento do seed"); (d) o **nome dos lotes** de Riso Solto em Manaus ("Pista R$ 60,00 e Mezanino R$ 90,00", sem nome; o nome é obrigatório, OQ-34); (e) **em que fuso se conta o dia `D`** (dia da execução).
- **Opções:**
  - (a) A) uma frase fictícia curta por evento, escrita pelo planner no Plan; B) o usuário escreve as quatro descrições.
  - (b) A) 00:00 do dia indicado, no fuso do local; B) 23:59 do dia indicado; C) mesma hora da sessão.
  - (c) A) "a partir do momento do seed", como Hamlet; B) outra data.
  - (d) A) "Lote único" nos dois setores, como os demais setores de lote único do seed; B) outro nome.
  - (e) A) `D` = data de hoje no fuso de cada local; B) data de hoje em `America/Sao_Paulo` para todos.
- **Recomendação:** (a) A, com estas frases (fictícias, sem sugerir evento real): Hamlet: "Montagem da tragédia de Shakespeare em temporada no Teatro Aurora."; Horizonte Rock Festival: "Dois dias de rock com bandas nacionais na Arena Horizonte."; Riso Solto: a turnê: "Espetáculo de stand-up em turnê por São Paulo e Manaus."; Bolhas de Sabão: "Espetáculo infantil com música, bolhas e muita brincadeira." (b) A. (c) A. (d) A. (e) A. São as opções que menos acrescentam regra e mantêm o seed coerente com o resto da OQ-8.

## Decisões

Preenchida pelo thread principal com as respostas do usuário.

- OQ-1 → A) back-office mínimo no web: cadastrar local e planta, criar evento, sessões, setores e lotes, publicar, listar os próprios eventos (com rascunhos).
- OQ-2 → C) criação + publicação (rascunho fica fora da vitrine) + edição dos dados descritivos e remoção de sessão/setor/lote enquanto rascunho; edição pós-publicação decidida na OQ-50.
- OQ-3 → A) telas separadas por entidade ("Locais", "Meus eventos", página de gestão do evento com sessões, setores e lotes); um submit = um command, com espera pela projeção.
- OQ-4 → A) o produtor lista os próprios eventos (com rascunhos) e locais; endpoints públicos sem auth até a Fase 3, risco aceito e registrado.

O usuário aprovou integralmente ("aprovo tudo", 2026-10-26) as propostas de negócio e técnica. Os dois arquivos abaixo são **anexos normativos**: trazem os valores completos, tabelas e justificativas de cada decisão resumida aqui. Onde houve conflito entre eles, a proposta de negócio prevalece e a técnica foi realinhada (revisão 2).

- Anexo de negócio: `SDD/WORK/2026-10-26-CatalogProposta-Negocio.md` (OQ-5 a OQ-59).
- Anexo técnico: `SDD/WORK/2026-10-26-CatalogProposta-Tecnico.md` (revisão 2, OQ-60 a OQ-97).

### Negócio (OQ-5 a OQ-59)

- OQ-5 → A. Um produtor seed, identificado só por um UUID fixo, sem nome nem outros dados.
- OQ-6 → A. Todo command é executado em nome do produtor seed; `organizerId` é gravado no local e no evento; as leituras do produtor filtram por `organizerId` do seed. A validação de posse entra na Fase 3, documentada como limitação conhecida.
- OQ-7 → B. Não aparece na Fase 2.
- OQ-8 → A. Um script cria, **via commands pela API** (OQ-76), o conjunto abaixo. Datas relativas ao momento da execução (`D` = dia em que o script roda), porque sessão precisa estar no futuro (OQ-30). Horários no fuso do local. Sem imagem (a vitrine usa o placeholder por categoria; nenhuma dependência de host externo).
- OQ-9 → A. Local é cadastro próprio, criado uma vez e escolhido ao agendar cada sessão.
- OQ-10 → A. Cada produtor cadastra os próprios locais (`Venue` com `organizerId`); a lista de locais da área do produtor mostra só os dele. Nas páginas públicas, nome e endereço do local aparecem como parte do evento.
- OQ-11 → A, com o fuso da OQ-13. Só locais no Brasil.
- OQ-12 → B. Não existe capacidade do local; a capacidade total é a soma dos setores, derivada.
- OQ-13 → B, com uma regra extra: a sessão **copia o fuso do local** quando é agendada (como copia a planta, OQ-16).
- OQ-14 → A, com cópia (OQ-16 = A). A planta (setores-modelo) fica no local; ao agendar uma sessão, ela recebe uma cópia de todos os setores da planta, com IDs novos; os lotes pertencem ao setor da sessão.
- OQ-15 → variante de B, em termos de presença em vez de flag. A sessão nasce com cópia de **todos** os setores da planta. Enquanto a sessão está em Rascunho, o produtor pode **remover** um setor da sessão (os lotes dele vão junto) e **adicionar** à sessão um setor da planta que não esteja nela (nova cópia, ID novo). Capacidade e layout da cópia não são editáveis. Depois de publicada, nada muda (OQ-50).
- OQ-16 → A. A sessão copia a planta quando é agendada (e cada setor, quando adicionado à sessão). Mudanças posteriores na planta (adicionar ou remover setor-modelo) não afetam sessões existentes.
- OQ-17 → A, sem descrição nem atributos visuais. Sem edição de setor-modelo: para corrigir, remove e adiciona de novo (a cópia isola as sessões).
- OQ-18 → A, com a grade simples da OQ-19.
- OQ-19 → A. Lista ordenada de filas; cada fila tem rótulo e quantidade de assentos, numerados de 1 a N. Assento = (fila, número).
- OQ-20 → A. Fora da Fase 2, registrado como lacuna consciente.
- OQ-21 → A, com valores menores que os sugeridos no Research, para manter pequeno o agregado `Event` (carregado inteiro a cada command) e o documento `session_seat_map` da Fase 4 (limite de 16 MB).
- OQ-22 → A, com **todos os campos obrigatórios já na criação** (exceto imagem). O rascunho nunca fica com campo obrigatório vazio, e a publicação não precisa checar campos do evento.
- OQ-23 → A. Lista fixa, com código em inglês no contrato e rótulo em PT-BR no web.
- OQ-24 → A. Obrigatória, com as faixas oficiais; nenhum controle de idade na compra.
- OQ-25 → A. URL externa opcional; sem upload.
- OQ-26 → A. Sim; toda sessão tem local.
- OQ-27 → A. Fora. Cada dia de festival é uma sessão vendida separadamente.
- OQ-28 → A. Sim; o local é da sessão.
- OQ-29 → A, mais o início das vendas da OQ-41. Campos de tempo da sessão: `startsAt` (início) e `salesStartsAt` (início das vendas). Sem término e sem abertura dos portões.
- OQ-30 → A. Ao agendar, `startsAt` precisa ser posterior ao "agora" do write-service; sem limite máximo. A mesma checagem se repete ao publicar (OQ-44), porque a sessão pode ficar em rascunho até a data passar.
- OQ-31 → A, com até **50** sessões por evento (em vez de 100). Rascunho pode ter zero sessões. Duas sessões do mesmo evento não podem ter o mesmo local e o mesmo `startsAt`. Conflito de agenda do local com outros eventos não é validado.
- OQ-32 → A. Ao setor de uma sessão; cada sessão tem os próprios lotes. "Copiar lotes de outra sessão" fica fora da Fase 2 (o seed faz por script).
- OQ-33 → A (sequencial), com D explícita: na Fase 2 só a virada por data tem efeito; a virada por quantidade passa a valer quando houver venda (Fase 5).
- OQ-34 → variante de A. Nenhum lote tem data de início própria (o início vem da sessão e do lote anterior, OQ-33).
- OQ-35 → A. Não; no máximo um lote vigente por setor da sessão (decorre da regra sequencial).
- OQ-36 → variante entre A e C. `quantity` é **teto do próprio lote** e é opcional em qualquer lote; a soma das quantidades informadas no setor não pode passar da capacidade do setor; a capacidade do setor continua sendo o teto real (controlado pelo Inventory na Fase 4).
- OQ-37 → A, na forma que decorre do teto por lote: o que não foi vendido num lote encerrado por data continua na capacidade do setor e é vendido pelos lotes seguintes, ao preço deles. O teto do lote seguinte não aumenta.
- OQ-38 → A. Sim; o lote conta assentos vendidos no setor, qualquer que seja a posição.
- OQ-39 → A. Só BRL; inteiro em centavos; o preço cadastrado é o da **inteira**, sem taxa.
- OQ-40 → A. Não validar.
- OQ-41 → C, com o início das vendas **na sessão** (não no 1º lote): `salesStartsAt` obrigatório, anterior a `startsAt`, podendo estar no passado (significa "assim que publicar"). Vendas abertas = sessão publicada **e** `salesStartsAt` ≤ agora < `startsAt` **e** existe lote vigente. As vendas terminam no início da sessão; nenhum `endsAt` de lote pode passar de `startsAt`.
- OQ-42 → A. Totalmente fora; nenhum campo agora.
- OQ-43 → A, ajustada à publicação por sessão (OQ-51 = B):
- OQ-44 → A, aplicada à **sessão**. Para publicar uma sessão:
- OQ-45 → A. Só imediata.
- OQ-46 → A. Não; nem evento nem sessão voltam a rascunho.
- OQ-47 → C. Não; entra na Fase 7.
- OQ-48 → A. Não; fica com a Fase 7.
- OQ-49 → A, ajustada à OQ-2 C e à publicação por sessão:
- OQ-50 → variante mais restrita que B. **Sessão publicada fica congelada**: não muda data, início das vendas, local, setores nem lotes; não é removida.
- OQ-51 → B. A sessão tem estado próprio (Rascunho/Publicada) e é publicada separadamente, com os requisitos da OQ-44. Com a OQ-43 proposta, isso vale para **todas** as sessões, inclusive as do evento ainda em rascunho.
- OQ-52 → A. Um card por evento; a página do evento lista as sessões.
- OQ-53 → - **Proposta:**
- OQ-54 → B. Imagem (ou placeholder por categoria), título, rótulo da categoria, nome do local + cidade/UF da **próxima sessão** publicada não iniciada, data e hora dessa sessão (no fuso dela), "+N datas" quando houver outras sessões futuras publicadas, e o preço da OQ-55.
- OQ-55 → A. "A partir de R$ X", com X = menor `priceCents` entre os lotes **vigentes agora**, em todos os setores das sessões publicadas não iniciadas com vendas abertas. Sem lote vigente: "Vendas a partir de dd/mm" (o menor `salesStartsAt` futuro entre essas sessões) ou, se as vendas já acabaram em todas, "Vendas encerradas". Sem taxa (Fase 5).
- OQ-56 → consolidada do Research. Página pública: por sessão publicada (ordem de `startsAt`) e por setor (ordem da planta), o tipo do setor ("Assento marcado" ou "Pista") e **só o lote vigente** (nome e preço); sem lote vigente, "Vendas a partir de dd/mm HH:mm" ou "Vendas encerradas". Sem capacidade nem disponibilidade (Fase 4). Área do produtor: a sequência completa de lotes de cada setor, com selo derivado (Encerrado, Vigente, Em breve), mais o status da sessão (Rascunho, Publicada).
- OQ-57 → - **Proposta:**
- OQ-58 → A na API (`page`, `pageSize`; resposta com `items`, `page`, `pageSize`, `total`) + y na UI ("Carregar mais" com `useInfiniteQuery`).
- OQ-59 → A. Sem botão.

### Técnicas (OQ-60 a OQ-97)

- OQ-60 → Dois agregados: `Venue` (local + planta) e Evento com sessões, setores da sessão e lotes como filhas, versão única na raiz.
- OQ-61 → 14 commands por intenção, um evento cada, com estado completo da entidade: `RegisterVenue`, `UpdateVenueDetails`, `AddVenueSector`, `RemoveVenueSector`, `CreateEvent`, `UpdateEventDetails`, `DiscardEvent`, `ScheduleSession`, `RemoveSession`, `AddSessionSector`, `RemoveSessionSector`, `AddBatch`, `RemoveBatch`, `PublishSession`; `SessionScheduled` traz `salesStartsAt` e `timeZone` e não traz `active`; `SessionPublished` traz o retrato completo da sessão.
- OQ-62 → Lookup em `venues` + merge comutativo com guarda de `venueVersion`; edição de dados do local propaga por fan-out (exceto fuso); planta não propaga; sem lápide de local.
- OQ-63 → Versão só na raiz, bump da raiz em toda alteração de filha, um evento por command; a primeira `SessionPublished` também torna o evento Publicado, sem `EventPublished`.
- OQ-64 → Só `UpdateEventDetails` e `UpdateVenueDetails` exigem `expectedVersion` no corpo (409 se divergir); os demais usam a versão lida no servidor.
- OQ-65 → `EntityCommandAccepted` `{ id, version, entityId }` em `ScheduleSession`, `AddSessionSector`, `AddBatch` e `AddVenueSector`.
- OQ-66 → `event_listing` (eventos com sessão publicada) + `event_detail` (árvore completa), gravados juntos; o resumo é derivado do detalhe.
- OQ-67 → Coleção `aggregate_versions` como gate de sequência por agregado, mais `processed_events` para dedupe por `eventId`.
- OQ-68 → `min_version` compara com a versão do Evento nas leituras do evento e do `Venue` na leitura do local; listas sem `min_version`; lápide técnica só em `EventDiscarded`.
- OQ-69 → Read models `event_listing`, `event_detail` (público e gestão), `organizer_events` e `venues` (sem paginação, também lookup), leituras do produtor sob `/api/catalog/organizer/`.
- OQ-70 → Lote vigente, vendas abertas, encerrado, preço "a partir de", visibilidade e ordenação calculados no read-service com o `now` do servidor, `asOf` na view, ordenação por agregação.
- OQ-71 → `$text` em português só no título do `event_listing`, via `GET` com `q`.
- OQ-72 → Seis tabelas `catalog_*`, CASCADE dentro do agregado, RESTRICT sessão → local, uniques como última defesa, layout em `jsonb`, limites de negócio nos schemas e no agregado.
- OQ-73 → `SEED_ORGANIZER_ID` (default `0193a4f0-0000-7000-8000-000000000001`) em write-service e read-service, provider `CurrentOrganizer`, web não envia dono.
- OQ-74 → Campo texto com "R$", conversão para centavos sobre a string, faixa 1 a 10.000.000.
- OQ-75 → `datetime-local` em `startsAt`, `salesStartsAt` e `endsAt`, convertido no fuso do local/sessão por módulo puro com `Intl` em `libs/contracts`; API só com instantes.
- OQ-76 → Script `pnpm seed:catalog` pela API com `Idempotency-Key` e `min_version`, conteúdo da OQ-8 de negócio, checagem prévia por título.
- OQ-77 → `SharedModule` importado explicitamente e `OutboxWriter` genérico com mapper por contexto.
- OQ-78 → Tópico `catalog.events` com 3 partições e retenção infinita no `create-topics.sh`.
- OQ-79 → Arquivos `catalog/*` em `libs/contracts`, agregado `CatalogEvent`, união `CatalogDomainEventSchema`, `CommandAccepted` em `http/`, normalização de cidade e módulo de fuso compartilhados.
- OQ-80 → Rotas por intenção sob `/api/catalog/` (mapa na OQ-80), `PATCH` para edição, `DELETE` para remoção, 202 em todos, `Idempotency-Key` obrigatória.
- OQ-81 → UUID nas URLs da API e do web.
- OQ-82 → 422 com `code` estável para regra de negócio, 404 para recurso do caminho, 409 só para versão, `code` em todos os erros e schemas em `libs/contracts`.
- OQ-83 → Um grupo `projector` com registro tópico → schema e handlers.
- OQ-84 → Ping migrado para o mecanismo genérico, com `pnpm replay` uma vez depois da migração.
- OQ-85 → Replay total com lista única de coleções e reset `--all-topics`.
- OQ-86 → Coleções e índices no `mongo-init` (texto, categoria, `cityKey`, `startsAt`, `venueId`, organizador), testes criam os que usam.
- OQ-87 → E2E de API completo, replay comparando os quatro read models e teste de integração de comutatividade.
- OQ-88 → Vitrine em `/`, diagnóstico em `/diagnostico`, layout raiz com header e 404.
- OQ-89 → URLs do web em PT-BR.
- OQ-90 → Só TanStack Query para dados; router sem loaders.
- OQ-91 → Cliente HTTP, retry e read-your-writes extraídos para módulos compartilhados, diagnóstico migrado sem mudar comportamento.
- OQ-92 → Uma `Idempotency-Key` por intenção, trocada no sucesso ou quando o payload muda.
- OQ-93 → Componentes shadcn instalados de uma vez numa trilha (sem `pagination`), sucesso inline com `aria-live`.
- OQ-94 → `vi.stubGlobal('fetch')` com helper `createFakeApi`.
- OQ-95 → Dados de teste próprios com nomes únicos, sem contagem total, host `127.0.0.1` com override.
- OQ-96 → Seletores por papel e label, `data-testid` só sem papel, checklist de acessibilidade no Plan.
- OQ-97 → Limite de 10 s de espera pela projeção, depois "Salvo. Os dados podem demorar a aparecer." com "Atualizar"; diagnóstico sem limite.

### Surgidas no realinhamento técnico

- OQ-98 → A) o corpo de `ScheduleSession` inclui o `timeZone` usado na conversão das datas; se diferir do fuso atual do local no PostgreSQL, o command é rejeitado com 422 `VENUE_TIME_ZONE_CHANGED` e o web recarrega o local e pede para conferir os horários (detalhes no anexo técnico, seção "Open Questions novas").

### Surgidas na escrita da Spec e do Plan

- OQ-99 → (a) A) uma frase fictícia por evento, a que o planner propôs no bloco da OQ-99; (b) A) datas dadas só como dia valem 00:00 no fuso do local; (c) A) início das vendas de "Horizonte Rock Festival" e "Bolhas de Sabão" é o momento do seed, como no Hamlet; (d) A) os setores de lote único de "Riso Solto" em Manaus se chamam "Lote único"; (e) A) o dia `D` é a data de hoje no fuso de cada local.

### Situação do Gate 1

Todas as OQs (OQ-1 a OQ-99) têm decisão registrada. Nenhuma OQ aberta.

## Fontes externas

- [Guia da meia-entrada, Procon Juiz de Fora](https://www.pjf.mg.gov.br/administracao_indireta/procon/material_grafico/cartilhas/arquivos/guia_meia_entrada.pdf)
- [MP do Ceará orienta organizadores do Fortal 2024 a garantir a meia-entrada](https://mpce.mp.br/mp-do-ceara-orienta-organizadores-do-fortal-2024-a-garantir-a-meia-entrada-no-evento/)
- [Parecer 12/2023 Procon-MG sobre pontos controvertidos da meia-entrada](https://www.mpmg.mp.br/data/files/72/97/11/F6/30E7F810DBE5E3F8760849A8/Parecer-Meia%20entrada-Parecer%2012-2023%20-%20Analise%20principais%20pontos%20controvertidos%20nas%20normas%20q%20regulam%20a%20meia-entrada-Procon-MG-08maio20.pdf)
- [NestJS CQRS recipe](https://docs.nestjs.com/recipes/cqrs)
- [TypeORM 1.0 release notes](https://typeorm.io/docs/releases/1.0/release-notes/)
- shadcn/ui, React Router 8.5 e TanStack Query v5: documentação consultada pela parcial Frontend em 2026-10-25 (ui.shadcn.com/docs/forms/react-hook-form, reactrouter.com/start/modes, guia de paginated queries do TanStack Query).
