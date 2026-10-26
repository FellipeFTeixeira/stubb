---
feature: Catalog
fase: 2 — Catalog
area: Backend (write-service, libs/contracts, tópico e conector)
date: 2026-10-25
status: draft
---

# Catalog — Research parcial: Backend (write side)

## Objetivo

Mapear como o contexto Catalog entra no `apps/write-service` e em `libs/contracts`: agregados e fronteiras de consistência, commands que devolvem ack/ID/versão, eventos de domínio com contrato Zod versionado, tabelas e migrations no PostgreSQL, tratamento do produtor seed, validações, rotas REST com `Idempotency-Key` e a entrada dos eventos novos no Outbox Event Router e no Kafka.

Conceito de CQRS exercitado no write side: é o **primeiro fluxo real command → evento → projeção** (`docs/roadmap.md:13`). O Ping provou o mecanismo com um agregado de uma linha só. O Catalog obriga a decidir coisas que o Ping não tinha: agregado com entidades filhas e versão única, mais de um tipo de agregado alimentando o mesmo read model desnormalizado (`event_listing`), eventos que precisam carregar dado suficiente para o lado de leitura montar a vitrine sem consultar o write store (regra 1 ao contrário: o read side também nunca lê o PostgreSQL), e a consequência da regra 5 (ordem só por agregado) quando o read model junta agregados diferentes.

## Escopo

**Dentro (desta área):**
- Módulo `catalog` no write-service: commands, handlers, agregados, repositórios Data Mapper, entities TypeORM, controller HTTP.
- Contratos em `libs/contracts/src/catalog/`: constantes, schemas Zod de request e de eventos `V1`.
- Migration TypeORM com as tabelas do Catalog.
- Generalização do que hoje está preso ao `diagnostics` (outbox writer, registro dos providers compartilhados).
- Produtor seed do lado do write-service.
- Tópico `catalog.events` em `infra/kafka/create-topics.sh` (o conector Debezium não precisa mudar, ver mapeamento).
- Testes unitários dos agregados e de integração dos commands, no padrão do skeleton.

**Fora (desta área):**
- Projeção `event_listing`, consumo de `catalog.events` no projector, queries e `min_version` no read-service (área ReadSide).
- Telas da vitrine, página do evento e formulários do produtor (área Frontend).
- Definição das regras de negócio do domínio (área Dominio). Esta parcial aponta onde cada regra afeta o write side e levanta OQs, mas não decide.
- Identity: cadastro, login, JWT e papéis (Fase 3, `docs/roadmap.md:14`).
- Mapa de assentos, holds, disponibilidade e virada de lote por esgotamento (Fases 4 e 5, `docs/roadmap.md:15-16`).
- Consumo de eventos do Kafka pelo write-service (sagas, Fase 5).

## Mapeamento da codebase

### Como o `diagnostics` (Ping) foi montado, camada por camada

| Camada | Onde | O que faz | Reaproveitável no Catalog? |
|---|---|---|---|
| Registro de módulos | `apps/write-service/src/app.module.ts:12-15` | `CqrsModule.forRoot()`, `ScheduleModule.forRoot()`, `TypeOrmModule.forRootAsync`, `DiagnosticsModule` | Sim; `CatalogModule` entra na lista de `imports`. O `@nestjs/cqrs` descobre handlers registrados como provider em qualquer módulo |
| Módulo | `apps/write-service/src/diagnostics/diagnostics.module.ts:16-26` | Registra `PingEntity`, `OutboxEntity`, `IdempotencyKeyEntity` no `forFeature` e, como providers, **também os compartilhados**: `OutboxWriter`, `TransactionContext`, `IdempotencyService`, `IdempotencyCleanupJob` | **Não como está.** Ver "Pontos que precisam mudar" |
| Command | `apps/write-service/src/diagnostics/application/create-ping.command.ts:4` | `extends Command<CommandAccepted>`: o `CommandBus.execute` infere o retorno | Sim, mesmo padrão |
| Handler de criação | `apps/write-service/src/diagnostics/application/create-ping.handler.ts:12-17` | Gera o ID com `v7()` na aplicação, cria o agregado, `repository.insert`, devolve `{ id, version: 1 }` | Sim |
| Handler de alteração | `apps/write-service/src/diagnostics/application/increment-ping.handler.ts:12-17` | Carrega, guarda `expected = ping.version`, muta, `repository.update(ping, expected)`; inexistente → `AggregateNotFoundError` | Sim; a versão esperada vem da leitura no servidor, não do cliente (ver OQ-Backend-12) |
| Agregado | `apps/write-service/src/diagnostics/domain/ping.aggregate.ts:14`, `:38-42`, `:55-60` | `extends AggregateRoot`; `apply()` só acumula eventos (sem `commit()`/EventBus); cada mutação faz `version += 1` e aplica um evento com a nova versão | Sim. Um evento por mutação, uma versão por evento |
| Eventos de domínio | `apps/write-service/src/diagnostics/domain/ping.events.ts:3-21` | Classes `IEvent` internas ao write-service, com `aggregateVersion` e `occurredAt` | Sim; distintas dos schemas públicos de `libs/contracts` |
| Repositório | `apps/write-service/src/diagnostics/infrastructure/ping.repository.ts:21-32`, `:35-46` | Data Mapper; `insert` grava linha + `outbox.append(getUncommittedEvents())` + `uncommit()`; `update` faz `UPDATE ... WHERE id = :id AND version = :expected` e lança `ConcurrencyConflictError` se `affected !== 1` | Sim; precisa ser estendido para entidades filhas (OQ-Backend-16) |
| Entity | `apps/write-service/src/diagnostics/infrastructure/ping.entity.ts:3` | Tabela `diagnostics_pings`: convenção `{contexto}_{tabela}`, colunas snake_case | Sim (OQ-Backend-16 confirma o padrão de nomes) |
| Controller | `apps/write-service/src/diagnostics/http/pings.controller.ts:20-61` | `@Controller('diagnostics/pings')` + prefixo global `api` (`src/main.ts:8`); `@HttpCode(202)`; `@IdempotencyKey()`; `ZodValidationPipe` com schema de `libs/contracts`; `idempotency.execute({ key, scope: <template da rota>, requestHash: hashRequest(método, req.path, body) }, () => commandBus.execute(...))` | Sim, mesmo padrão |
| Outbox | `apps/write-service/src/shared/outbox/outbox-writer.ts:22-65`, `outbox.entity.ts:3-35` | Monta o envelope, valida com o schema Zod `V1` antes de inserir (`:51`, `:58`) e grava na `outbox` pelo `EntityManager` da transação corrente | Parcialmente: preso ao Ping (ver abaixo) |
| Transação | `apps/write-service/src/shared/transaction/transaction-context.ts:12-20` | `AsyncLocalStorage<EntityManager>`; `run()` abre a transação; `manager()` lança se não houver transação | Sim |
| Idempotência | `apps/write-service/src/shared/idempotency/idempotency.service.ts:12-54` | Reserva a chave (`INSERT ... ON CONFLICT ... WHERE created_at < now() - 24h`), executa o command e grava a resposta, tudo na mesma transação; reuso com hash diferente → `IdempotencyKeyMismatchError` (422); falha do command desfaz a chave | Sim. Atenção: grava `response_status = 202` fixo (`:50`) |
| Header | `apps/write-service/src/shared/idempotency/idempotency-key.decorator.ts:5-11` | Header obrigatório, UUID, senão `400` | Sim |
| Limpeza | `apps/write-service/src/shared/idempotency/idempotency-cleanup.job.ts:11` | `@Cron(EVERY_HOUR, { name: 'idempotency-cleanup' })` | Sim, mas só pode existir **uma** instância (nome do cron é único) |
| Hash | `apps/write-service/src/shared/idempotency/request-hash.ts:3-5` | SHA-256 de `{ method, path, body }` | Sim |
| Erros | `apps/write-service/src/shared/errors.ts:1-20`, `shared/http/domain-error.filter.ts:9-22` | `ConcurrencyConflictError` → 409, `AggregateNotFoundError` → 404, `IdempotencyKeyMismatchError` → 422; corpo `{ statusCode, message, error }` | Precisa de novos erros para invariantes do Catalog (OQ-Backend-15) |
| Validação HTTP | `apps/write-service/src/shared/http/zod-validation.pipe.ts:7-18` | `400` com `{ message: 'Validation failed', issues: [{ path, message }] }`; corpo ausente vira `{}` | Sim |
| DataSource | `apps/write-service/src/database/data-source.ts:12`, `:20` | Lista explícita de entities; export default para a CLI do TypeORM | Adicionar as entities do Catalog |
| Migrations | `apps/write-service/src/database/migrations/index.ts:3`, `1792869381065-InitialSchema.ts:7-18`, `src/database/migrate.ts:6` | Lista explícita; geradas com `migration:generate` sobre o `dist/` (`package.json:16`, napkin linha 30), executadas pelo one-shot `db-migrate` com `transaction: 'each'` | Nova migration do Catalog entra na lista |
| Config | `apps/write-service/src/config.ts:3-6` | Zod sobre `process.env` com defaults | Lugar natural do ID do produtor seed, se essa for a opção (OQ-Backend-19) |
| Testes | `apps/write-service/test/integration/setup.ts:22-40`, `test/unit/architecture.spec.ts:6-16` | App Nest real contra Postgres de teste (porta 55432), `truncateAll` com lista fixa de tabelas (`:39`); teste de fronteira proíbe `mongodb`/`mongoose` no write-service | Copiar o padrão; `truncateAll` precisa das tabelas do Catalog |

### Contratos (`libs/contracts`)

- `libs/contracts/src/events/envelope.ts:4-21`: `createEventEnvelopeSchema(eventType, aggregateType, payload)` com `schemaVersion: z.literal(1)` (`:12`), `aggregateId: uuid` (`:14`), `aggregateVersion >= 1`, `occurredAt` ISO, `correlationId`/`causationId` nulos. Serve para os eventos do Catalog sem mudança enquanto forem `V1`.
- `libs/contracts/src/diagnostics/events.ts:6-21`: um schema por evento e versão (`PingCreatedV1Schema`) e uma união discriminada por `eventType` por contexto (`DiagnosticsEventSchema`), consumida pelo projector (`apps/projector/src/kafka/kafka-consumer.service.ts:35`).
- `libs/contracts/src/diagnostics/constants.ts:1-17`: bounded context, tópico, aggregate type, nomes de evento, helpers de rota e `DIAGNOSTICS_ROUTE_TEMPLATES` (scope da idempotência).
- `libs/contracts/src/diagnostics/http.ts:13`: **`CommandAcceptedSchema` mora dentro de `diagnostics/`**, mas é o contrato genérico de resposta de qualquer command (regra 2). Deve ir para um módulo compartilhado (`http/`) mantendo o export.
- `libs/contracts/src/index.ts:1-6`: barrel; `libs/contracts/src/shared/schemas.ts:3-5`: `uuidSchema`, `idempotencyKeySchema`, `minVersionSchema`.
- Mudança em `libs/contracts/src` dispara `rebuild` dos três apps no dev (`docker-compose.override.yaml:28-29`, `:54-55`, `:80-81`).

### Caminho do evento até o Kafka

- O conector roteia por coluna, não por agregado: `route.by.field = bounded_context` e `route.topic.replacement = ${routedByValue}.events` (`infra/debezium/register-connector.sh:44-45`); key = `aggregate_id` (`:42`); `table.include.list = public.outbox` (`:33`); `eventId` e `eventType` em headers (`:48`). **Um evento com `bounded_context = 'catalog'` vai para `catalog.events` sem nenhuma mudança no conector.**
- O broker tem auto-create desligado (`docker-compose.yaml:76`) e o único tópico criado é `diagnostics.events` (`infra/kafka/create-topics.sh:7-8`). **Sem criar `catalog.events` no `kafka-init`, o primeiro evento do Catalog quebra a task do conector** (risco R-1).
- Partition key = `aggregate_id` (regra 5). Eventos de agregados diferentes podem cair em partições diferentes e chegar ao projector fora da ordem em que foram gravados. Hoje isso não aparece porque o `diagnostics` tem um agregado por documento (`apps/projector/src/projection/sequence.ts:4-14`).
- O projector só assina `diagnostics.events` (`apps/projector/src/kafka/kafka-consumer.service.ts:29`): assinar `catalog.events` é da área ReadSide.
- Nginx roteia `/api/*` por método (`infra/nginx/nginx.prod.conf:3`): rotas de escrita do Catalog com POST/PUT/PATCH/DELETE chegam ao write-service sem mudança no gateway.
- O compose já está na raiz (`docker-compose.yaml`, `docker-compose.override.yaml`), conforme a mudança local ainda não commitada no working tree e o ADR 0009.

### Pontos do código que precisam mudar para um segundo contexto

1. **`OutboxWriter` está acoplado ao Ping.** `append(events: readonly PingDomainEvent[])` (`outbox-writer.ts:22`), `boundedContext: BOUNDED_CONTEXT_DIAGNOSTICS` fixo (`:27`) e `toEnvelope` por `instanceof` das classes do Ping (`:39-65`). O Catalog não tem como usá-lo sem refatoração (OQ-Backend-9).
2. **Providers compartilhados registrados dentro do `DiagnosticsModule`** (`diagnostics.module.ts:18-26`). Se o `CatalogModule` registrar os mesmos providers, o Nest cria uma segunda instância de cada; o `IdempotencyCleanupJob` passaria a ter dois crons com o mesmo nome `idempotency-cleanup`, que o `SchedulerRegistry` rejeita (OQ-Backend-9).
3. **`CommandAcceptedSchema` em `diagnostics/http.ts:13`** (ver acima).
4. **`truncateAll`** (`test/integration/setup.ts:39`) com lista fixa de tabelas.
5. **`data-source.ts:12`** e **`migrations/index.ts:3`** com listas explícitas.
6. **`IdempotencyService` grava `response_status = 202` fixo** (`idempotency.service.ts:50`). Só muda se algum command do Catalog responder com outro status (OQ-Backend-14).

### Documentação consultada

- `CLAUDE.md` (regras 1-10), `docs/roadmap.md:13`, `docs/architecture/overview.md:53` ("Catalog: leve; quase CRUD"), `:97` (`event_listing`), ADRs 0001, 0002, 0003, 0004, 0006 (`:22`, contratos pensados para evolução), 0007 (assento marcado + pista a partir da Fase 4), 0009 (padrão herdado, `:63`).
- `docs/domain/glossary.md:9-14`: `Venue` "com sua planta de setores"; `Sector` "área do local para uma sessão"; `Batch` "faixa de preço de um setor válida por período ou até esgotar"; `Organizer`.
- `SDD/RESEARCH/2026-10-24-SkeletonResearch.md`, seção Decisões (OQ-16 a OQ-43).
- [NestJS CQRS recipe](https://docs.nestjs.com/recipes/cqrs): `Command<T>` tipa o retorno do `CommandBus`; `AggregateRoot.apply` enfileira até `commit()`; no 12.1 `commit()` limpa os eventos ao publicar. O projeto não chama `commit()` (ADR 0009, OQ-27), e isso continua valendo.
- [TypeORM 1.0 release notes](https://typeorm.io/docs/releases/1.0/release-notes/): Node 20+, APIs globais removidas (o projeto já usa `DataSource`), suporte a índice parcial no Postgres. Nada que mude o padrão do skeleton.

## Regras de negócio identificadas

Só o que já está confirmado em fonte escrita. Todo o resto é OQ.

| Fonte | Regra |
|---|---|
| `docs/roadmap.md:13` | A Fase 2 cadastra evento, local, sessão, setores e lotes; o produtor é um **usuário seed** (não há Identity). |
| `docs/domain/glossary.md:7-14` | Um Evento tem uma ou mais Sessões; Sessão é uma ocorrência em data e horário; Setor pode ser de assento marcado ou de pista; Lote é faixa de preço de um setor por período ou até esgotar. |
| ADR 0007 | Assento marcado e pista são suportados; a concorrência por assento e por setor é tratada a partir da Fase 4. |

Restrições arquiteturais (não são regras de negócio) que o write side do Catalog precisa cumprir: regras 1, 2, 3, 5, 9 e 10 do `CLAUDE.md`; padrão herdado do ADR 0009 (agregado e entity separados, UPDATE condicional, eventos na outbox, contrato Zod `V1`, ID uuid v7 gerado na aplicação, `202 { id, version }`).

## Impacto CQRS

Nomes são **propostas** e dependem das OQs indicadas; a lista final de commands depende da OQ-Backend-1 e da área Dominio.

| Tipo | Itens |
|---|---|
| Commands | Proposta mínima (só cadastro): `RegisterVenue`, `CreateEvent`, `ScheduleSession`, `AddSector`, `AddBatch`. Condicionais (OQ-Backend-1): `PublishEvent`, comandos de edição e remoção. Todos com `Idempotency-Key` |
| Events | `VenueRegistered`, `EventCreated`, `SessionScheduled`, `SectorAdded`, `BatchAdded` (+ `EventPublished` e eventos de edição/remoção, se entrarem). Todos `V1`, no envelope atual, com `bounded_context = 'catalog'` |
| Queries | Nenhuma no write-service. Queries da vitrine e da página do evento são do read-service (área ReadSide). Se a área ReadSide propuser uma query interna do Catalog para outros módulos do write-service, ela entra na Fase 4 |
| Aggregates | Depende da OQ-Backend-2. Recomendação: `Venue` e `Event` (com sessões, setores e lotes como entidades filhas). Versão única na raiz |
| Read models | Nenhum nesta área. `event_listing` é da área ReadSide; o write side só garante que os eventos carregam o necessário (OQ-Backend-10) |
| Sagas / process managers | Não se aplica: o Catalog não reage a eventos de outros contextos nesta fase; consumo de Kafka no write-service começa na Fase 5 |

## Riscos

- **R-1 Tópico inexistente.** `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false` (`docker-compose.yaml:76`): se `catalog.events` não for criado no `kafka-init` antes do primeiro evento, a task do Debezium falha e **todos** os eventos (inclusive os do `diagnostics`) param, porque a outbox é uma tabela só e o slot é único. Mitigação: OQ-Backend-18, e o E2E do Catalog confere a mensagem no tópico.
- **R-2 Ordem entre agregados.** A regra 5 garante ordem só por agregado. Se o `event_listing` juntar dados de vários agregados (local + evento + sessões), o projector pode receber `SessionScheduled` antes de `EventCreated` ou antes de `VenueRegistered`. Quanto mais agregados, mais o projector precisa tolerar chegada fora de ordem. Mitigação: OQ-Backend-2 e OQ-Backend-10; consolidar com a área ReadSide.
- **R-3 `min_version` com read model de vários agregados.** O command devolve a versão do **seu** agregado. Se o documento da vitrine for alimentado por mais de um agregado, um único campo `version` no documento não serve para a regra de sequência (`sequence.ts:4-14`) nem para o read-your-writes. Mitigação: alinhar com a área ReadSide; a recomendação da OQ-Backend-2 reduz o problema a um agregado por documento, exceto pelos dados do local.
- **R-4 Refatoração do compartilhado quebra o `diagnostics`.** Mudar `OutboxWriter` e mover providers mexe no smoke test permanente. Mitigação: a refatoração é a primeira etapa, isolada, validada com os testes de integração e E2E do `diagnostics` antes de qualquer código do Catalog.
- **R-5 Nome `Event` no código.** O `@types/node` declara a classe global `Event` (API `EventTarget`). Uma classe de agregado `Event` sombreia o global e confunde com "evento de domínio" (o próprio glossário alerta, `docs/domain/glossary.md:7`). Mitigação: OQ-Backend-17.
- **R-6 Persistência de entidades filhas.** O Ping tem uma linha; o agregado do Catalog terá tabelas filhas. Gravar filhos sem bumpar a versão da raiz deixaria duas transações alterarem o mesmo agregado sem conflito. Mitigação: OQ-Backend-11 e OQ-Backend-16 (todo command passa pelo UPDATE condicional da raiz).
- **R-7 Migration no dev.** O `db-migrate` é one-shot; com Compose Watch, uma migration nova não roda sozinha. Mitigação: o Plan documenta rodar `docker compose up db-migrate` (ou subir a stack de novo) após gerar a migration, e lembra o `nest build` antes do `migration:generate` (napkin linha 30).
- **R-8 Regra de negócio implícita em validação.** Campos, limites e transições (ex.: data da sessão no passado, preço zero, períodos de lote sobrepostos) são fáceis de presumir ao escrever um schema Zod. Mitigação: nenhum limite entra no schema sem decisão; ver OQ-Backend-6, 7 e 8.
- **R-9 Contratos públicos difíceis de mudar.** Os eventos do Catalog serão consumidos pelo Inventory (Fase 4) e pelo Ordering (Fase 5). Um payload magro demais agora vira `V2` cedo. Mitigação: OQ-Backend-10.

## Dependências com outras áreas

| Área | O que esta área precisa dela | O que esta área entrega para ela |
|---|---|---|
| Dominio | Lista de operações (OQ-Backend-1), fronteiras dos agregados e dono dos setores (OQ-Backend-2, 3), campos e validações (OQ-Backend-6), dinheiro e fuso (OQ-Backend-7, 8), ciclo de vida do evento, regras de lote | Consequências técnicas de cada opção no write side (concorrência, ordem no Kafka, tamanho do agregado) |
| ReadSide | Que dados o `event_listing` e a página do evento exibem (define o payload mínimo dos eventos, OQ-Backend-10); como o projector trata ordem entre agregados (R-2) e versão por agregado (R-3); se o produtor precisa de um read model próprio para as telas de cadastro | Nomes, tópico, `aggregateType` e schemas `V1` dos eventos em `libs/contracts`; a garantia de uma versão por evento, consecutiva por agregado (OQ-Backend-11) |
| Frontend | Fluxo das telas do produtor (um formulário por entidade ou assistente), uso de versão esperada em edição (OQ-Backend-12) | Schemas Zod de request em `libs/contracts` (reusados no React Hook Form, como o `CreatePingRequestSchema`), rotas, códigos HTTP e formato de erro (OQ-Backend-14, 15), resposta `{ id, version }` |

## Open Questions

As marcadas com `[negócio]` provavelmente se sobrepõem às da área Dominio; a consolidação deve fundi-las. As opções técnicas foram escritas para que a resposta de negócio já leve em conta o custo no write side.

### OQ-Backend-1 [negócio] Quais operações de cadastro entram na Fase 2?
- **Contexto:** O roadmap diz "cadastro" (`docs/roadmap.md:13`), sem dizer se inclui edição, remoção ou publicação. Cada operação é um command, um evento público e um caso de projeção. A vitrine provavelmente não deve mostrar um evento montado pela metade, o que sugere um passo explícito de publicação, mas isso é regra de negócio.
- **Opções:**
  - A) Só criação (`RegisterVenue`, `CreateEvent`, `ScheduleSession`, `AddSector`, `AddBatch`); tudo que é criado aparece na vitrine.
  - B) Criação + `PublishEvent` (rascunho fica fora da vitrine até publicar); sem edição nem remoção.
  - C) B + edição dos dados descritivos (nome, descrição etc.) e remoção de sessão/setor/lote **enquanto rascunho**.
  - D) C + edição depois de publicado e cancelamento de evento/sessão.
- **Recomendação:** B. É o menor conjunto que gera uma vitrine coerente e ensina a diferença entre estado interno do agregado (rascunho) e o que o read model expõe. Edição traz versão esperada vinda do cliente (OQ-Backend-12) e eventos de alteração, o que é bom aprendizado, mas pode ficar para quando houver Identity. D mexe em regras de pós-venda (Fase 7).

### OQ-Backend-2 [negócio + técnica] Fronteiras dos agregados do Catalog
- **Contexto:** Agregado = fronteira de consistência e unidade de concorrência (uma coluna `version`). Pela regra 5 ele também é a unidade de ordem no Kafka. O Catalog é "quase CRUD" (`docs/architecture/overview.md:53`), com um produtor só. O agregado de Inventory por sessão + setor (regra 4) é de outro contexto e não precisa coincidir com o do Catalog.
- **Opções:**
  - A) `Venue` (agregado) + `Event` (agregado com `Session`, `Sector`, `Batch` como entidades filhas). Tudo que pertence a um evento compartilha uma versão e uma partição.
  - B) `Venue` + `Event` (só dados do evento) + `Session` (agregado com setores e lotes, referenciando `eventId` e `venueId`).
  - C) Um agregado por entidade (`Venue`, `Event`, `Session`, `Sector`, `Batch`).
- **Consequências no write side:**
  - A: ordem total dos eventos de um evento no Kafka; um documento da vitrine por agregado (o `sequence.ts` atual continua valendo, só o local é dado externo); `min_version` usa a versão do evento. Custo: qualquer alteração em um lote conflita com qualquer outra alteração no mesmo evento (com um produtor só, quase nunca), e o agregado inteiro é carregado a cada command.
  - B: menos contenção; mas `SessionScheduled` e `EventCreated` podem chegar fora de ordem ao projector, e o documento da vitrine passa a ter duas fontes de versão (R-2, R-3).
  - C: CRUD puro; invariantes entre entidades (ex.: lote dentro do setor certo) viram checagens entre agregados, e o projector junta cinco fontes.
- **Recomendação:** A. Menos partes móveis no primeiro fluxo real, ordem garantida onde ela importa para a vitrine, e o read-your-writes continua com uma versão só. A contenção não é um problema real no Catalog. Inventory (Fase 4) monta seu agregado por sessão + setor a partir dos eventos do Catalog, que é justamente o exemplo de "cada contexto modela do seu jeito".

### OQ-Backend-3 [negócio] Onde os setores são definidos, e o que o cadastro de setor de assento marcado inclui?
- **Contexto:** O glossário diz que o `Venue` tem "sua planta de setores" (`glossary.md:9`) e que `Sector` é "área do local **para uma sessão**" (`glossary.md:11`). As duas leituras levam a modelos diferentes. Além disso, o mapa de assentos é da Fase 4 (Inventory), mas alguém precisa dizer quais assentos existem.
- **Opções (dono do setor):** A) setores definidos no `Venue` (planta reaproveitada por todas as sessões naquele local); a sessão escolhe quais setores vende e os lotes de cada um. B) setores definidos por sessão, sem planta no local. C) planta no local copiada para a sessão no agendamento, editável na sessão.
- **Opções (assento marcado na Fase 2):** a) só tipo (assento marcado ou pista) e capacidade; a lista de assentos fica para a Fase 4. b) cadastrar fileiras e números já na Fase 2.
- **Recomendação:** sem recomendação de negócio para o dono do setor (é decisão de domínio). Do ponto de vista do write side, B é o mais simples e casa com a OQ-Backend-2 A (tudo dentro do agregado `Event`); A coloca dado que a vitrine precisa em outro agregado (o `Venue`) e reforça o R-2. Para os assentos, a), porque o mapa e a concorrência por assento são o tema da Fase 4 e a lista de assentos pode virar parte do evento do Catalog só quando o Inventory precisar dela.

### OQ-Backend-4 [negócio] Produtor seed: o que ele é e o que ele possui
- **Contexto:** "Produtor via usuário seed" (`docs/roadmap.md:13`). Não está dito se o local pertence ao produtor ou é global, nem se o nome do produtor aparece na vitrine (se aparecer, o evento ou o read model precisa do nome).
- **Opções:**
  - A) O seed é só um ID fixo de produtor; `Event` grava `organizerId`; `Venue` é global (sem dono); o nome do produtor não aparece no site.
  - B) Como A, mas `Venue` também tem `organizerId` (cada produtor cadastra os próprios locais).
  - C) O seed tem ID e nome de exibição; o nome vai no payload de `EventCreated` (ou num evento próprio) e aparece na página do evento.
- **Recomendação:** A. Grava `organizerId` desde já (a Fase 3 vai precisar para checar posse e o dashboard da Fase 7 também), sem inventar um cadastro de produtor que é da Identity. Se o nome precisar aparecer, C, mas então é dado da Identity sendo replicado no Catalog, o que deve ser decidido conscientemente.

### OQ-Backend-5 [negócio] Quem pode chamar os commands de cadastro na Fase 2?
- **Contexto:** Sem Identity, o gateway não sabe quem chama. Qualquer pessoa que acessa o site poderia criar eventos em nome do produtor seed.
- **Opções:** A) Aberto: todo command de cadastro é executado em nome do produtor seed; documentado como limitação até a Fase 3. B) Token estático de "produtor" num header, configurado no compose. C) Rotas de cadastro só acessíveis por uma porta/rota do Nginx separada.
- **Recomendação:** A. É um projeto de estudo rodando localmente; B e C criam autenticação provisória que a Fase 3 descarta. O controller obtém o ator de um provider único (`CurrentOrganizer`, OQ-Backend-19), que é o único ponto a trocar na Fase 3.

### OQ-Backend-6 [negócio] Campos e validações de cada entidade
- **Contexto:** Cada campo vira coluna, campo de evento público (contrato difícil de mudar, R-9) e regra Zod compartilhada com o formulário do web. Nenhum limite pode ser presumido (R-8). Esta OQ tende a ser a mesma da área Dominio; a lista abaixo é só o **inventário de perguntas**, sem valores.
- **Perguntas por entidade:**
  - Local: nome? endereço estruturado (logradouro, número, bairro, cidade, UF, CEP) ou só cidade/UF? capacidade total? tamanhos máximos dos textos?
  - Evento: nome, descrição (tamanho máximo, texto puro ou markdown), categoria (lista fechada?), classificação etária, imagem/banner (URL externa? upload está fora?), produtor.
  - Sessão: data e hora de início; hora de término ou duração? abertura dos portões? pode ser no passado? duas sessões do mesmo evento no mesmo horário? duas sessões no mesmo local no mesmo horário (de eventos diferentes)?
  - Setor: nome, tipo (assento marcado / pista), capacidade (mínimo, máximo), nome único dentro da sessão?
  - Lote: nome/número, preço, quantidade (obrigatória? soma das quantidades pode passar da capacidade do setor?), início e fim de venda (obrigatórios? podem se sobrepor entre lotes do mesmo setor? fim de venda pode passar do início da sessão?).
  - Publicação (se OQ-Backend-1 = B, C ou D): o que precisa existir para publicar (pelo menos uma sessão? cada sessão com pelo menos um setor? cada setor com pelo menos um lote?).
- **Opções:** A) A área Dominio fecha a lista com o usuário e a consolidação traz para o Spec. B) O usuário responde aqui diretamente.
- **Recomendação:** A, para não perguntar a mesma coisa duas vezes.

### OQ-Backend-7 [negócio] Dinheiro: moeda e faixa de preço
- **Contexto:** O preço do lote vai para coluna, evento público e, na Fase 5, cálculo de taxa e meia-entrada. Representação em ponto flutuante gera erro de arredondamento.
- **Opções (negócio):** A) Só BRL, preço maior que zero. B) Só BRL, preço zero permitido (evento gratuito). C) Moeda por evento.
- **Opções (técnica, recomendação fechada se A ou B):** inteiro em centavos (`price_cents integer`, `priceCents` no JSON).
- **Recomendação:** representação em centavos inteiros. Moeda e se zero é permitido ficam com o usuário; a meia-entrada da Fase 5 (50% de um valor ímpar em centavos) mostra que o arredondamento também vai precisar de regra, mas isso é da Fase 5.

### OQ-Backend-8 [negócio] Data e hora da sessão e fuso horário
- **Contexto:** O Brasil tem mais de um fuso. Gravar só o instante UTC obriga a vitrine a saber em que fuso exibir. O fuso escolhido afeta a coluna, o evento público e a validação de "sessão no passado".
- **Opções:** A) Instante (`timestamptz`, ISO com offset na API) + fuso IANA no `Venue` (ex.: `America/Sao_Paulo`); a vitrine exibe no fuso do local. B) Instante + fuso fixo `America/Sao_Paulo` para tudo. C) Data e hora locais sem fuso.
- **Recomendação:** A, se o usuário quiser locais em outros fusos; B se o projeto assumir eventos só no horário de Brasília. C não serve para comparar com "agora".

### OQ-Backend-9 [técnica] Como tornar a infraestrutura compartilhada usável por dois contextos
- **Contexto:** Pontos 1 e 2 de "Pontos do código que precisam mudar". O `OutboxWriter` só conhece Ping, e os providers compartilhados vivem no `DiagnosticsModule`.
- **Opções (módulo):** A) `SharedModule` (`src/shared/shared.module.ts`) com `TypeOrmModule.forFeature([OutboxEntity, IdempotencyKeyEntity])`, `TransactionContext`, `OutboxWriter`, `IdempotencyService`, `IdempotencyCleanupJob`, exportando os três primeiros; importado por `DiagnosticsModule` e `CatalogModule`. B) Mesmo, com `@Global()`. C) Cada contexto registra os seus (duplica o cron).
- **Opções (outbox):** a) `OutboxWriter.append(boundedContext, envelopes)` genérico, recebendo envelopes já montados e validados; cada contexto tem um mapper (`ping-event.mapper.ts`, `catalog-event.mapper.ts`) que converte o evento de domínio no envelope `V1` com o schema de `libs/contracts`. b) `OutboxWriter` com um registro de mappers por classe de evento, preenchido por cada módulo no `onModuleInit`. c) As classes de evento de domínio sabem gerar o próprio envelope (`toEnvelope()`).
- **Recomendação:** A + a. Importação explícita deixa visível quem depende do compartilhado (B esconde); o mapper por contexto mantém o contrato público (envelope) separado do evento interno, e o `OutboxWriter` fica sem nenhum conhecimento de domínio. c mistura o domínio com o formato de transporte.

### OQ-Backend-10 [técnica] Granularidade e conteúdo dos eventos do Catalog
- **Contexto:** O read side nunca consulta o PostgreSQL; tudo que a vitrine e a página do evento mostram precisa estar nos eventos. Inventory (Fase 4) e Ordering (Fase 5) também vão consumir esses eventos (R-9). Quanto ao local: se o documento da vitrine mostra nome/cidade do local, e o local é outro agregado (OQ-Backend-2 A), o projector precisa desse dado.
- **Opções (granularidade):** A) Um evento por command, com o estado completo da entidade afetada (ex.: `SessionScheduled` traz todos os campos da sessão; `BatchAdded` traz todos os campos do lote e os IDs de sessão e setor). B) Eventos "magros" só com o que mudou. C) Um evento "EventChanged" com o estado completo do agregado a cada mudança.
- **Opções (dado do local na sessão):** a) Só `venueId`; o projector guarda uma coleção auxiliar de locais (alimentada por `VenueRegistered`) e junta na projeção. b) `SessionScheduled` leva uma cópia (snapshot) dos campos do local exibidos na vitrine, lida do PostgreSQL no command.
- **Recomendação:** A + a. A dá eventos com significado de negócio (ADR 0003) e que bastam para uma projeção idempotente; C esconde a intenção e B obriga o consumidor a manter estado para entender cada evento. Em a o local continua com uma única fonte, e se a edição de local entrar depois, não há cópias desatualizadas; o custo é o projector tolerar `SessionScheduled` antes de `VenueRegistered` (R-2), o que é decisão da área ReadSide. Se a área ReadSide preferir não manter coleção auxiliar, b.

### OQ-Backend-11 [técnica] Semântica da versão em um agregado com entidades filhas
- **Contexto:** Regra 4 + projector com regra de sequência `aggregateVersion = version + 1` (`sequence.ts:4-14`). No Ping cada command gera exatamente um evento e soma 1 à versão.
- **Proposta:** (i) a coluna `version` existe só na raiz do agregado; (ii) todo command que altera qualquer entidade filha faz o UPDATE condicional da raiz (`SET version = :new WHERE id = :id AND version = :expected`), mesmo que nenhuma coluna da raiz mude; (iii) cada evento emitido soma 1 à versão e carrega a versão resultante; um command que emite N eventos soma N e devolve a última; (iv) a criação gera a versão 1.
- **Opções:** A) Proposta acima, com a convenção adicional de **um evento por command** sempre que possível. B) Proposta acima, permitindo commands que emitem vários eventos (ex.: `CreateEvent` já com sessões). C) Versão por entidade filha.
- **Recomendação:** A. (ii) é o que garante que duas transações não alterem o mesmo agregado sem conflito (R-6). Um evento por command mantém a resposta `{ id, version }` trivial e a projeção simples. C quebra a ideia de agregado como unidade de consistência.

### OQ-Backend-12 [técnica] A versão esperada vem do cliente nos commands de alteração?
- **Contexto:** No Ping a versão esperada é a lida no próprio handler (`increment-ping.handler.ts:14`): protege contra duas transações simultâneas, mas não contra o produtor que editou um formulário com dado velho (lost update). Só importa se a OQ-Backend-1 incluir edição, ou para commands que adicionam filhos.
- **Opções:** A) Commands de edição exigem `expectedVersion` (no corpo ou em `If-Match`); divergência → `409`. Commands que só adicionam filhos usam a versão lida no servidor. B) Todos os commands usam a versão lida no servidor (como o Ping). C) Todos exigem `expectedVersion`.
- **Recomendação:** A, se houver edição: é a concorrência otimista vista de ponta a ponta (a UI mostra a versão, o servidor rejeita se mudou), o que liga a regra 4 à regra 7. Para adicionar filhos não há dado velho a sobrescrever. Corpo em vez de `If-Match`, para o hash da idempotência cobrir a versão. Se a OQ-Backend-1 for A ou B, esta OQ cai para B.

### OQ-Backend-13 [técnica] O que o command devolve quando cria uma entidade filha?
- **Contexto:** Regra 2: só ack, ID e versão. Com a OQ-Backend-2 A, `ScheduleSession` cria uma sessão (ID novo) mas a versão é do agregado `Event`. O web precisa do ID da sessão para cadastrar setores nela, e do ID + versão do evento para o `min_version`.
- **Opções:** A) `{ id: <id do agregado>, version, entityId: <id da filha> }` (novo schema `EntityCommandAcceptedSchema`, extensão do `CommandAcceptedSchema`). B) `{ id: <id da filha>, version }` (ambíguo: a versão não é da filha). C) O cliente gera o uuid v7 da filha e envia no corpo; a resposta continua `{ id, version }`.
- **Recomendação:** A. Mantém `id` + `version` sempre referindo-se ao agregado (o par que vai no `min_version`) e acrescenta só um ID, dentro do que a regra 2 permite. C contraria a decisão do skeleton de gerar IDs na aplicação (OQ-17 do Skeleton).

### OQ-Backend-14 [técnica] Estilo das rotas, status HTTP e `Idempotency-Key`
- **Contexto:** Skeleton: `POST` → `202 { id, version }`, `Idempotency-Key` obrigatório (UUID, `400` se ausente), scope = template da rota (`DIAGNOSTICS_ROUTE_TEMPLATES`). A regra 9 vale para todos os commands vindos do cliente. O Nginx já roteia não-GET para o write-service.
- **Opções (estilo):** A) Orientado a tarefa: `POST /api/catalog/venues`, `POST /api/catalog/events`, `POST /api/catalog/events/:eventId/sessions`, `POST /api/catalog/events/:eventId/sessions/:sessionId/sectors`, `POST /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches`, `POST /api/catalog/events/:eventId/publish`; edição (se houver) por `PATCH` no recurso e remoção por `DELETE`. B) REST CRUD genérico (`PUT` substituindo o recurso inteiro). C) Endpoint único de commands (`POST /api/catalog/commands` com `type`).
- **Opções (status):** a) `202` para todos, inclusive criação. b) `201` + `Location` na criação, `202` no resto.
- **Opções (idempotência):** i) `Idempotency-Key` obrigatório em todos os commands do Catalog, mesmo mecanismo e retenção de 24 h. ii) Opcional no Catalog.
- **Recomendação:** A + a + i. A deixa cada intenção de negócio visível na URL (o command tem nome), que é o espírito de CQRS; as rotas aninhadas carregam o ID do agregado (`:eventId`) que o handler precisa carregar. `202` mantém o padrão do skeleton e diz a verdade (a leitura ainda vai alcançar); com a, o `IdempotencyService` não muda (`idempotency.service.ts:50`). ii violaria a regra 9. A forma de leitura dessas URLs no read-service é da área ReadSide.

### OQ-Backend-15 [técnica] Mapeamento de erros de domínio para HTTP
- **Contexto:** Hoje: Zod → `400`, inexistente → `404`, concorrência → `409`, chave reusada → `422` (`domain-error.filter.ts:9-22`). O Catalog traz invariantes que só o agregado ou o banco conhecem (ex.: lote fora do setor, publicar sem sessão, se essas regras existirem) e referências a outros agregados (ex.: `venueId` inexistente em `ScheduleSession`).
- **Opções:** A) Novo `BusinessRuleViolationError(code, message)` → `422` com `{ statusCode, error, message, code }`, `code` estável em inglês (ex.: `VENUE_NOT_FOUND`) para o web mostrar mensagem em PT-BR; agregado-alvo da URL inexistente → `404`; referência inexistente no corpo → `422`. B) Invariante → `409`; referência inexistente → `404`. C) Tudo `400`.
- **Recomendação:** A. `404` fica reservado para "o recurso da URL não existe"; `422` diz "entendi o pedido, mas ele viola uma regra", e o `code` evita o web depender do texto da mensagem. `409` continua só para conflito de versão, que tem semântica de "tente de novo com dado novo".

### OQ-Backend-16 [técnica] Tabelas, nomes, chaves e persistência das entidades filhas
- **Contexto:** Padrão atual: tabela `diagnostics_pings` (`ping.entity.ts:3`), UPDATE condicional à mão, Data Mapper, migrations geradas. Validações que dependem de outro agregado do mesmo contexto (ex.: o local existe) leem o PostgreSQL na mesma transação, o que respeita as regras 1 e 10.
- **Opções (nomes):** A) Prefixo do contexto no schema `public` (`catalog_venues`, `catalog_events`, `catalog_sessions`, `catalog_sectors`, `catalog_batches`). B) Schema PostgreSQL por contexto (`catalog.venues` ...), com a `outbox` continuando em `public`.
- **Opções (integridade):** a) FKs entre tabelas do mesmo contexto (sessão → evento, setor → sessão, lote → setor, sessão → local) como última defesa, com `ON DELETE RESTRICT`. b) Sem FKs; só o agregado garante.
- **Opções (filhos no repositório):** x) A raiz é gravada com o UPDATE condicional; depois os filhos com `INSERT ... ON CONFLICT (id) DO UPDATE` e `DELETE` dos que saíram do agregado, tudo na mesma transação. y) Apaga e reinsere todos os filhos a cada command. z) Relações TypeORM com `cascade` e `save()`.
- **Recomendação:** A + a + x. A segue a convenção existente; B só compensa quando houver usuário de banco por contexto. As FKs pegam bug de código sem custo, como a unique `(session_id, seat_id)` faz no Inventory (regra 4). x deixa o SQL explícito, como o UPDATE condicional (ADR 0009), sem regravar o agregado inteiro; z esconde quando e o que é gravado, e foi exatamente o que o projeto evitou com o `@VersionColumn`.

### OQ-Backend-17 [técnica] Organização de `libs/contracts` e nomes no código
- **Contexto:** Pontos 3 do mapeamento e R-5.
- **Proposta de arquivos:** `libs/contracts/src/catalog/constants.ts` (`BOUNDED_CONTEXT_CATALOG = 'catalog'`, `CATALOG_TOPIC = 'catalog.events'`, `VENUE_AGGREGATE_TYPE`, `EVENT_AGGREGATE_TYPE`, `CATALOG_EVENT_TYPES`, `catalogRoutes`, `CATALOG_ROUTE_TEMPLATES`), `catalog/http.ts` (schemas de request), `catalog/events.ts` (schemas `V1` e `CatalogEventSchema`, união discriminada); `CommandAcceptedSchema` movido para `libs/contracts/src/http/command-accepted.ts`, reexportado pelo barrel (o import `@stubb/contracts` não muda).
- **Opções (nome da classe do agregado "Evento"):** A) `CatalogEvent` no código TS; `aggregateType: 'Event'` e nomes de eventos públicos seguindo o glossário (`EventCreated`, `EventPublished`). B) Classe `Event` (sombreia o global do Node). C) Outro termo (`Show`, `Production`), mudando o glossário.
- **Recomendação:** proposta de arquivos + A. Mantém o vocabulário do glossário no contrato público e evita a colisão com o global `Event` e com "evento de domínio" no código interno.

### OQ-Backend-18 [técnica] Tópico `catalog.events`
- **Contexto:** R-1. Decisão do skeleton para `diagnostics.events`: criação explícita, 3 partições, `retention.ms=-1` (Skeleton OQ-19). Retenção infinita é o que permite o replay do `event_listing` (regra 6).
- **Opções:** A) Mesmo padrão: `catalog.events`, 3 partições, `retention.ms=-1`, criado no `infra/kafka/create-topics.sh`. B) Criar já os quatro tópicos do ADR 0004 (`catalog`, `inventory`, `ordering`, `ticketing`). C) Outro número de partições.
- **Recomendação:** A. Só o tópico de que a fase precisa; os outros entram nas suas fases. O conector não muda (`register-connector.sh:44-45` roteia por `bounded_context`).

### OQ-Backend-19 [técnica] Como o produtor seed chega ao handler
- **Contexto:** Depende da OQ-Backend-4 e da OQ-Backend-5. A Fase 3 vai trocar o seed pelo usuário do JWT.
- **Opções:** A) `SEED_ORGANIZER_ID` em `config.ts` (Zod, default com um uuid fixo documentado) e um provider `CurrentOrganizer` (`src/shared/actor/`) que o controller usa para preencher o command; sem tabela de produtores. B) Tabela `catalog_organizers` com uma linha inserida por migration. C) Constante em `libs/contracts`.
- **Recomendação:** A. Um ponto único a trocar na Fase 3, e o command já recebe `organizerId` como parâmetro, como receberá do JWT. B cria no Catalog um cadastro que é da Identity; C expõe um detalhe do write-service no contrato público.

## Decisões

Preenchida pelo thread principal com as respostas do usuário (após a consolidação, com a numeração final `OQ-n`).
