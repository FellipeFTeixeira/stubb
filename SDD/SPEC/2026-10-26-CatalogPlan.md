---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-26
status: implemented
research: SDD/RESEARCH/2026-10-25-CatalogResearch.md
spec: SDD/SPEC/2026-10-26-CatalogSpec.md
---

# Catalog — Plan

COMO a Spec será implementada. Decisões (`OQ-n`) na seção Decisões do Research e nos anexos normativos `SDD/WORK/2026-10-26-CatalogProposta-Negocio.md` e `SDD/WORK/2026-10-26-CatalogProposta-Tecnico.md` (revisão 2). Regras `RN-n`, interpretações `I-n` e critérios `CA-n` estão na Spec.

## Roadmap

| # | Etapa | Objetivo | Entregável | Depende de |
|---|---|---|---|---|
| E1 | Contratos | Schemas, constantes, eventos `V1`, views, erros, fuso, normalização e tipos dos documentos do read store em `libs/contracts` | `@stubb/contracts` compilado e testado | — |
| E2 | Fundação | Tópico, coleções e índices, env do produtor seed no compose, componentes shadcn, scripts de raiz, host `127.0.0.1` nos testes | Configs validadas estaticamente; `pnpm install` e lint verdes | — |
| E3 | write-service compartilhado | `SharedModule`, `OutboxWriter` genérico + mapper do Ping, erros com `code`, `Clock`, `CurrentOrganizer`, config do seed | Testes do diagnóstico verdes com a infra nova | E1 |
| E4 | projector genérico | Executor com `processed_events` + `aggregate_versions`, registro por tópico, Ping migrado | Testes do Ping verdes no mecanismo novo | E1 |
| E5 | read-service | Helper de espera comum, `Clock`, config do seed e as seis queries do Catalog | Unit e integração verdes (MongoDB isolado) | E1 |
| E6 | web fundação | Cliente HTTP, retry, read-your-writes com limite, chave por intenção, formatação, rótulos, erros, layout, rotas, 404, stubs de páginas, helpers de teste; diagnóstico em `/diagnostico` | Testes do diagnóstico verdes; rotas navegáveis | E1, E2 |
| E7 | write-service Catalog | Agregados, 14 commands, controllers, entities, migration | Unit e integração verdes (PostgreSQL isolado) | E3 |
| E8 | projector Catalog | Reducers, mapeadores, lookup e fan-out do local, lápide | Unit e integração (incl. comutatividade) verdes | E4 |
| E9 | web público | Vitrine e página do evento | Unit verdes | E6 |
| E10 | web produtor | Locais, meus eventos, gestão do evento | Unit verdes | E6 |
| E11 | Integração | Stack completa, E2E de API, replay, Playwright | `pnpm test:e2e` verde | E2, E5, E7, E8, E9, E10 |
| E12 | Seed | Script `pnpm seed:catalog` | Seed criado e idempotente na stack | E11 |
| E13 | Documentação | overview, glossário, README | Docs revisados | E11 |

### Trilhas e ondas

No máximo 4 trilhas por onda, todas na mesma working tree. Cada trilha só cria ou edita os arquivos que são seus. Um arquivo feito numa onda passa ao dono indicado na onda seguinte e não é tocado por mais ninguém.

| Trilha | Onda | Etapas | Depende de | Arquivos donos (exclusivos) |
|---|---|---|---|---|
| C — Contratos | 1 | E1 | — | `libs/contracts/src/**` |
| F — Fundação | 1 | E2 | — | `infra/kafka/create-topics.sh`, `infra/mongo/init-replica-set.js`, `docker-compose.yaml`, `package.json` (raiz), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `e2e/package.json`, `e2e/src/support/env.ts`, `apps/web/package.json`, `apps/web/components.json`, `apps/web/src/index.css`, `apps/web/src/components/ui/**`, `apps/web/playwright.config.ts` |
| WS — write compartilhado | 2 | E3 | C | `apps/write-service/src/shared/**`, `apps/write-service/src/diagnostics/**`, `apps/write-service/src/app.module.ts`, `apps/write-service/src/config.ts`, `apps/write-service/test/**` exceto `test/integration/setup.ts` |
| PS — projector genérico | 2 | E4 | C | `apps/projector/src/**`, `apps/projector/test/**` |
| R — read-service | 2 | E5 | C | `apps/read-service/src/**`, `apps/read-service/test/**` |
| US — web fundação | 2 | E6 | C, F | `apps/web/src/**` exceto `components/ui/**` e `index.css`; `apps/web/e2e/diagnostics.spec.ts`. Cria os stubs de página listados em "Interfaces", que passam a UV e UP na onda 3 |
| WC — write Catalog | 3 | E7 | WS | `apps/write-service/src/catalog/**`, `apps/write-service/src/database/**`, `apps/write-service/src/app.module.ts` (recebido de WS), `apps/write-service/test/integration/setup.ts`, `apps/write-service/test/integration/catalog/**`, `apps/write-service/test/unit/catalog/**` |
| PC — projector Catalog | 3 | E8 | PS | `apps/projector/src/projection/catalog/**`, `apps/projector/src/projection/topic-registry.ts`, `apps/projector/src/projection/event-dispatcher.ts`, `apps/projector/src/projection/projection.module.ts` (os três recebidos de PS), `apps/projector/test/integration/catalog-*.int.test.ts` |
| UV — web público | 3 | E9 | US | `apps/web/src/pages/showcase-page.tsx`, `apps/web/src/pages/event-page.tsx` (stubs recebidos de US) e seus `*.test.tsx`, `apps/web/src/features/showcase/**`, `apps/web/src/features/event-page/**`, `apps/web/src/api/catalog-public.ts` e `.test.ts`, `apps/web/public/placeholders/**` |
| UP — web produtor | 3 | E10 | US | `apps/web/src/pages/organizer/**` (stubs recebidos de US), `apps/web/src/features/organizer/**`, `apps/web/src/api/catalog-organizer.ts` e `.test.ts` |
| X — Integração | 4 | E11, E12, E13 | todas | `e2e/src/**` (inclui `env.ts`, recebido de F), `apps/web/e2e/catalog-*.spec.ts`, `docs/architecture/overview.md`, `docs/domain/glossary.md`, `README.md` |

Ondas:
- **Onda 1:** C e F.
- **Onda 2:** WS, PS, R e US.
- **Onda 3:** WC, PC, UV e UP.
- **Onda 4:** X, sozinha.

Regras de convivência:
- **Dependências.** Só a F altera manifests, lockfile e `pnpm-workspace.yaml`, e só na onda 1. Nenhuma outra trilha roda `pnpm add`/`pnpm remove`. Se faltar dependência ou script, a trilha para e registra no Board.
- **Docker.** Só a X sobe a stack completa. As outras usam no máximo os containers isolados da tabela "Containers isolados" e os removem ao terminar.
- **Correções na onda 4.** A X pode corrigir defeitos em arquivos de qualquer trilha para fazer um CA passar, registrando cada correção no Board. Mudar uma interface desta seção não é correção: a X para e pergunta.
- **Board.** `SDD/WORK/2026-10-26-CatalogBoard.md`, criado pelo thread principal a partir do template. Cada trilha edita só a sua linha na tabela e só acrescenta entradas nas outras seções.
- **Fim de onda.** O thread principal roda `pnpm lint`, `pnpm typecheck` e `pnpm test` na raiz antes de disparar a onda seguinte (napkin, 2026-10-24). Cada trilha roda, antes de fechar, `pnpm lint` **da raiz** além do lint do próprio pacote.

### Interfaces entre trilhas

Tudo o que uma trilha expõe e outra consome. Divergência é dúvida: registrar no Board e parar.

#### Exports novos de `@stubb/contracts` (trilha C)

Entrada `libs/contracts/src/index.ts`, `export *` de cada arquivo novo. Os exports existentes continuam, com uma mudança: `CommandAcceptedSchema` e `CommandAccepted` saem de `diagnostics/http.ts` e passam a vir de `http/command-accepted.ts` (o import `@stubb/contracts` não muda).

| Arquivo | Export | Definição |
|---|---|---|
| `events/envelope.ts` | `AnyEventEnvelope` | `interface { eventId: string; eventType: string; schemaVersion: 1; aggregateType: string; aggregateId: string; aggregateVersion: number; occurredAt: string; correlationId: string \| null; causationId: string \| null; payload: unknown }` |
| `http/command-accepted.ts` | `CommandAcceptedSchema`, `EntityCommandAcceptedSchema`, `CommandAccepted`, `EntityCommandAccepted` | `z.object({ id: uuidSchema, version: z.number().int().min(1) })`; o segundo `.extend({ entityId: uuidSchema })` |
| `http/errors.ts` | `COMMAND_ERROR_CODES`, `CommandErrorCode` | tupla `as const` com os 28 códigos da tabela "Códigos de erro" abaixo (todos exceto `UNKNOWN` e `NETWORK`) |
| | `ValidationErrorResponseSchema` | `z.object({ statusCode: z.literal(400), error: z.literal('Bad Request'), message: z.literal('Validation failed'), code: z.literal('VALIDATION_FAILED'), issues: z.array(z.object({ path: z.string(), message: z.string() })) })` |
| | `DomainErrorResponseSchema` | `z.object({ statusCode: z.number().int(), error: z.string(), message: z.string(), code: z.enum(COMMAND_ERROR_CODES) })` |
| `shared/schemas.ts` | `instantSchema` | `z.iso.datetime({ offset: true })` (aceita `Z` e offset) |
| `shared/normalize.ts` | `normalizeSearchKey(value: string): string` | `value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '')` |
| `shared/time-zone.ts` | `zonedLocalToInstant(local: string, timeZone: string): string` | `local` = `YYYY-MM-DDTHH:mm` (valor do `datetime-local`); devolve ISO UTC (`toISOString()`); `RangeError` se o formato for inválido. Algoritmo na T-4 |
| | `instantToZonedLocal(instant: string, timeZone: string): string` | inverso; devolve `YYYY-MM-DDTHH:mm` |
| | `zonedParts(instant: string, timeZone: string)` | `{ year, month, day, hour, minute }` (números, `hour` 0-23) |
| `read-store/collections.ts` | `READ_STORE_COLLECTIONS` | `{ pings: 'pings', processedEvents: 'processed_events', aggregateVersions: 'aggregate_versions', eventListing: 'event_listing', eventDetail: 'event_detail', organizerEvents: 'organizer_events', venues: 'venues' } as const` |
| | `READ_STORE_COLLECTION_NAMES` | `Object.values(READ_STORE_COLLECTIONS)` |
| `read-store/catalog-documents.ts` | `VenueDocument`, `EventDetailDocument`, `EventDetailTombstone`, `EventDetailSession`, `EventDetailSector`, `EventDetailBatch`, `SessionVenueSnapshot`, `EventListingDocument`, `OrganizerEventDocument`, `AggregateVersionDocument` | interfaces TS (sem Zod), formas da seção "Read store" abaixo |
| `catalog/constants.ts` | `BOUNDED_CONTEXT_CATALOG` | `'catalog'` |
| | `CATALOG_TOPIC` | `'catalog.events'` |
| | `VENUE_AGGREGATE_TYPE`, `EVENT_AGGREGATE_TYPE` | `'Venue'`, `'Event'` |
| | `CATALOG_EVENT_TYPES` | `{ venueRegistered: 'VenueRegistered', venueDetailsUpdated: 'VenueDetailsUpdated', venueSectorAdded: 'VenueSectorAdded', venueSectorRemoved: 'VenueSectorRemoved', eventCreated: 'EventCreated', eventDetailsUpdated: 'EventDetailsUpdated', eventDiscarded: 'EventDiscarded', sessionScheduled: 'SessionScheduled', sessionRemoved: 'SessionRemoved', sessionSectorAdded: 'SessionSectorAdded', sessionSectorRemoved: 'SessionSectorRemoved', batchAdded: 'BatchAdded', batchRemoved: 'BatchRemoved', sessionPublished: 'SessionPublished' } as const` |
| | `CATALOG_LIMITS` | `{ venueNameMax: 100, venueAddressMax: 200, venueCityMax: 100, sectorNameMax: 50, sectorsPerVenueMax: 20, generalAdmissionCapacityMax: 50000, rowsPerSectorMax: 50, seatsPerRowMax: 100, eventTitleMax: 120, eventDescriptionMax: 5000, imageUrlMax: 2048, sessionsPerEventMax: 50, batchNameMax: 50, batchesPerSectorMax: 10, priceCentsMin: 1, priceCentsMax: 10000000 } as const` |
| | `BRAZIL_STATES` | `['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const` |
| | `BRAZIL_TIME_ZONES` | `['America/Noronha','America/Belem','America/Fortaleza','America/Recife','America/Araguaina','America/Maceio','America/Bahia','America/Sao_Paulo','America/Campo_Grande','America/Cuiaba','America/Santarem','America/Porto_Velho','America/Boa_Vista','America/Manaus','America/Eirunepe','America/Rio_Branco'] as const` |
| | `DEFAULT_TIME_ZONE` | `'America/Sao_Paulo'` |
| | `EVENT_CATEGORIES`, `AGE_RATINGS`, `SECTOR_KINDS` | `['show','theater','stand_up','sports','festival','kids','other']`, `['L','10','12','14','16','18']`, `['general_admission','seated']` (todos `as const`) |
| | `CATALOG_PAGE_SIZE` | `{ default: 12, max: 48 } as const` |
| | `catalogRoutes` | funções que montam as rotas da tabela HTTP da Spec: `venues`, `venue(venueId)`, `venueSectors(venueId)`, `venueSector(venueId, venueSectorId)`, `events`, `event(eventId)`, `sessions(eventId)`, `session(eventId, sessionId)`, `publishSession(eventId, sessionId)`, `sessionSectors(eventId, sessionId)`, `sessionSector(eventId, sessionId, sessionSectorId)`, `batches(eventId, sessionId, sessionSectorId)`, `batch(eventId, sessionId, sessionSectorId, batchId)`, `organizerEvents`, `organizerEvent(eventId)`, `organizerVenues`, `organizerVenue(venueId)` (strings para as fixas) |
| | `CATALOG_ROUTE_TEMPLATES` | um por command, `'MÉTODO /rota/com/:params'` exatamente como na tabela HTTP da Spec (ex.: `addBatch: 'POST /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId/batches'`); valor do `scope` da idempotência |
| `catalog/fields.ts` | `requiredText(max)` | `z.string().trim().min(1, 'Campo obrigatório').max(max, \`Use no máximo ${max} caracteres\`)` |
| | `venueDetailsSchema` | `z.object({ name: requiredText(100), address: requiredText(200), city: requiredText(100), state: z.enum(BRAZIL_STATES, { error: 'Escolha uma UF' }), timeZone: z.enum(BRAZIL_TIME_ZONES, { error: 'Escolha um fuso horário' }) })` |
| | `seatRowSchema` | `z.object({ label: z.string().trim().regex(/^[A-Za-z0-9]{1,3}$/, 'Use de 1 a 3 letras sem acento ou números').transform((s) => s.toUpperCase()), seats: z.number({ error: 'Informe um número' }).int().min(1, 'Mínimo 1').max(100, 'Máximo 100') })` |
| | `venueSectorInputSchema` | `z.discriminatedUnion('kind', [z.object({ name: requiredText(50), kind: z.literal('general_admission'), capacity: z.number({ error: 'Informe um número' }).int().min(1, 'Mínimo 1').max(50000, 'Máximo 50.000') }), z.object({ name: requiredText(50), kind: z.literal('seated'), rows: z.array(seatRowSchema).min(1, 'Cadastre pelo menos uma fila').max(50, 'Máximo de 50 filas') })])`, com `superRefine` no ramo `seated` que acusa rótulo repetido (comparado já em maiúsculas) em `['rows', i, 'label']` com 'Rótulo de fila repetido' |
| | `httpsUrlSchema` | `z.string().trim().max(2048, 'Use no máximo 2048 caracteres').pipe(z.url({ protocol: /^https$/, error: 'Use um endereço https://' }))` |
| | `eventDetailsSchema` | `z.object({ title: requiredText(120), description: requiredText(5000), category: z.enum(EVENT_CATEGORIES, { error: 'Escolha uma categoria' }), ageRating: z.enum(AGE_RATINGS, { error: 'Escolha a classificação' }), imageUrl: httpsUrlSchema.nullable() })` |
| | `priceCentsSchema` | `z.number({ error: 'Informe um preço' }).int().min(1, 'Informe um preço entre R$ 0,01 e R$ 100.000,00').max(10000000, 'Informe um preço entre R$ 0,01 e R$ 100.000,00')` |
| `catalog/http.ts` | `RegisterVenueRequestSchema` | `venueDetailsSchema` |
| | `UpdateVenueDetailsRequestSchema` | `venueDetailsSchema.extend({ expectedVersion: z.number().int().min(1) })` |
| | `AddVenueSectorRequestSchema` | `venueSectorInputSchema` |
| | `CreateEventRequestSchema` | `eventDetailsSchema.extend({ imageUrl: httpsUrlSchema.nullable().optional().transform((v) => v ?? null) })` |
| | `UpdateEventDetailsRequestSchema` | `eventDetailsSchema.extend({ expectedVersion: z.number().int().min(1) })` |
| | `ScheduleSessionRequestSchema` | `z.object({ venueId: uuidSchema, startsAt: instantSchema, salesStartsAt: instantSchema, timeZone: z.enum(BRAZIL_TIME_ZONES) }).refine((v) => Date.parse(v.salesStartsAt) < Date.parse(v.startsAt), { path: ['salesStartsAt'], message: 'O início das vendas precisa ser antes do início da sessão' })` |
| | `AddSessionSectorRequestSchema` | `z.object({ venueSectorId: uuidSchema })` |
| | `AddBatchRequestSchema` | `z.object({ name: requiredText(50), priceCents: priceCentsSchema, quantity: z.number().int().min(1, 'Mínimo 1').nullable().optional().transform((v) => v ?? null), endsAt: instantSchema.nullable().optional().transform((v) => v ?? null) })` |
| | `EmptyCommandRequestSchema` | `z.object({})` (corpo de `PublishSession`) |
| | `ListEventsQuerySchema` | `z.object({ q: optionalSearchText, city: optionalSearchText, category: z.enum(EVENT_CATEGORIES).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(48).default(12) })`, com `optionalSearchText = z.string().trim().optional().transform((v) => (v ? v : undefined))` |
| | `ListOrganizerEventsQuerySchema` | `z.object({ page, pageSize })` iguais aos de cima |
| | views e respostas | `EventCardSchema`, `ListEventsResponseSchema`, `PublicEventViewSchema`, `GetEventResponseSchema`, `OrganizerEventViewSchema`, `GetOrganizerEventResponseSchema`, `OrganizerEventSummarySchema`, `ListOrganizerEventsResponseSchema`, `VenueSummarySchema`, `ListVenuesResponseSchema`, `VenueViewSchema`, `GetVenueResponseSchema`, `ReadNotFoundResponseSchema` (`{ statusCode: 404, message: string, minVersionReached: boolean }`), com os campos da Spec ("Queries"); datas `z.iso.datetime()`; uniões discriminadas por `kind` (`price`) e `status` (`sales`) |
| | tipos | `z.output` dos requests (`RegisterVenueRequest` ...), `z.input` com sufixo `Input` (`AddBatchRequestInput` ...), `z.infer` das views e respostas |
| `catalog/events.ts` | 14 schemas `*V1Schema` | `createEventEnvelopeSchema(CATALOG_EVENT_TYPES.x, VENUE_AGGREGATE_TYPE ou EVENT_AGGREGATE_TYPE, payload)` com os payloads da Spec ("Events"); `VenueRegisteredV1Schema` e `EventCreatedV1Schema` com `.extend({ aggregateVersion: z.literal(1) })`; instantes `instantSchema`; rótulos de fila `/^[A-Z0-9]{1,3}$/` |
| | `CatalogDomainEventSchema`, `CatalogDomainEvent`, `VenueDomainEventV1`, `EventDomainEventV1` | `z.discriminatedUnion('eventType', [os 14])`; os dois últimos são uniões de tipo por agregado |
| | `venueSectorPayloadSchema`, `sessionSectorPayloadSchema`, `batchPayloadSchema` e tipos `VenueSectorPayload`, `SessionSectorPayload`, `BatchPayload` | formas "Tipos de payload" da Spec |

#### Códigos de erro e mensagens do web

| `code` | HTTP | Campo no form (US/UP) | Mensagem PT-BR (US, `api/command-errors.ts`) |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | `issues[].path` | (mensagens dos `issues`); alerta: "Confira os campos destacados." |
| `IDEMPOTENCY_KEY_INVALID` | 400 | — | "Não foi possível enviar. Recarregue a página e tente de novo." |
| `IDEMPOTENCY_KEY_MISMATCH` | 422 | — | "Este envio já foi usado para outro pedido. Recarregue a página e tente de novo." |
| `CONCURRENCY_CONFLICT` | 409 | — | "Os dados mudaram desde que você abriu o formulário. Carregamos a versão atual; confira e envie de novo." |
| `AGGREGATE_NOT_FOUND` | 404 | — | "Não encontramos este item. Ele pode ter sido removido." |
| `ENTITY_NOT_FOUND` | 404 | — | "Não encontramos este item. Ele pode ter sido removido." |
| `VENUE_SECTOR_LIMIT_REACHED` | 422 | — | "O local já tem 20 setores, o máximo permitido." |
| `VENUE_SECTOR_NAME_TAKEN` | 422 | `name` | "Já existe um setor com esse nome neste local." |
| `EVENT_NOT_DRAFT` | 422 | — | "Só é possível descartar um evento que ainda não tem sessão publicada." |
| `VENUE_NOT_FOUND` | 422 | `venueId` | "Local não encontrado." |
| `VENUE_TIME_ZONE_CHANGED` | 422 | — | "O fuso do local mudou. Confira os horários e envie de novo." |
| `VENUE_WITHOUT_SECTORS` | 422 | `venueId` | "Este local ainda não tem setores. Cadastre pelo menos um setor antes de agendar." |
| `SESSION_LIMIT_REACHED` | 422 | — | "O evento já tem 50 sessões, o máximo permitido." |
| `SESSION_START_NOT_IN_FUTURE` | 422 | `startsAt` | "O início da sessão precisa ser no futuro." |
| `SESSION_DUPLICATED` | 422 | `startsAt` | "Já existe uma sessão deste evento neste local e horário." |
| `SESSION_NOT_DRAFT` | 422 | — | "Esta sessão já foi publicada e não pode mais ser alterada." |
| `VENUE_SECTOR_NOT_FOUND` | 422 | `venueSectorId` | "Este setor não existe mais na planta do local." |
| `SESSION_SECTOR_ALREADY_PRESENT` | 422 | `venueSectorId` | "Este setor já está na sessão." |
| `SESSION_SECTOR_NAME_TAKEN` | 422 | `venueSectorId` | "A sessão já tem um setor com esse nome." |
| `BATCH_LIMIT_REACHED` | 422 | — | "Este setor já tem 10 lotes, o máximo permitido." |
| `BATCH_NAME_TAKEN` | 422 | `name` | "Já existe um lote com esse nome neste setor." |
| `BATCH_QUANTITY_EXCEEDS_CAPACITY` | 422 | `quantity` | "A soma das quantidades dos lotes passa da capacidade do setor." |
| `BATCH_END_OUT_OF_RANGE` | 422 | `endsAt` | "O fim do lote precisa ser depois do início das vendas e antes do início da sessão." |
| `BATCH_END_BEFORE_PREVIOUS` | 422 | `endsAt` | "O fim do lote precisa ser depois do fim dos lotes anteriores." |
| `PREVIOUS_BATCH_UNBOUNDED` | 422 | — | "O último lote não tem quantidade nem data de fim; um lote novo nunca ficaria vigente." |
| `SESSION_WITHOUT_SECTORS` | 422 | — | "A sessão precisa de pelo menos um setor para ser publicada." |
| `SECTOR_WITHOUT_BATCH` | 422 | — | "Todo setor da sessão precisa de pelo menos um lote para publicar." |
| `BATCH_ENDED` | 422 | — | "Há lote com data de fim no passado. Remova-o e cadastre de novo." |
| `UNKNOWN` (só no web) | — | — | "Não foi possível concluir (HTTP {status})." |
| `NETWORK` (só no web) | — | — | "Sem conexão com o servidor. Tente novamente." |

`COMMAND_ERROR_CODES` (contratos) tem os 28 primeiros. `UNKNOWN` e `NETWORK` existem só no web.

#### HTTP

Rotas, corpos e respostas conforme a Spec ("Contratos"). Formato dos erros dos commands: `{ statusCode, error, message, code }`; 400 de validação com `issues`. Erros do read-service: formato da Fase 1 (I-13). `GET` de lista com `page`/`pageSize` inválidos → 400 do `ZodPipe` do read-service.

#### API compartilhada do write-service (WS → WC)

| Caminho | Export | Contrato |
|---|---|---|
| `src/shared/shared.module.ts` | `SharedModule` | `@Module({ imports: [TypeOrmModule.forFeature([OutboxEntity, IdempotencyKeyEntity])], providers: [TransactionContext, OutboxWriter, IdempotencyService, IdempotencyCleanupJob, Clock, CurrentOrganizer], exports: [TransactionContext, OutboxWriter, IdempotencyService, Clock, CurrentOrganizer] })`, não global |
| `src/shared/outbox/outbox-writer.ts` | `OutboxWriter.append(boundedContext: string, envelopes: readonly AnyEventEnvelope[]): Promise<void>` | grava cada envelope na `outbox` (`occurred_at` = `new Date(envelope.occurredAt)`, `payload` = envelope inteiro); não valida nem conhece domínio |
| `src/shared/clock/clock.ts` | `Clock` | `@Injectable() class Clock { now(): Date }` (devolve `new Date()`); testes sobrescrevem com `createTestApp([{ provide: Clock, useValue: { now: () => fixed } }])` |
| `src/shared/actor/current-organizer.ts` | `CurrentOrganizer` | `@Injectable() class CurrentOrganizer { id(): string }` (devolve `config.SEED_ORGANIZER_ID`) |
| `src/shared/errors.ts` | `BusinessRuleViolationError(code: CommandErrorCode, message?: string)`, `EntityNotFoundError(message?: string)` + os três já existentes | o filtro mapeia: `BusinessRuleViolationError` → 422 com o `code`; `EntityNotFoundError` → 404 `ENTITY_NOT_FOUND`; `AggregateNotFoundError` → 404 `AGGREGATE_NOT_FOUND`; `ConcurrencyConflictError` → 409 `CONCURRENCY_CONFLICT`; `IdempotencyKeyMismatchError` → 422 `IDEMPOTENCY_KEY_MISMATCH` |
| `src/shared/http/domain-error.filter.ts` | `DomainErrorFilter` | corpo `{ statusCode, error, message, code }`; `error` = `'Not Found'`, `'Conflict'` ou `'Unprocessable Entity'` |
| `src/shared/http/zod-validation.pipe.ts` | `ZodValidationPipe(schema)` | 400 com `ValidationErrorResponseSchema` |
| `src/shared/idempotency/idempotency-key.decorator.ts` | `IdempotencyKey()` | 400 `{ statusCode: 400, error: 'Bad Request', message: 'Idempotency-Key header is required and must be a UUID', code: 'IDEMPOTENCY_KEY_INVALID' }` |
| `src/shared/idempotency/idempotency.service.ts`, `request-hash.ts` | sem mudança de contrato | `execute({ key, scope, requestHash }, operation)`; `hashRequest(method, path, body)` |
| `src/config.ts` | `config.SEED_ORGANIZER_ID` | `z.uuid().default('0193a4f0-0000-7000-8000-000000000001')` |

#### API compartilhada do projector (PS → PC)

| Caminho | Export | Contrato |
|---|---|---|
| `src/projection/projection-executor.ts` | `ProjectionTx = { session: ClientSession; db: Db }`; `ProjectionExecutor.run(event: AnyEventEnvelope, apply: (tx: ProjectionTx) => Promise<void>): Promise<void>` | numa transação: se `processed_events` tem o `eventId`, retorna; insere em `processed_events`; lê `aggregate_versions[aggregateId]`; `decideProjection` → já aplicado (log `warn`, retorna), lacuna (`ProjectionGapError`) ou aplica `apply(tx)` e faz upsert `{ _id: aggregateId, aggregateType, version: aggregateVersion }` |
| `src/projection/sequence.ts` | `decideProjection(aggregateVersion: number, currentVersion: number \| null): 'apply' \| 'already-applied' \| 'gap'` | `<= atual` → `already-applied`; `atual + 1` (atual nulo = 0) → `apply`; maior → `gap` |
| `src/projection/topic-registry.ts` | `TOPIC_REGISTRY` | `{ [DIAGNOSTICS_TOPIC]: (value: unknown) => DiagnosticsEventSchema.parse(value) }`; PC acrescenta `[CATALOG_TOPIC]: (value) => CatalogDomainEventSchema.parse(value)`; tipo `ProjectableEvent` = união dos retornos |
| `src/projection/event-dispatcher.ts` | `EventDispatcher.dispatch(event: ProjectableEvent): Promise<void>` | mapa `eventType → handler`; cada handler chama `executor.run(event, (tx) => projection.apply(event, tx))` |
| `src/kafka/kafka-consumer.service.ts` | — | assina `Object.keys(TOPIC_REGISTRY)`; escolhe o parse por `message.topic`; tópico fora do registro é erro (sem commit, `exit(1)`). PC não edita este arquivo |

#### API compartilhada do web (US → UV, UP)

| Caminho | Export | Contrato |
|---|---|---|
| `src/api/http.ts` | `ApiError` | `class ApiError extends Error { status: number; body: unknown; get code(): string \| undefined }` (`code` de `body.code` quando for string) |
| | `sendCommand<T>(method: 'POST' \| 'PATCH' \| 'DELETE', url: string, idempotencyKey: string, body: unknown, schema: ZodType<T>): Promise<T>` | header `Idempotency-Key`; `Content-Type: application/json` e corpo JSON quando `body !== undefined`; exige `202` (senão `ApiError`); valida com `schema` |
| | `getJson<T>(url: string, schema: ZodType<T>): Promise<{ status: 'found'; data: T } \| { status: 'not-found'; minVersionReached: boolean }>` | `200` → `found`; `404` → `not-found` com `minVersionReached` do corpo (falso se ausente); outros → `ApiError` |
| | `withQuery(path: string, params: Record<string, string \| number \| undefined>): string` | monta a query string ignorando `undefined` |
| `src/api/mutation-retry.ts` | `shouldRetryCommand`, `COMMAND_RETRY_DELAY_MS` | movidos de `features/diagnostics/mutation-retry.ts`, sem mudança |
| `src/api/command-errors.ts` | `describeCommandError(error: unknown): string` | mensagem da tabela de códigos (`TypeError` → `NETWORK`; sem `code` → `UNKNOWN`) |
| | `commandErrorToForm(error: unknown): { fieldErrors: Array<{ path: string; message: string }>; formError: string \| null }` | 400 → `issues` em `fieldErrors` e "Confira os campos destacados." em `formError`; 422 com campo na tabela → `fieldErrors`; demais → `formError` |
| `src/api/query-keys.ts` | `catalogKeys` | `{ publicEvents: (filters) => ['catalog', 'public', 'events', filters], publicEvent: (id) => ['catalog', 'public', 'event', id], organizerEvents: ['catalog', 'organizer', 'events'], organizerEvent: (id) => ['catalog', 'organizer', 'event', id], organizerVenues: ['catalog', 'organizer', 'venues'], organizerVenue: (id) => ['catalog', 'organizer', 'venue', id] }` |
| `src/lib/read-your-writes.ts` | `PROJECTION_WAIT_BUDGET_MS = 10_000`, `PROJECTION_POLL_INTERVAL_MS = 250` | |
| | `useVersionedQuery<T extends { minVersionReached: boolean }>(options: { queryKey: readonly unknown[]; queryFn: (minVersion: number \| undefined) => Promise<T>; minVersion?: number; budgetMs?: number; enabled?: boolean }): { query: UseQueryResult<T>; status: 'idle' \| 'waiting' \| 'synced' \| 'timed-out'; restart: () => void }` | chave `[...queryKey, minVersion ?? null]`; `placeholderData: keepPreviousData`; `retry: false`; polling de 250 ms enquanto `minVersionReached` for falso e o limite não estourou; `status` `idle` sem `minVersion`; ao sincronizar, semeia `[...queryKey, null]` com o dado; `restart()` reinicia o limite e refaz |
| `src/lib/idempotency.ts` | `useIdempotencyKey(): { keyFor: (payload: unknown) => string; reset: () => void }` | mesma chave enquanto o payload (JSON com chaves ordenadas) não muda; `reset()` depois do sucesso |
| `src/lib/format.ts` | `formatMoney(cents)`, `formatDateTime(iso, timeZone)`, `formatDayMonth(iso, timeZone)`, `formatDayMonthTime(iso, timeZone)` | `R$ 1.234,56` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`); `dd/mm/aaaa HH:mm`, `dd/mm`, `dd/mm HH:mm` montados com `zonedParts` |
| `src/lib/money.ts` | `parsePriceToCents(input: string): number \| null`, `centsToPriceInput(cents: number): string` | aceita `R$` opcional e espaços; `^\d{1,3}(\.\d{3})*(,\d{1,2})?$` ou `^\d+(,\d{1,2})?$`; conta inteira sobre a string; inválido → `null` |
| `src/lib/catalog-labels.ts` | `CATEGORY_LABELS`, `AGE_RATING_LABELS`, `SECTOR_KIND_LABELS`, `BATCH_BADGE_LABELS`, `SESSION_STATUS_LABELS`, `EVENT_STATUS_LABELS` | categorias da RN-12; `L` → "Livre", `N` → "N anos"; `general_admission` → "Pista", `seated` → "Assento marcado"; `ended` → "Encerrado", `current` → "Vigente", `upcoming` → "Em breve"; sessão `draft` → "Rascunho", `published` → "Publicada"; evento `draft` → "Rascunho", `published` → "Publicado" |
| `src/components/projection-status.tsx` | `ProjectionStatus({ status, onRestart })` | `role="status"` + `aria-live="polite"`: `waiting` → "Aguardando projeção…"; `synced` → "Salvo."; `timed-out` → "Salvo. Os dados podem demorar a aparecer." + botão "Atualizar" (`onRestart`); `idle` → nada |
| `src/test/render.tsx` | `renderRoutes(routes: RouteObject[], options: { initialEntries: string[]; client?: QueryClient })` | `createMemoryRouter` + `QueryClientProvider`; os helpers existentes continuam |
| `src/test/fake-api.ts` | `createFakeApi()` | `{ on(method, pathPattern, handler), install(), calls }`: instala `vi.stubGlobal('fetch')`, roteia por método + caminho (padrões com `:param`), `handler({ params, query, body, headers })` devolve `{ status, body }`; `calls` guarda as requisições |

#### Rotas e stubs do web (US cria; UV e UP preenchem)

| Rota | Componente (arquivo) | Dono na onda 3 |
|---|---|---|
| `/` | `ShowcasePage` (`src/pages/showcase-page.tsx`) | UV |
| `/eventos/:eventId` | `EventPage` (`src/pages/event-page.tsx`) | UV |
| `/produtor/eventos` | `OrganizerEventsPage` (`src/pages/organizer/events-page.tsx`) | UP |
| `/produtor/eventos/novo` | `NewEventPage` (`src/pages/organizer/new-event-page.tsx`) | UP |
| `/produtor/eventos/:eventId` | `EventManagePage` (`src/pages/organizer/event-manage-page.tsx`) | UP |
| `/produtor/locais` | `VenuesPage` (`src/pages/organizer/venues-page.tsx`) | UP |
| `/produtor/locais/novo` | `NewVenuePage` (`src/pages/organizer/new-venue-page.tsx`) | UP |
| `/produtor/locais/:venueId` | `VenuePage` (`src/pages/organizer/venue-page.tsx`) | UP |
| `/diagnostico` | `DiagnosticsPage` (existente) | US |
| `*` | `NotFoundPage` (`src/pages/not-found-page.tsx`) | US |

O layout raiz (`src/app/root-layout.tsx`) envolve todas as rotas; o layout do produtor (`src/app/organizer-layout.tsx`) envolve `/produtor/*` com a navegação "Meus eventos" e "Locais". Cada stub exporta o componente nomeado acima e renderiza só `<h1>` com o título da página.

#### Textos de UI usados pelos testes (UV, UP → X)

Nomes acessíveis exatos. Os testes usam `getByRole`/`getByLabelText` com eles.

- **Layout:** link "Stubb" (→ `/`), link "Área do produtor" (→ `/produtor/eventos`), link "Diagnóstico" (→ `/diagnostico`); no produtor, links "Meus eventos" e "Locais". 404: `h1` "Página não encontrada", link "Voltar para a vitrine".
- **Vitrine:** `h1` "Eventos"; campos "Buscar por título", "Cidade", "Categoria" (opção "Todas"); botão "Buscar"; cada card é um `article` cujo título é um link com o nome do evento; botão "Carregar mais"; vazio: "Nenhum evento encontrado.".
- **Página do evento:** `h1` = título; "Evento encerrado"; cada sessão é uma `section` com nome acessível "Sessão de {dd/mm/aaaa HH:mm}"; textos "Sessão encerrada", "Vendas a partir de {dd/mm HH:mm}", "Vendas encerradas"; 404: `h1` "Evento não encontrado".
- **Locais:** `h1` "Locais"; link "Novo local"; formulário com "Nome do local", "Endereço", "Cidade", "UF", "Fuso horário"; botões "Cadastrar local" e "Salvar dados do local"; planta: cada setor numa `section` com nome acessível = nome do setor, botão "Remover setor {nome}"; formulário "Nome do setor", "Tipo" (opções "Pista", "Assento marcado"), "Capacidade", "Rótulo da fila {n}", "Assentos da fila {n}", botões "Adicionar fila", "Remover fila {n}", "Adicionar setor".
- **Meus eventos:** `h1` "Meus eventos"; link "Novo evento"; cada item é um link com o título; selos "Rascunho"/"Publicado"; botão "Carregar mais".
- **Evento (criação e gestão):** campos "Título", "Descrição", "Categoria", "Classificação indicativa", "URL da imagem (opcional)"; botões "Criar evento", "Salvar dados do evento", "Descartar evento", "Confirmar descarte", "Cancelar". Agendar: "Local", "Início da sessão", "Início das vendas", botão "Agendar sessão". Cada sessão é uma `section` com nome "Sessão de {dd/mm/aaaa HH:mm}"; botões "Publicar sessão", "Remover sessão"; campo "Setor da planta" e botão "Adicionar setor à sessão"; cada setor da sessão é uma `section` com nome = nome do setor, botão "Remover setor {nome}"; lote: "Nome do lote", "Preço", "Quantidade (opcional)", "Fim do lote (opcional)", botão "Adicionar lote", botão "Remover lote {nome}"; selos dos lotes e da sessão (`catalog-labels.ts`).
- **Espera:** `ProjectionStatus` (textos acima).

#### PostgreSQL (dono WC)

| Tabela | Colunas | Restrições |
|---|---|---|
| `catalog_venues` | `id uuid PK`, `organizer_id uuid`, `name text`, `address text`, `city text`, `state text`, `time_zone text`, `version integer`, `created_at timestamptz`, `updated_at timestamptz` | — |
| `catalog_venue_sectors` | `id uuid PK`, `venue_id uuid`, `name text`, `name_key text`, `kind text`, `capacity integer null` (só pista), `rows jsonb null` (só marcado, `[{ label, seats }]`), `position integer` | FK `venue_id → catalog_venues(id) ON DELETE CASCADE`; unique `(venue_id, name_key)` |
| `catalog_events` | `id uuid PK`, `organizer_id uuid`, `title text`, `description text`, `category text`, `age_rating text`, `image_url text null`, `status text` (`draft`/`published`), `version integer`, `created_at timestamptz`, `updated_at timestamptz` | — |
| `catalog_sessions` | `id uuid PK`, `event_id uuid`, `venue_id uuid`, `status text`, `starts_at timestamptz`, `sales_starts_at timestamptz`, `time_zone text`, `created_at timestamptz` | FK `event_id → catalog_events ON DELETE CASCADE`; FK `venue_id → catalog_venues ON DELETE RESTRICT`; unique `(event_id, venue_id, starts_at)` |
| `catalog_session_sectors` | `id uuid PK`, `session_id uuid`, `venue_sector_id uuid` (sem FK), `name text`, `name_key text`, `kind text`, `capacity integer null`, `rows jsonb null`, `position integer` | FK `session_id → catalog_sessions ON DELETE CASCADE`; unique `(session_id, venue_sector_id)`; unique `(session_id, name_key)` |
| `catalog_batches` | `id uuid PK`, `session_sector_id uuid`, `name text`, `name_key text`, `price_cents integer`, `quantity integer null`, `ends_at timestamptz null`, `position integer` | FK `session_sector_id → catalog_session_sectors ON DELETE CASCADE`; unique `(session_sector_id, name_key)`; unique `(session_sector_id, position)` |

`name_key` = `name.trim().toLocaleLowerCase('pt-BR')` (comparação sem diferenciar maiúsculas, RN-8, RN-23, RN-25). `outbox` e `idempotency_keys` não mudam.

#### Read store (MongoDB `stubb_read`; PC escreve, R lê; tipos em `read-store/catalog-documents.ts`)

Datas são `Date` do BSON, vindas de `occurredAt` (nunca do relógio do projector). Arrays sempre ordenados: sessões por `startsAt` e `id`; setores por `position` e `id`; lotes por `position`.

```ts
interface VenueDocument {
  _id: string; organizerId: string; version: number; detailsVersion: number;
  name: string; address: string; city: string; state: string; timeZone: string; cityKey: string;
  sectors: Array<{ id: string; name: string; kind: 'general_admission' | 'seated'; capacity: number;
    rows: Array<{ label: string; seats: number }> | null; position: number }>;
  createdAt: Date; updatedAt: Date;
}
interface SessionVenueSnapshot { name: string; address: string; city: string; state: string; cityKey: string; detailsVersion: number }
interface EventDetailBatch { id: string; name: string; priceCents: number; quantity: number | null; endsAt: Date | null; position: number }
interface EventDetailSector { id: string; venueSectorId: string; name: string; kind: 'general_admission' | 'seated'; capacity: number;
  rows: Array<{ label: string; seats: number }> | null; position: number; batches: EventDetailBatch[] }
interface EventDetailSession { id: string; status: 'draft' | 'published'; venueId: string; venue: SessionVenueSnapshot | null;
  startsAt: Date; salesStartsAt: Date; timeZone: string; sectors: EventDetailSector[] }
interface EventDetailDocument {
  _id: string; organizerId: string; version: number; status: 'draft' | 'published';
  title: string; description: string; category: string; ageRating: string; imageUrl: string | null;
  sessions: EventDetailSession[]; createdAt: Date; updatedAt: Date;
}
interface EventDetailTombstone { _id: string; version: number; status: 'discarded' }
interface EventListingDocument {
  _id: string; organizerId: string; version: number; title: string; titleSortKey: string; category: string; imageUrl: string | null;
  sessions: Array<{ id: string; venueId: string; startsAt: Date; salesStartsAt: Date; timeZone: string;
    venue: { name: string; city: string; state: string } | null; cityKey: string | null;
    sectors: Array<{ id: string; batches: Array<{ priceCents: number; endsAt: Date | null; position: number }> }> }>; // só sessões publicadas
}
interface OrganizerEventDocument {
  _id: string; organizerId: string; version: number; title: string; category: string; status: 'draft' | 'published';
  sessionsCount: number; publishedSessionsCount: number; createdAt: Date;
}
interface AggregateVersionDocument { _id: string; aggregateType: string; version: number }
```

`capacity` do setor marcado = soma de `seats`. Nenhum documento tem campo chamado `language` (é o `language_override` padrão do índice de texto).

Índices (criados pela F no `mongo-init`; os testes de integração criam os que usam):

| Coleção | Índice | Nome |
|---|---|---|
| `event_listing` | `{ title: 'text' }`, `default_language: 'portuguese'` | `event_listing_title_text` |
| `event_listing` | `{ category: 1 }` | `event_listing_category` |
| `event_listing` | `{ 'sessions.cityKey': 1 }` | `event_listing_sessions_city_key` |
| `event_listing` | `{ 'sessions.startsAt': 1 }` | `event_listing_sessions_starts_at` |
| `event_listing` | `{ 'sessions.venueId': 1 }` | `event_listing_sessions_venue_id` |
| `event_detail` | `{ 'sessions.venueId': 1 }` | `event_detail_sessions_venue_id` |
| `organizer_events` | `{ organizerId: 1, createdAt: -1, _id: -1 }` | `organizer_events_by_organizer` |
| `venues` | `{ organizerId: 1, name: 1 }` | `venues_by_organizer` |

#### Kafka, serviços e variáveis

- Tópico `catalog.events`: 3 partições, `replication-factor 1`, `retention.ms=-1`, criado por `infra/kafka/create-topics.sh` com `--if-not-exists`. Conector Debezium sem mudança (o `bounded_context = 'catalog'` já roteia para `catalog.events`).
- `SEED_ORGANIZER_ID`: lida por write-service (`config.SEED_ORGANIZER_ID`) e read-service (`loadConfig().seedOrganizerId`), default `0193a4f0-0000-7000-8000-000000000001` nos dois; no `docker-compose.yaml`, definida uma vez numa âncora e usada nos serviços `write-service` e `read-service`.
- `E2E_BASE_URL`: default `http://127.0.0.1:8080` em `e2e/src/support/env.ts` e em `apps/web/playwright.config.ts`.
- Scripts: raiz `"seed:catalog": "pnpm --filter @stubb/contracts build && pnpm --filter @stubb/e2e seed:catalog"`; `e2e/package.json` `"seed:catalog": "node src/seed-cli.ts"`.
- Serviços, portas e demais variáveis: os da Fase 1 (`SDD/SPEC/2026-10-24-SkeletonPlan.md`, "Serviços Docker, portas e variáveis"), sem mudança.

#### Containers isolados (ondas 2 e 3)

| Trilha | Container | Imagem | Porta no host |
|---|---|---|---|
| WS, WC | `stubb-it-postgres-write` | `postgres:18.6-trixie` | 55432 |
| PS, PC | `stubb-it-mongo-projector` | `mongo:8.0.34` (`--replSet rs0`) | 58017 |
| R | `stubb-it-mongo-read` | `mongo:8.0.34` | 58018 |

Na onda 3, WC é dono do container de PostgreSQL e PC do de MongoDB (WS e PS já terminaram). Comandos de criação no `README.md` ("Testes e qualidade").

## Arquivos

| Ação | Caminho | Propósito |
|---|---|---|
| criar | `libs/contracts/src/http/command-accepted.ts`, `http/errors.ts` | `CommandAccepted` genérico, códigos e schemas de erro |
| criar | `libs/contracts/src/shared/normalize.ts`, `shared/time-zone.ts` | normalização e fuso |
| criar | `libs/contracts/src/read-store/collections.ts`, `read-store/catalog-documents.ts` | nomes e formas do read store |
| criar | `libs/contracts/src/catalog/constants.ts`, `fields.ts`, `http.ts`, `events.ts` | contratos do Catalog |
| criar | `libs/contracts/src/**/*.test.ts` correspondentes | testes de contrato |
| alterar | `libs/contracts/src/diagnostics/http.ts`, `events/envelope.ts`, `shared/schemas.ts`, `index.ts` | mover `CommandAcceptedSchema`, `AnyEventEnvelope`, `instantSchema`, exports |
| alterar | `infra/kafka/create-topics.sh`, `infra/mongo/init-replica-set.js`, `docker-compose.yaml` | tópico, coleções e índices, `SEED_ORGANIZER_ID` |
| alterar | `package.json`, `e2e/package.json`, `e2e/src/support/env.ts`, `apps/web/playwright.config.ts` | scripts do seed, host `127.0.0.1` |
| criar | `apps/web/src/components/ui/{field,input-group,textarea,native-select,badge,skeleton,empty,spinner,alert,separator,breadcrumb}.tsx` | componentes shadcn (CLI) |
| alterar | `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/index.css`, `pnpm-workspace.yaml` (se o pnpm gravar) | efeitos do CLI do shadcn |
| criar | `apps/write-service/src/shared/shared.module.ts`, `shared/clock/clock.ts`, `shared/actor/current-organizer.ts`, `diagnostics/infrastructure/ping-event.mapper.ts` | infra compartilhada |
| alterar | `apps/write-service/src/shared/{errors.ts,outbox/outbox-writer.ts,http/domain-error.filter.ts,http/zod-validation.pipe.ts,idempotency/idempotency-key.decorator.ts}`, `diagnostics/diagnostics.module.ts`, `diagnostics/infrastructure/ping.repository.ts`, `app.module.ts`, `config.ts` e specs/testes afetados | generalização |
| criar | `apps/write-service/src/catalog/**` | módulo do Catalog |
| criar | `apps/write-service/src/database/migrations/<timestamp>-CatalogSchema.ts` | migration gerada |
| alterar | `apps/write-service/src/database/data-source.ts`, `migrations/index.ts`, `test/integration/setup.ts` | entities, migration, truncate |
| criar | `apps/write-service/test/integration/catalog/*.int.test.ts`, `test/integration/shared-infra.int.test.ts`, `test/unit/catalog/*.spec.ts` | testes |
| criar | `apps/projector/src/projection/projection-executor.ts`, `topic-registry.ts` | mecanismo genérico |
| alterar | `apps/projector/src/projection/{sequence.ts,sequence.spec.ts,ping.projection.ts,event-dispatcher.ts,projection.module.ts}`, `kafka/kafka-consumer.service.ts` e spec, `test/integration/ping-projection.int.test.ts` | Ping no mecanismo genérico |
| criar | `apps/projector/src/projection/catalog/**`, `test/integration/catalog-*.int.test.ts` | projeções do Catalog |
| criar | `apps/read-service/src/common/{poll-until.ts,clock.ts}`, `src/catalog/**`, `test/integration/catalog-*.int.test.ts` | queries do Catalog |
| alterar | `apps/read-service/src/{app.module.ts,config.ts}`, `diagnostics/get-ping.handler.ts` | módulo, config, helper |
| criar | `apps/web/src/api/{http.ts,mutation-retry.ts,command-errors.ts,query-keys.ts}`, `lib/{read-your-writes.ts,idempotency.ts,format.ts,money.ts,catalog-labels.ts}`, `components/projection-status.tsx`, `app/{root-layout.tsx,organizer-layout.tsx}`, `pages/not-found-page.tsx`, stubs de página, `test/fake-api.ts` e testes | fundação do web |
| alterar | `apps/web/src/api/diagnostics.ts`, `features/diagnostics/{use-ping.ts,use-create-ping.ts,use-increment-ping.ts}`, `app/router.tsx`, `test/render.tsx`, `apps/web/e2e/diagnostics.spec.ts` | diagnóstico nos módulos novos, rotas |
| remover | `apps/web/src/features/diagnostics/mutation-retry.ts` | movido para `src/api/` |
| criar | `apps/web/src/features/showcase/**`, `features/event-page/**`, `api/catalog-public.ts`, `public/placeholders/*.svg` | web público |
| criar | `apps/web/src/features/organizer/**`, `api/catalog-organizer.ts` | web do produtor |
| criar | `e2e/src/api/catalog.e2e.test.ts`, `e2e/src/support/catalog.ts`, `e2e/src/seed/catalog-seed.ts`, `e2e/src/seed-cli.ts`, `apps/web/e2e/catalog-organizer.spec.ts`, `apps/web/e2e/catalog-public.spec.ts` | integração e seed |
| alterar | `e2e/src/support/{http.ts,kafka.ts}`, `e2e/src/replay/{replay.ts,replay.e2e.test.ts}` | PATCH/DELETE, tópico por parâmetro, replay total |
| alterar | `docs/architecture/overview.md`, `docs/domain/glossary.md`, `README.md` | documentação |

## Tarefas

### E1 — Contratos (trilha C)

- [ ] T-1 Mover `CommandAcceptedSchema`/`CommandAccepted` para `http/command-accepted.ts` e criar `EntityCommandAcceptedSchema`; criar `http/errors.ts`; acrescentar `AnyEventEnvelope` em `events/envelope.ts` e `instantSchema` em `shared/schemas.ts`. (cobre CA-24)
  - Teste: `http/errors.test.ts` valida um corpo 400 e um 422 de exemplo; `diagnostics/http.test.ts` continua passando.
- [ ] T-2 Criar `catalog/constants.ts` e `catalog/fields.ts` conforme "Interfaces". (cobre CA-1)
  - Teste: `catalog/fields.test.ts`: trim; limites exatos (1/100/101, 1/50/51, 1/120/121, 1/5000/5001, 2048/2049); UF e fuso fora da lista; `http://` rejeitado; rótulo `a1` vira `A1`; rótulo `Á` rejeitado; rótulo repetido acusa `rows.1.label`; 51 filas; `seats` 0 e 101; capacidade 0 e 50.001; preço 0, 1, 10.000.000 e 10.000.001.
- [ ] T-3 Criar `catalog/http.ts` (requests, queries, views, respostas e tipos). (cobre CA-1)
  - Teste: `catalog/http.test.ts`: `ScheduleSessionRequestSchema` rejeita `salesStartsAt` igual ou posterior a `startsAt` com `path: ['salesStartsAt']`; aceita `Z` e `-03:00`; `CreateEventRequestSchema` sem `imageUrl` gera `null`; `AddBatchRequestSchema` sem `quantity`/`endsAt` gera `null`; `ListEventsQuerySchema` com `q: '  '` gera `undefined`, `pageSize: '49'` falha, sem parâmetros gera `page 1`/`pageSize 12`; uma resposta de exemplo de cada view valida.
- [ ] T-4 Criar `shared/time-zone.ts` e `shared/normalize.ts`. Algoritmo de `zonedLocalToInstant`: (1) validar `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$`; (2) `guess = Date.UTC(y, m-1, d, h, min)`; (3) `offset1 = offsetMinutes(guess, tz)`; (4) `instant = guess - offset1 * 60000`; (5) `offset2 = offsetMinutes(instant, tz)`; se diferente, `instant = guess - offset2 * 60000`; (6) `new Date(instant).toISOString()`. `offsetMinutes(ms, tz)` lê a parte `timeZoneName` de `new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(ms)` (`GMT` → 0; `GMT-03:00` → -180). `zonedParts` usa `formatToParts` com `{ timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }`. (cobre CA-3, CA-4)
  - Teste: `shared/time-zone.test.ts` com os vetores do CA-3 e ida e volta; `shared/normalize.test.ts` com o CA-4.
- [ ] T-5 Criar `catalog/events.ts` (14 schemas, união, payloads). (cobre CA-2)
  - Teste: `catalog/events.test.ts`: um envelope válido de cada tipo; `eventType` desconhecido, `schemaVersion: 2`, `SessionScheduled` com `active` em um setor (objeto estrito: `z.strictObject` nos setores) e `VenueRegistered` com `aggregateVersion: 2` falham.
- [ ] T-6 Criar `read-store/collections.ts` e `read-store/catalog-documents.ts`; atualizar `index.ts` sem colisão de nomes. (cobre CA-52)
  - Teste: `pnpm --filter @stubb/contracts build`, `typecheck`, `test` e `lint` com código 0.

### E2 — Fundação (trilha F)

- [ ] T-7 `infra/kafka/create-topics.sh`: acrescentar a criação de `catalog.events` igual à de `diagnostics.events`. (cobre CA-50)
  - Teste: `bash -n infra/kafka/create-topics.sh`.
- [ ] T-8 `infra/mongo/init-replica-set.js`: garantir as sete coleções de `READ_STORE_COLLECTIONS` (lista escrita no script, que não importa TS) e criar os índices da tabela "Read store" com os nomes indicados (`createIndex` é idempotente). (cobre CA-50)
  - Teste: `node --check infra/mongo/init-replica-set.js`.
- [ ] T-9 `docker-compose.yaml`: âncora `x-seed-organizer-id: &seed-organizer-id ${SEED_ORGANIZER_ID:-0193a4f0-0000-7000-8000-000000000001}` e `SEED_ORGANIZER_ID: *seed-organizer-id` no `environment` de `write-service` e `read-service`. (cobre CA-36)
  - Teste: `docker compose -f docker-compose.yaml config --quiet` e `docker compose config --quiet` com código 0 (não sobe nada).
- [ ] T-10 Scripts: raiz `seed:catalog` e `e2e/package.json` `seed:catalog` conforme "Interfaces"; `e2e/src/support/env.ts` com `BASE_URL` default `http://127.0.0.1:8080`; `apps/web/playwright.config.ts` com `baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080'`. (cobre CA-53)
  - Teste: `pnpm --filter @stubb/e2e typecheck`; `pnpm --filter @stubb/web typecheck`.
- [ ] T-11 Componentes shadcn: em `apps/web`, `pnpm exec shadcn add field input-group textarea native-select badge skeleton empty spinner alert separator breadcrumb --yes`; depois `pnpm install` na raiz e `pnpm exec prettier --write` nos arquivos gerados ou alterados. Conferir que `src/index.css` mantém `@import "tailwindcss"`. Se o pnpm gravar `minimumReleaseAgeExclude` ou pedir `allowBuilds`, manter as entradas (napkin). (cobre CA-49)
  - Teste: `pnpm --filter @stubb/web typecheck`, `pnpm --filter @stubb/web build` e `pnpm lint` (raiz) com código 0.

### E3 — write-service compartilhado (trilha WS)

- [ ] T-12 `config.ts` com `SEED_ORGANIZER_ID`; criar `Clock` e `CurrentOrganizer`; `errors.ts` com `BusinessRuleViolationError` e `EntityNotFoundError`. (cobre CA-5, CA-24)
  - Teste: `shared/actor/current-organizer.spec.ts` devolve o default.
- [ ] T-13 `DomainErrorFilter` com `code` e os cinco erros; `ZodValidationPipe` e `IdempotencyKey` no formato de "Interfaces". (cobre CA-24)
  - Teste: atualizar `domain-error.filter.spec.ts`, `zod-validation.pipe.spec.ts` e `idempotency-key.decorator.spec.ts` para os corpos novos, validando com `DomainErrorResponseSchema`/`ValidationErrorResponseSchema`.
- [ ] T-14 `OutboxWriter.append(boundedContext, envelopes)` genérico; `ping-event.mapper.ts` (`toPingEnvelopes(events: readonly PingDomainEvent[]): AnyEventEnvelope[]`, com o `instanceof` e o `parse` V1 que hoje estão no writer); `PingRepository` chama `outbox.append(BOUNDED_CONTEXT_DIAGNOSTICS, toPingEnvelopes(...))`. (cobre CA-5)
  - Teste: `ping-event.mapper.spec.ts` (envelope válido para os dois eventos); integração `create-ping`, `increment-ping`, `atomicity`, `idempotency`, `concurrency`, `cleanup` continuam verdes.
- [ ] T-15 `SharedModule` conforme "Interfaces"; `DiagnosticsModule` importa `SharedModule` e só registra o que é dele; `AppModule` importa `DiagnosticsModule` como hoje. (cobre CA-5)
  - Teste: `test/integration/shared-infra.int.test.ts`: `app.get(SchedulerRegistry).getCronJobs().size === 1` e `app.get(OutboxWriter, { strict: false })` resolve uma instância; os E2E do diagnóstico rodam na onda 4.

### E4 — projector genérico (trilha PS)

- [ ] T-16 `sequence.ts` com a assinatura nova e `sequence.spec.ts` atualizado (casos: nulo + 1, nulo + 2, igual, menor, atual + 1, atual + 2). (cobre CA-26)
  - Teste: `sequence.spec.ts`.
- [ ] T-17 `ProjectionExecutor` conforme "Interfaces". (cobre CA-26)
  - Teste: integração em `test/integration/projection-executor.int.test.ts` (Mongo 58017): evento repetido não chama `apply`; lacuna lança `ProjectionGapError` e nada é gravado; sucesso grava `processed_events` e `aggregate_versions` na mesma transação; falha dentro de `apply` desfaz os dois.
- [ ] T-18 `PingProjection.apply(event, tx)` só grava `pings` (insert em `PingCreated`; `updateOne` condicionado a `version = aggregateVersion - 1` em `PingIncremented`, lacuna se não casar, como defesa); `topic-registry.ts` só com o diagnóstico; `EventDispatcher` usa o executor; `KafkaConsumerService` assina o registro e escolhe o parse pelo tópico. (cobre CA-26, CA-27)
  - Teste: `ping-projection.int.test.ts` adaptado (mesmos casos da Fase 1 via dispatcher + executor, criando também `aggregate_versions`); `kafka-consumer.service.spec.ts` ganha "(6) tópico fora do registro: sem dispatch, sem commit, `exit(1)`" e usa `topic: 'diagnostics.events'` nos casos existentes.

### E5 — read-service (trilha R)

- [ ] T-19 `common/poll-until.ts`: `pollUntil<T>(read: () => Promise<T>, done: (value: T) => boolean, options?: { intervalMs?: number; timeoutMs?: number }): Promise<{ value: T; reached: boolean }>` (padrões 100 e 3000); `GetPingHandler` passa a usá-lo. `common/clock.ts`: `Clock` injetável com `now(): Date`. `config.ts` com `seedOrganizerId`. (cobre CA-38)
  - Teste: `poll-until.spec.ts` com timers falsos; `get-ping.handler.spec.ts` e `get-ping.int.test.ts` inalterados e verdes.
- [ ] T-20 `catalog/derived-state.ts` (funções puras, `now: Date` como parâmetro): `salesStarted(session, now)` = publicada e `salesStartsAt ≤ now < startsAt`; `currentBatch(session, sector, now)` = se `salesStarted`, o primeiro lote por `position` com `endsAt` nulo ou `> now`, senão nulo; `sessionEnded` = `now ≥ startsAt`; `sessionSalesOpen` = `salesStarted` e algum setor com lote vigente; `sectorSales(session, sector, now)` = `open` com o lote vigente, senão `upcoming` se `now < salesStartsAt`, senão `ended`; `batchBadge` conforme I-1; `eventEnded` = tem sessão publicada e todas as publicadas encerradas; `cardPrice(listing, now)` conforme RN-39 (sessões visíveis = publicadas, `startsAt > now`, `venue` não nulo). (cobre CA-34, CA-35, CA-36)
  - Teste: `derived-state.spec.ts` com relógio fixo: sessão em Rascunho sem lote vigente; virada por data (lote 1 com `endsAt` passado → lote 2 vigente); último lote sem limite vigente até o início; todos vencidos → `ended`; `salesStartsAt` futuro → `upcoming`; selos I-1; `cardPrice` nos três ramos e com várias sessões.
- [ ] T-21 `catalog/catalog-read.repository.ts` (acesso às quatro coleções) e `catalog/view-mappers.ts` (documento + `now` → views da Spec). `ListEvents`: pipeline `[{ $match }, { $addFields: { nextStartsAt } }, { $sort: { nextStartsAt: 1, titleSortKey: 1, _id: 1 } }, { $facet: { items: [{ $skip }, { $limit }], total: [{ $count: 'n' }] } }]`; `$match` = `sessions: { $elemMatch: { startsAt: { $gt: now }, venue: { $ne: null }, cityKey? } }` + `$text: { $search: q }` se houver `q` + `category` se houver; `cityKey` = `normalizeSearchKey(city)`; `nextStartsAt` = `$min` dos `startsAt` futuros com local. Mapeia cada item com `cardPrice` e a próxima sessão. (cobre CA-33, CA-34)
  - Teste: `test/integration/catalog-list-events.int.test.ts` (Mongo 58018, cria o índice de texto e os outros de `event_listing`): visibilidade (sessão passada, sem local), busca "hamlet" acha "Hamlet", "hámlet" acha, "ham" não acha; filtro "sao paulo" acha "São Paulo"; categoria; ordem com empate de data resolvida pelo título; paginação e `total`; `pageSize=49` → 400 via HTTP.
- [ ] T-22 Queries e controllers: `ListEventsQuery`, `GetEventQuery`, `ListOrganizerEventsQuery`, `GetOrganizerEventQuery`, `ListVenuesQuery`, `GetVenueQuery` com handlers; `public-events.controller.ts` (`catalog/events`) e `organizer.controller.ts` (`catalog/organizer`); `catalog.module.ts`; `AppModule` importa. Leituras por ID usam `pollUntil` até `doc.version >= minVersion`; `404` com `minVersionReached` conforme I-15; `GetEvent` público dá 404 para lápide, rascunho ou evento sem sessão publicada com local; leituras do produtor filtram `organizerId = seedOrganizerId`; `ListVenues` ordena com `localeCompare('pt-BR', { sensitivity: 'base' })` pelo nome e depois `_id`; `ListOrganizerEvents` ordena por `createdAt` e `_id` decrescentes. (cobre CA-35, CA-36, CA-37, CA-32)
  - Teste: `test/integration/catalog-get-event.int.test.ts` (página pública do CA-35 com `Clock` sobrescrito; `min_version` alcançado e não alcançado; 404 da lápide com `minVersionReached: true`) e `catalog-organizer.int.test.ts` (CA-36, CA-37, documento de outro dono invisível). Unit `view-mappers.spec.ts` para a forma das views validada com os schemas de `@stubb/contracts`.

### E6 — web fundação (trilha US)

- [ ] T-23 `src/api/http.ts`, `src/api/mutation-retry.ts` (movido), `src/api/diagnostics.ts` reescrito sobre `http.ts` mantendo `describeCommandError` do diagnóstico como está; `use-create-ping.ts` e `use-increment-ping.ts` importam o retry novo; remover o arquivo antigo. (cobre CA-39)
  - Teste: `api/http.test.ts` (POST/PATCH/DELETE, header, corpo ausente no DELETE, 202 exigido, 404 com `minVersionReached`); `api/diagnostics.test.ts` e os testes do diagnóstico passam sem mudar asserções.
- [ ] T-24 `src/lib/read-your-writes.ts` (`useVersionedQuery`); `features/diagnostics/use-ping.ts` reimplementado sobre ele com `budgetMs: Infinity`, mantendo a assinatura `usePing(id, minVersion)` e o retorno compatível com `ping-panel.tsx`. O limite usa `setTimeout` dentro de `useEffect` (o `setState` acontece no callback do timer, não no corpo do efeito); nenhum `Date.now()`/`performance.now()` no render. (cobre CA-47, CA-38)
  - Teste: `lib/read-your-writes.test.tsx` com `vi.useFakeTimers({ shouldAdvanceTime: true })` e `createFakeApi`: projeção chega em 600 ms → `synced`; nunca chega → `timed-out` aos 10 s e o polling para; `restart()` volta a `waiting`; `budgetMs: Infinity` nunca estoura; `diagnostics-page.test.tsx` continua verde.
- [ ] T-25 `src/lib/idempotency.ts`, `src/lib/format.ts`, `src/lib/money.ts`, `src/lib/catalog-labels.ts`, `src/api/command-errors.ts`, `src/api/query-keys.ts`, `src/components/projection-status.tsx`. (cobre CA-45, CA-46, CA-48, CA-47)
  - Teste: `idempotency.test.tsx` (mesma chave para o mesmo payload com chaves em outra ordem; nova após mudança e após `reset`); `format.test.ts` (`formatDateTime('2026-12-11T00:00:00.000Z', 'America/Manaus')` → `10/12/2026 20:00`; moeda com ` `); `money.test.ts` (`1.234,56` → 123456, `0,29` → 29, `R$ 80` → 8000, `abc`/`1,234` → null); `command-errors.test.ts` (400, 422 com campo, 422 sem campo, rede, desconhecido); `projection-status.test.tsx` (textos, botão "Atualizar").
- [ ] T-26 Rotas e layouts: `app/router.tsx` com a tabela "Rotas e stubs", `app/root-layout.tsx` (header, `<Outlet/>`, rodapé), `app/organizer-layout.tsx`, `pages/not-found-page.tsx` (também `errorElement` da rota raiz), stubs das páginas de UV e UP; `apps/web/e2e/diagnostics.spec.ts` passa a abrir `/diagnostico`. `app/query-client.ts` sem mudança. (cobre CA-39)
  - Teste: `app/router.test.tsx` com `renderRoutes`: `/` mostra o stub da vitrine dentro do layout com os três links; `/diagnostico` mostra "Diagnóstico do Stubb"; `/nao-existe` mostra "Página não encontrada".
- [ ] T-27 `src/test/render.tsx` (`renderRoutes`) e `src/test/fake-api.ts`. (cobre CA-49)
  - Teste: `test/fake-api.test.ts` (roteamento por padrão, `calls`, 404 padrão para rota não registrada).

### E7 — write-service Catalog (trilha WC)

Estrutura: `src/catalog/catalog.module.ts`; `domain/` (`venue.aggregate.ts`, `venue.events.ts`, `catalog-event.aggregate.ts`, `catalog-event.events.ts`, `batch-rules.ts`); `application/` (um `*.command.ts` e um `*.handler.ts` por command, em kebab-case: `register-venue`, `update-venue-details`, `add-venue-sector`, `remove-venue-sector`, `create-event`, `update-event-details`, `discard-event`, `schedule-session`, `remove-session`, `add-session-sector`, `remove-session-sector`, `add-batch`, `remove-batch`, `publish-session`); `infrastructure/` (`entities/*.entity.ts`, `venue.repository.ts`, `catalog-event.repository.ts`, `catalog-event.mapper.ts`); `http/` (`venues.controller.ts`, `events.controller.ts`). Padrão da Fase 1: agregado sobre `AggregateRoot` com `apply()` que só acumula; uma mutação = um evento = versão + 1; ID uuid v7 gerado no handler; agregado e entity separados.

- [ ] T-28 Agregado `Venue`: `register`, `rehydrate`, `updateDetails`, `addSector` (limite 20 → `VENUE_SECTOR_LIMIT_REACHED`; `name_key` repetido → `VENUE_SECTOR_NAME_TAKEN`; `position` = maior existente + 1, ou 1), `removeSector` (inexistente → `EntityNotFoundError`). Eventos de domínio internos com `aggregateVersion` e `occurredAt`. (cobre CA-6, CA-7, CA-8, CA-9)
  - Teste: `test/unit/catalog/venue.aggregate.spec.ts`.
- [ ] T-29 Agregado `CatalogEvent` com sessões, setores e lotes. Métodos e ordem das checagens:
  - `create(id, organizerId, details, now)`; `updateDetails(details, now)`; `discard(now)` (`EVENT_NOT_DRAFT` se Publicado);
  - `scheduleSession({ sessionId, venue, startsAt, salesStartsAt, timeZone, sectorIds }, now)`: `venue.timeZone !== timeZone` → `VENUE_TIME_ZONE_CHANGED`; planta vazia → `VENUE_WITHOUT_SECTORS`; 50 sessões → `SESSION_LIMIT_REACHED`; `startsAt ≤ now` → `SESSION_START_NOT_IN_FUTURE`; mesmo `venueId` + `startsAt` → `SESSION_DUPLICATED`; copia todos os setores (IDs de `sectorIds`, `position` e dados da planta);
  - `removeSession(sessionId)`, `addSessionSector(sessionId, venueSector, newId)`, `removeSessionSector(sessionId, sessionSectorId)`, `addBatch(sessionId, sessionSectorId, batch, newId)`, `removeBatch(...)`: sessão/setor/lote inexistente → `EntityNotFoundError`; sessão Publicada → `SESSION_NOT_DRAFT`; `addSessionSector`: setor já presente pelo `venueSectorId` → `SESSION_SECTOR_ALREADY_PRESENT`, nome repetido → `SESSION_SECTOR_NAME_TAKEN`;
  - `addBatch` (após sessão/setor/rascunho): 10 lotes → `BATCH_LIMIT_REACHED`; nome → `BATCH_NAME_TAKEN`; `quantity` > capacidade ou soma > capacidade → `BATCH_QUANTITY_EXCEEDS_CAPACITY`; `endsAt` ≤ `salesStartsAt` ou ≥ `startsAt` → `BATCH_END_OUT_OF_RANGE`; `endsAt` ≤ algum `endsAt` anterior → `BATCH_END_BEFORE_PREVIOUS`; último lote sem `quantity` nem `endsAt` → `PREVIOUS_BATCH_UNBOUNDED`; `position` = maior + 1;
  - `publishSession(sessionId, now)`: inexistente → `EntityNotFoundError`; Publicada → `SESSION_NOT_DRAFT`; `startsAt ≤ now` → `SESSION_START_NOT_IN_FUTURE`; sem setores → `SESSION_WITHOUT_SECTORS`; setor sem lote → `SECTOR_WITHOUT_BATCH`; lote com `endsAt ≤ now` → `BATCH_ENDED`; reaplica as regras de lote (`batch-rules.ts`, a mesma função usada no `addBatch`) sobre a sequência de cada setor; sucesso: sessão Publicada e, se o evento era Rascunho, evento Publicado, com **um** evento `SessionPublished` (retrato completo).
  (cobre CA-12 a CA-20)
  - Teste: `test/unit/catalog/catalog-event.aggregate.spec.ts` com um caso por regra e por código, e o CA-17 (um só evento acumulado na primeira publicação).
- [ ] T-30 Entities TypeORM das seis tabelas (relações `@ManyToOne` com `onDelete` para gerar as FKs, `@Unique` para as uniques, colunas `snake_case`); `data-source.ts` com as entities; migration gerada: com `stubb-it-postgres-write` de pé, `$env:DATABASE_URL='postgres://stubb:stubb@127.0.0.1:55432/stubb'`, `pnpm --filter @stubb/write-service build`, `pnpm --filter @stubb/write-service migrate`, `pnpm --filter @stubb/write-service migration:generate src/database/migrations/CatalogSchema`; revisar o SQL contra a tabela "PostgreSQL"; registrar em `migrations/index.ts`; `test/integration/setup.ts` trunca também as seis tabelas (`TRUNCATE ... CASCADE`). (cobre CA-6, CA-20)
  - Teste: `test/integration/catalog/schema.int.test.ts`: as FKs existem com a regra certa (`information_schema.referential_constraints`) e as uniques rejeitam duplicata.
- [ ] T-31 `VenueRepository` e `CatalogEventRepository`: `findById` carrega a raiz e os filhos na transação; `insert` grava raiz + filhos + `outbox.append(BOUNDED_CONTEXT_CATALOG, toCatalogEnvelopes(...))` + `uncommit()`; `update(agg, expectedVersion)` faz o `UPDATE ... WHERE id AND version = :expected` da raiz (zero linhas → `ConcurrencyConflictError`), depois `DELETE` dos filhos que saíram (sessões, setores, lotes) e `INSERT ... ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status` para sessões e `DO NOTHING` para setores e lotes; `delete(agg, expectedVersion)` (descarte) faz `DELETE ... WHERE id AND version` e grava `EventDiscarded`. `catalog-event.mapper.ts` converte cada evento de domínio no envelope `V1` validado (`parse`). (cobre CA-20, CA-21, CA-22)
  - Teste: coberto pelas integrações da T-33.
- [ ] T-32 Handlers e controllers: cada handler carrega com o repositório, usa `Clock.now()` e `CurrentOrganizer.id()`, gera IDs com `v7()`, persiste e devolve `{ id, version }` ou `{ id, version, entityId }`. `ScheduleSession` e `AddSessionSector` carregam o `Venue` pelo `VenueRepository` (inexistente → `VENUE_NOT_FOUND` na sessão; `venueSectorId` fora da planta do local da sessão → `VENUE_SECTOR_NOT_FOUND`). `UpdateEventDetails`/`UpdateVenueDetails` comparam `expectedVersion` com a versão carregada (diferente → `ConcurrencyConflictError`) e usam `expectedVersion` no UPDATE. Controllers: rotas da Spec, `@HttpCode(202)`, `@UseFilters(DomainErrorFilter)`, `@IdempotencyKey()`, `ZodValidationPipe` no corpo e `uuidSchema` nos parâmetros, `idempotency.execute({ key, scope: CATALOG_ROUTE_TEMPLATES.x, requestHash: hashRequest(MÉTODO, req.path, body) }, ...)`; `DELETE` e `publish` usam `EmptyCommandRequestSchema` no corpo (ausente = `{}`). `CatalogModule` importa `SharedModule`; `AppModule` importa `CatalogModule`. (cobre CA-6 a CA-23)
  - Teste: ver T-33.
- [ ] T-33 Integração (`test/integration/catalog/*.int.test.ts`, PostgreSQL 55432, `Clock` sobrescrito): `venues.int.test.ts` (CA-6, CA-7, CA-8, CA-9), `events.int.test.ts` (CA-10, CA-11, CA-20), `sessions.int.test.ts` (CA-12, CA-13, CA-14, CA-16, CA-19), `batches.int.test.ts` (CA-15), `publish.int.test.ts` (CA-17, CA-18), `concurrency.int.test.ts` (CA-21: dois `AddBatch` com `Promise.all`), `atomicity.int.test.ts` (CA-22: regra violada não deixa domínio, outbox nem chave), `idempotency.int.test.ts` (CA-23 com `PATCH` e `DELETE`), `errors.int.test.ts` (CA-24: cada corpo valida com o schema). Conferir na `outbox`: `bounded_context 'catalog'`, `aggregate_id`, `aggregate_version`, `event_type` e payload validando com o schema `V1`. (cobre CA-6 a CA-24)

### E8 — projector Catalog (trilha PC)

- [ ] T-34 `catalog/event-detail.reducer.ts`: função pura `reduceEventDetail(doc: EventDetailDocument | null, event: EventDomainEventV1, venue: SessionVenueSnapshot | null): EventDetailDocument | EventDetailTombstone` com as regras: `EventCreated` cria (`status 'draft'`, `createdAt`/`updatedAt` = `occurredAt`); `EventDetailsUpdated` troca os cinco campos; `EventDiscarded` devolve a lápide; `SessionScheduled` acrescenta a sessão (`status 'draft'`, `venue` = snapshot recebido, setores com `capacity` = soma de `seats` no marcado, `batches: []`); `SessionRemoved`, `SessionSectorAdded`, `SessionSectorRemoved`, `BatchAdded`, `BatchRemoved` mexem na árvore; `SessionPublished` põe a sessão e o evento em `published`. Em todos: `version = aggregateVersion`, `updatedAt = occurredAt`, arrays reordenados. Referência a filho inexistente lança erro (bug do write). (cobre CA-28)
  - Teste: `catalog/event-detail.reducer.spec.ts` com a sequência completa e um caso por tipo.
- [ ] T-35 `catalog/summaries.ts`: `toListing(detail): EventListingDocument | null` (nulo se não Publicado; só sessões publicadas; `titleSortKey = normalizeSearchKey(title)`; `cityKey` do snapshot ou nulo) e `toOrganizerEvent(detail): OrganizerEventDocument | null` (nulo na lápide). `catalog/venue.reducer.ts`: `reduceVenue(doc, event)` (`VenueRegistered` cria com `detailsVersion: 1`; `VenueDetailsUpdated` troca os cinco campos, `cityKey` e `detailsVersion`; setores com `capacity` calculada; `version`/`updatedAt` sempre) e `applyVenueSnapshot(detail, venueId, snapshot): EventDetailDocument | null` (troca `venue` nas sessões desse local quando nulo ou com `detailsVersion` menor; devolve nulo se nada mudou; não mexe em `version` nem `updatedAt`). (cobre CA-29, CA-31)
  - Teste: `summaries.spec.ts` e `venue.reducer.spec.ts` (incluindo o snapshot mais antigo que não sobrescreve).
- [ ] T-36 `catalog/catalog.projection.ts`: `apply(event: CatalogDomainEvent, tx)`. Evento do agregado Evento: lê `event_detail`; em `SessionScheduled`, monta o snapshot a partir de `venues` (`{ name, address, city, state, cityKey, detailsVersion }` ou nulo); reduz; grava `event_detail` (`replaceOne` com `upsert`); grava ou apaga `event_listing` e `organizer_events` conforme os mapeadores. Evento do `Venue`: reduz e grava `venues`; em `VenueRegistered`/`VenueDetailsUpdated`, busca `event_detail` com `{ 'sessions.venueId': id, status: { $ne: 'discarded' } }`, aplica `applyVenueSnapshot` e, para cada documento alterado, regrava detalhe e `event_listing`. Tudo dentro da `tx`. `topic-registry.ts` ganha `catalog.events`; `EventDispatcher` registra os 14 tipos; `ProjectionModule` provê `CatalogProjection`. (cobre CA-27, CA-28, CA-29, CA-30, CA-31, CA-32)
  - Teste: `test/integration/catalog-projection.int.test.ts` (Mongo 58017, cria as coleções e os índices em `beforeAll`): sequência completa via dispatcher (CA-28, CA-29), lápide (CA-32), fan-out para dois eventos (CA-31); `test/integration/catalog-commutativity.int.test.ts`: mesmos eventos nas ordens (a), (b) e (c) do CA-30 em bancos limpos e comparação `toEqual` dos quatro read models (sem `processed_events`).

### E9 — web público (trilha UV)

- [ ] T-37 `src/api/catalog-public.ts`: `listEvents(filters & { page })` e `getEvent(id)` sobre `getJson` com os schemas de contrato. (cobre CA-40, CA-41)
  - Teste: `catalog-public.test.ts` (URL com `q`, `city`, `category`, `page`, `pageSize`; 404 → `not-found`).
- [ ] T-38 Vitrine: `pages/showcase-page.tsx` + `features/showcase/` (`showcase-filters.tsx` com `useSearchParams` nos parâmetros `busca`, `cidade`, `categoria`; `use-showcase.ts` com `useInfiniteQuery` em `catalogKeys.publicEvents(filters)`, `initialPageParam: 1`, `getNextPageParam` = próxima página enquanto carregados < `total`; `event-card.tsx` com imagem ou `/placeholders/{category}.svg`, troca para o placeholder em `onError`, `alt` = título, local + cidade/UF, data `formatDateTime` no fuso da sessão, "+N datas", preço `formatMoney` / "Vendas a partir de {dd/mm}" / "Vendas encerradas"); `public/placeholders/{show,theater,stand_up,sports,festival,kids,other}.svg` (SVG simples com o rótulo da categoria). Textos de "Interfaces". (cobre CA-40, CA-49)
  - Teste: `showcase-page.test.tsx` com `createFakeApi` e `renderRoutes`: filtros vão para a URL e para a requisição; card completo; placeholder; "Carregar mais" acrescenta e some; vazio.
- [ ] T-39 Página do evento: `pages/event-page.tsx` + `features/event-page/` (cabeçalho com imagem, categoria, classificação; descrição com `whitespace-pre-line`; sessões `section` "Sessão de {dd/mm/aaaa HH:mm}" com local e endereço; setores com tipo e lote vigente ou "Vendas a partir de {dd/mm HH:mm}" / "Vendas encerradas"; "Sessão encerrada"; "Evento encerrado"; 404 "Evento não encontrado"; sem botão de compra). (cobre CA-41, CA-49)
  - Teste: `event-page.test.tsx` cobrindo cada estado do CA-41 com dados simulados.

### E10 — web produtor (trilha UP)

Padrão de todo submit: `useIdempotencyKey().keyFor(payload)` → `useMutation` com `sendCommand`, `retry: shouldRetryCommand`, `retryDelay: COMMAND_RETRY_DELAY_MS` → no sucesso, `reset()` da chave e `minVersion = result.version` na leitura versionada da tela (`useVersionedQuery`) → `ProjectionStatus` → ao `synced`, invalidar as listas (`catalogKeys.organizerEvents`, `catalogKeys.organizerVenues`). Erros com `commandErrorToForm` (`setError` por campo, foco no primeiro inválido, `Alert` no topo). `409` em edição: mensagem do CA-44, `restart()`/refetch da leitura e `reset()` do formulário com os dados e a versão novos. Formulários com `react-hook-form` + `zodResolver` do schema do contrato (ou de um schema de formulário que termina nele com `.pipe`), `noValidate`, componentes `Field`/`FieldLabel`/`FieldError`.

- [ ] T-40 `src/api/catalog-organizer.ts`: uma função por command (os 14, cada uma recebendo os parâmetros de rota, o corpo e a `idempotencyKey`) e as quatro leituras do produtor (`listOrganizerEvents(page)`, `getOrganizerEvent(id, minVersion?)`, `listVenues()`, `getVenue(id, minVersion?)`), todas sobre `http.ts` e `catalogRoutes`. (cobre CA-42, CA-43)
  - Teste: `catalog-organizer.test.ts` (método, rota, chave e corpo de cada command; `DELETE` sem corpo).
- [ ] T-41 Locais: `pages/organizer/venues-page.tsx` (lista, I-5), `new-venue-page.tsx` (cadastro; espera `GetVenue` com `min_version` e navega para `/produtor/locais/:id`), `venue-page.tsx` (edição com `expectedVersion`, planta com remoção e formulário de setor com `useFieldArray` para filas, campo "Capacidade" só para pista). (cobre CA-42, CA-44, CA-45)
  - Teste: `venue-pages.test.tsx` com `createFakeApi` simulando projeção atrasada: cadastro → "Aguardando projeção…" → navegação; setor marcado com duas filas envia `rows`; `422 VENUE_SECTOR_NAME_TAKEN` aparece no campo nome; `409` na edição recarrega.
- [ ] T-42 Eventos: `events-page.tsx` (lista paginada "Carregar mais", I-4), `new-event-page.tsx` (cria e navega à gestão depois da projeção), `event-manage-page.tsx` + `features/organizer/` (edição com `expectedVersion`; descarte com confirmação I-10, espera o 404 com `minVersionReached: true` e volta para a lista; agendar sessão com seleção do local, datas `datetime-local` convertidas por `zonedLocalToInstant` no fuso do local e `timeZone` no corpo; em `VENUE_TIME_ZONE_CHANGED`, invalida `catalogKeys.organizerVenues`/`organizerVenue` e mostra a mensagem; por sessão em Rascunho: "Publicar sessão", "Remover sessão", "Adicionar setor à sessão" com os setores da planta atual do local (via `GetVenue`) que não estão na sessão, "Remover setor", formulário de lote com preço por `parsePriceToCents` e `endsAt` no fuso da sessão, "Remover lote"; selos de lote e de sessão). (cobre CA-43 a CA-48)
  - Teste: `event-manage-page.test.tsx`: agendar converte `2026-12-10T20:00` em Manaus para `2026-12-11T00:00:00.000Z` e envia `timeZone`; `VENUE_TIME_ZONE_CHANGED`; lote com `1.234,56` envia `priceCents: 123456`; publicação mostra espera e o selo "Publicada"; descarte confirma e navega; reenvio após erro de rede usa a mesma chave e, após mudar o campo, chave nova (CA-46); 10 s sem projeção mostram "Salvo. Os dados podem demorar a aparecer." (CA-47); acessibilidade (CA-49): `aria-invalid`, foco, `h1`.

### E11 — Integração (trilha X)

- [ ] T-43 `e2e/src/support/http.ts` aceita `PATCH` e `DELETE`; `kafka.ts` recebe o tópico por parâmetro (padrão `DIAGNOSTICS_TOPIC`); `support/catalog.ts` com builders que criam local com planta, evento, sessão (datas relativas a agora: `startsAt` +30 dias, `salesStartsAt` −1 min), lotes e publicação, e `readAt(path, minVersion)` com espera de até 30 s. (cobre CA-51)
  - Teste: `pnpm --filter @stubb/e2e typecheck` e lint.
- [ ] T-44 Subir a stack: `infra/scripts/docker-up.ps1`; `pnpm stack:up`; como o volume pode ter `pings` sem `aggregate_versions` (migração do Ping, OQ-84), rodar `pnpm replay` uma vez antes dos testes; conferir `catalog.events` (`kafka-topics.sh --describe`), as coleções e os índices (`db.event_listing.getIndexes()`). (cobre CA-50)
  - Teste: os comandos de "Verificação", bloco "Stack".
- [ ] T-45 `e2e/src/api/catalog.e2e.test.ts`: fluxo do CA-51 pelo gateway; mensagens em `catalog.events` com key = ID do agregado e ordem por `aggregateVersion` (CA-25); idempotência de `PATCH` e `DELETE` (CA-23); um erro 422 e um 400 validando com os schemas (CA-24). Nomes e títulos com sufixo único em palavra (`e2e` + 8 hex sem hífen). (cobre CA-23, CA-24, CA-25, CA-51)
  - Teste: `pnpm --filter @stubb/e2e test:e2e`.
- [ ] T-46 Replay: `replay.ts` apaga `READ_STORE_COLLECTION_NAMES` e reseta o grupo com `--all-topics`; `replay.e2e.test.ts` acrescenta um evento do Catalog completo e compara `event_listing`, `event_detail`, `organizer_events` e `venues` antes e depois (`toEqual`), além do ping. (cobre CA-52)
  - Teste: `pnpm --filter @stubb/e2e test:e2e` (a pasta `replay` roda depois de `api`).
- [ ] T-47 Playwright: `apps/web/e2e/catalog-organizer.spec.ts` (cadastra local com setor de pista e setor marcado, cria evento, agenda sessão, adiciona lote, publica, acha o evento na vitrine pela busca e abre a página; asserções de espera com `{ timeout: 15_000 }`) e `catalog-public.spec.ts` (semeia pela API com `request` e `Idempotency-Key`, confere card e página). `diagnostics.spec.ts` continua verde em `/diagnostico`. (cobre CA-53, CA-39)
  - Teste: `pnpm --filter @stubb/web test:e2e`.
- [ ] T-48 Regressão do diagnóstico: `e2e/src/api/*.e2e.test.ts` da Fase 1 continuam verdes (com o corpo de erro ganhando `code`, ajustar só asserções que comparem o corpo inteiro). (cobre CA-5)
  - Teste: `pnpm test:e2e`.
- [ ] T-49 Rodar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:e2e` na raiz. (cobre CA-56)

### E12 — Seed (trilha X)

- [ ] T-50 `e2e/src/seed/catalog-seed.ts` (mecanismo): verifica `GET /api/catalog/organizer/events` (todas as páginas) e, se algum dos quatro títulos de demonstração existir, imprime "Seed de demonstração já existe; nada a fazer." e sai com código 0; senão, executa os passos em ordem com `Idempotency-Key` nova por command e espera cada projeção com `min_version` (`readAt`) antes do passo seguinte, lendo da leitura do produtor os IDs dos setores copiados. `D` e as datas de cada local são calculadas no fuso do local com `zonedLocalToInstant`. `e2e/src/seed-cli.ts` chama o seed e imprime o resumo. (cobre CA-54)
  - Teste: T-52.
- [ ] T-51 Passos do seed (valores na T-52): para cada local da OQ-8, `RegisterVenue` + `AddVenueSector` por setor (Teatro Aurora: Plateia marcado A-J × 20, Balcão marcado A-E × 16; Arena Horizonte: Pista 3.000, Pista Premium 500, Cadeira Superior marcado A-T × 50; Casa Rio Negro: Pista 600, Mezanino marcado A-D × 25); para cada evento, `CreateEvent` (categoria e classificação da OQ-8), `ScheduleSession` por sessão, `RemoveSessionSector` do Balcão na sessão de São Paulo de "Riso Solto", `AddBatch` na ordem da tabela, `PublishSession` nas sessões marcadas como publicadas. (cobre CA-54)
  - Teste: T-52.
- [ ] T-52 Dados do seed em `catalog-seed.ts` (OQ-8 e OQ-99). Regras de cálculo:
  - `seedStartedAt` = instante em que o script começa (`new Date().toISOString()`), calculado uma vez;
  - `D` = data de hoje no fuso de cada local (`zonedParts(seedStartedAt, timeZone)`); `D+N HH:mm` = essa data mais N dias (somar com `Date.UTC(ano, mês - 1, dia + N)` e formatar `YYYY-MM-DD`), às `HH:mm` no fuso do local, convertido com `zonedLocalToInstant`;
  - datas dadas só como dia ("fim em D+15", "vendas a partir de D+10") = `D+N 00:00` no fuso do local;
  - `salesStartsAt` = `seedStartedAt` em todas as sessões, exceto a de Manaus de "Riso Solto" (`D+10 00:00`, `America/Manaus`);
  - o corpo de `ScheduleSession` leva o `timeZone` do local;
  - preços em centavos; nenhum evento tem `imageUrl`.

  Locais (cada setor criado com `AddVenueSector`, na ordem abaixo; filas de assento marcado com rótulos consecutivos e a mesma quantidade de assentos):

  | Local | `address` | `city` / `state` | `timeZone` | Setores (ordem) |
  |---|---|---|---|---|
  | Teatro Aurora | Rua das Acácias, 120 - Centro | São Paulo / SP | `America/Sao_Paulo` | Plateia (`seated`, filas A a J, 20 assentos cada); Balcão (`seated`, filas A a E, 16 cada) |
  | Arena Horizonte | Avenida Horizonte, 1000 - Centro | Belo Horizonte / MG | `America/Sao_Paulo` | Pista (`general_admission`, 3000); Pista Premium (`general_admission`, 500); Cadeira Superior (`seated`, filas A a T, 50 cada) |
  | Casa Rio Negro | Rua do Porto, 200 - Centro | Manaus / AM | `America/Manaus` | Pista (`general_admission`, 600); Mezanino (`seated`, filas A a D, 25 cada) |

  Eventos (`CreateEvent`, depois as sessões na ordem da lista):

  | Evento | `category` / `ageRating` | `description` |
  |---|---|---|
  | Hamlet | `theater` / `14` | "Montagem da tragédia de Shakespeare em temporada no Teatro Aurora." |
  | Horizonte Rock Festival | `festival` / `16` | "Dois dias de rock com bandas nacionais na Arena Horizonte." |
  | Riso Solto: a turnê | `stand_up` / `16` | "Espetáculo de stand-up em turnê por São Paulo e Manaus." |
  | Bolhas de Sabão | `kids` / `L` | "Espetáculo infantil com música, bolhas e muita brincadeira." |

  Sessões, setores e lotes (lotes adicionados na ordem; "sem limite" = sem `quantity` e sem `endsAt`):

  | Evento | Sessão (`startsAt`, local) | Setores da sessão e lotes | Publicar? |
  |---|---|---|---|
  | Hamlet | D+30 20:00, Teatro Aurora | Plateia: "1º lote" 8000, `quantity` 100, `endsAt` D+15 00:00; "2º lote" 10000, sem limite. Balcão: "Lote único" 5000, sem limite | sim |
  | Hamlet | D+31 20:00, Teatro Aurora | igual à anterior | sim |
  | Hamlet | D+32 18:00, Teatro Aurora | igual à anterior | sim |
  | Hamlet | D+33 20:00, Teatro Aurora | Plateia e Balcão copiados, sem lotes | não (Rascunho) |
  | Horizonte Rock Festival | D+60 16:00, Arena Horizonte | Pista: "1º lote" 15000, `quantity` 1000, `endsAt` D+20 00:00; "2º lote" 19000, `quantity` 1000, `endsAt` D+40 00:00; "3º lote" 23000, sem limite. Pista Premium: "1º lote" 35000, `quantity` 200; "2º lote" 42000, sem limite. Cadeira Superior: "Lote único" 28000, sem limite | sim |
  | Horizonte Rock Festival | D+61 16:00, Arena Horizonte | igual à anterior | sim |
  | Riso Solto: a turnê | D+45 21:00, Teatro Aurora | `RemoveSessionSector` do Balcão; Plateia: "Lote único" 7000, sem limite | sim |
  | Riso Solto: a turnê | D+52 21:00, Casa Rio Negro (`salesStartsAt` D+10 00:00 em Manaus) | Pista: "Lote único" 6000, sem limite. Mezanino: "Lote único" 9000, sem limite | sim |
  | Bolhas de Sabão | D+40 15:00, Teatro Aurora | Plateia e Balcão copiados, sem lotes | não (Rascunho) |

  Depois de rodar `pnpm seed:catalog` duas vezes (cobre CA-54):
  - Teste: primeira execução cria os 3 locais e 4 eventos (conferir em `/` e em `/produtor/eventos`); a segunda imprime "Seed de demonstração já existe; nada a fazer.".

### E13 — Documentação (trilha X)

- [ ] T-53 `docs/architecture/overview.md`: tabela de read models com `event_listing`, `event_detail`, `organizer_events` e `venues` (e a menção a `aggregate_versions`/`processed_events` como infraestrutura do projector), estados do relógio derivados na query e o fluxo do Catalog (local → evento → sessão → setores → lotes → publicação por sessão). `docs/domain/glossary.md`: Local com planta, Setor (modelo na planta e cópia na sessão), Sessão (Rascunho/Publicada, `salesStartsAt`, fuso copiado), Lote (sequencial, `quantity` como teto, `endsAt`). `README.md`: Catalog no "Como rodar", `pnpm seed:catalog`, `pnpm replay` uma vez depois de atualizar (migração do Ping), rotas do web. (cobre CA-55)
  - Teste: leitura revisada; `pnpm exec prettier --check README.md` não se aplica (`*.md` está no `.prettierignore`).

## Verificação

Comandos para PowerShell (sem `&&`; um por linha). Containers isolados conforme o `README.md`.

```
# Fim de cada onda (thread principal)
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
# esperado: os quatro com código 0

# Contratos (C)
pnpm --filter @stubb/contracts build
pnpm --filter @stubb/contracts test
# esperado: todos os testes de catalog/*, http/*, shared/* verdes

# write-service (WS, WC) — PostgreSQL isolado na 55432
docker run -d --rm --name stubb-it-postgres-write -e POSTGRES_USER=stubb -e POSTGRES_PASSWORD=stubb -e POSTGRES_DB=stubb -p 55432:5432 postgres:18.6-trixie
pnpm --filter @stubb/write-service test
pnpm --filter @stubb/write-service test:integration
docker stop stubb-it-postgres-write
# esperado: unit e integração verdes, incluindo test/integration/catalog/*

# projector (PS, PC) — MongoDB replica set na 58017
docker run -d --rm --name stubb-it-mongo-projector -p 58017:27017 mongo:8.0.34 --replSet rs0 --bind_ip_all
docker exec stubb-it-mongo-projector mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
pnpm --filter @stubb/projector test
pnpm --filter @stubb/projector test:integration
docker stop stubb-it-mongo-projector
# esperado: ping-projection, projection-executor, catalog-projection e catalog-commutativity verdes

# read-service (R) — MongoDB na 58018
docker run -d --rm --name stubb-it-mongo-read -p 58018:27017 mongo:8.0.34
pnpm --filter @stubb/read-service test
pnpm --filter @stubb/read-service test:integration
docker stop stubb-it-mongo-read

# web (US, UV, UP)
pnpm --filter @stubb/web test
pnpm --filter @stubb/web build

# Stack (X)
powershell -NoProfile -ExecutionPolicy Bypass -File infra/scripts/docker-up.ps1
pnpm stack:up
pnpm replay
docker compose -f docker-compose.yaml exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --describe --topic catalog.events
docker compose -f docker-compose.yaml exec -T mongo mongosh --quiet stubb_read --eval "db.event_listing.getIndexes().map(i => i.name)"
# esperado: catalog.events com PartitionCount 3 e retention.ms=-1; os 6 índices de event_listing (incluindo _id_)
pnpm test:e2e
# esperado: e2e de API (diagnóstico e catalog), replay e Playwright (diagnóstico e catalog) verdes
pnpm seed:catalog
pnpm seed:catalog
# esperado: primeira cria os dados; segunda imprime "Seed de demonstração já existe; nada a fazer."
```

Checagem manual final: abrir `http://127.0.0.1:8080/`, buscar um evento do seed, abrir a página, entrar em "Área do produtor" e conferir os selos dos lotes.

## Notas para o implementador

- **Fronteiras (regras 1 e 10).** O write-service nunca importa `mongodb`; o projector e o read-service nunca importam `pg`/`typeorm` (testes de arquitetura existentes). O handler de `ScheduleSession` lê o `Venue` no PostgreSQL pelo `VenueRepository` do mesmo contexto; o projector lê só o próprio store.
- **Um evento por command (OQ-63).** `PublishSession` muda dois estados gravados e emite só `SessionPublished`. Não existe `EventPublished`.
- **Determinismo (regra 6).** No projector, datas só de `occurredAt`; o fan-out do local não mexe em `version` nem `updatedAt` do `event_detail`; o snapshot guarda `detailsVersion` (e não `version`) do local, porque eventos de planta também aumentam a versão do local e não fazem fan-out. Sem isso o replay muda o documento.
- **`$text` e collation.** Não usar `collation` nas agregações com `$text`; o desempate por título usa `titleSortKey` (I-9).
- **Lint tipado (napkin).** Supertest: helpers `api(ctx)` e `body<T>(res)` de `test/integration/setup.ts`; `vi.fn()` guardado numa variável antes de `expect(...)`; sem `const { x: _x, ...rest }`; no web, `nowMs()` de `src/lib/clock.ts` em vez de `performance.now()` em callbacks, e nada de relógio no render (`react-hooks/purity`).
- **Vitest sem globals (napkin).** O `setup.ts` do web já faz `cleanup`; não usar `BASE_URL` como variável de configuração.
- **Contratos compilados.** O web e os apps consomem `libs/contracts/dist`: rodar `pnpm --filter @stubb/contracts build` depois de mudar o contrato (os scripts da raiz já fazem).
- **TypeORM.** `migration:generate` roda sobre o `dist/`: `nest build` antes (napkin). A migration gerada precisa ser revisada contra a tabela "PostgreSQL" (nomes de constraint, `ON DELETE`).
- **Windows/WSL (napkin).** Acessar a stack por `127.0.0.1`; `infra/scripts/docker-up.ps1` antes de qualquer `docker`; `COMPOSE_CONVERT_WINDOWS_PATHS=1` em terminais antigos; se o E2E de queries falhar em cascata depois do replay, conferir `docker compose ps` antes do código; cliente Kafka do E2E com `'broker.address.family': 'v4'`.
- **Portas.** 55432, 58017 e 58018 ficam fora das faixas excluídas do Windows; se um container não subir, rodar `netsh interface ipv4 show excludedportrange protocol=tcp`.
- **shadcn (napkin).** O CLI 4.x mexe em `src/index.css` e `package.json`; rodar Prettier nos arquivos gerados; `components/ui/**` fica fora do ESLint mas não do Prettier.
- **pnpm 12 (napkin).** Manter `minimumReleaseAgeExclude` e `allowBuilds` que o `install` gravar.
- **Fuso no TypeScript.** Se o `lib` ES2023 não tipar `timeZoneName: 'longOffset'`, declarar as opções como `Intl.DateTimeFormatOptions` com um cast local comentado; não mudar o `tsconfig.base.json`.
- **Idempotência.** O `scope` é o template da rota (`CATALOG_ROUTE_TEMPLATES`) e o hash usa `req.path` real; `DELETE` sem corpo vira `{}` no pipe e no hash.
- **Replay depois da migração do Ping (OQ-84).** Num volume existente, o primeiro `PingIncremented` de um ping antigo seria lacuna, porque `aggregate_versions` começa vazio. Rodar `pnpm replay` uma vez (T-44) e documentar no README (T-53).
- **Docs consultadas.** NestJS CQRS recipe; TypeORM 1.x; MongoDB 8.0 (índice de texto, restrições de `$text`); TanStack Query v5 (polling com `refetchInterval` como função, pausa com a aba em segundo plano); shadcn `Field` + React Hook Form. Referências completas nos anexos do Research.
