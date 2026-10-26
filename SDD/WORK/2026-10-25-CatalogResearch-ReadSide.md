---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-25
status: draft
area: ReadSide (projector, read-service, MongoDB, gateway, E2E/replay do read side)
---

# Catalog — Research parcial: ReadSide

Pesquisa parcial da área **ReadSide**. Será consolidada com as parciais Dominio, Backend e Frontend no Research oficial (`SDD/RESEARCH/2026-10-25-CatalogResearch.md`). As dúvidas estão numeradas `OQ-ReadSide-n`; nenhuma foi resolvida aqui. Onde a resposta depende de outra área, a dependência está apontada, não decidida.

## Objetivo

Construir o primeiro read side "de verdade": projetar os eventos do contexto Catalog (evento, local, sessão, setores, lotes) em documentos desnormalizados no MongoDB e servi-los ao web pela vitrine e pela página do evento.

Conceitos de CQRS exercitados nesta área:

- **Read model desnormalizado por tela**: um documento já no formato que a tela consome, montado a partir de vários agregados do write side (ADR 0005:11, `docs/architecture/overview.md:97`).
- **Projeção a partir de vários agregados**: diferente do `Ping` da Fase 1, um documento de vitrine junta dados de agregados distintos, que chegam por partições diferentes do Kafka, sem ordem garantida entre si (ADR 0004:20). É o primeiro contato real com consistência eventual entre agregados.
- **Idempotência e replay com mais de um agregado por documento**: o mecanismo da Fase 1 (dedupe por `eventId` + sequência por `version` do documento) foi desenhado para "um documento = um agregado" e precisa ser generalizado.
- **Query side fino**: `List*`/`Get*` sem domínio, com paginação, filtros e índices; read-your-writes (`min_version`) num documento composto.
- **O que não se projeta**: campos que dependem do relógio (sessão passada, lote vigente por data) não mudam por evento e não podem ser congelados pela projeção.

## Escopo

**Dentro (área ReadSide):**
- Generalização do projector: consumo do tópico `catalog.events`, registro `tópico → schema → handlers`, transação única por evento com dedupe e controle de sequência válidos para documentos compostos.
- Desenho dos documentos `event_listing` (vitrine e busca) e, se aprovado, `event_detail` (página do evento), mais coleções auxiliares do projector (lookups, versões por agregado).
- Índices do MongoDB para as queries da vitrine e da página.
- Queries no read-service: `ListEvents` (vitrine), `GetEvent` (página do evento) e, se aprovadas, leituras do produtor (`ListOrganizerEvents`, `ListVenues`); paginação, filtros, ordenação, busca; `min_version`.
- Contratos de leitura (views e params) em `libs/contracts`, em conjunto com Frontend.
- Rotas no Nginx (conferir que o roteamento por método cobre tudo).
- Replay generalizado e cobertura E2E do read side.

**Fora:**
- SSE e qualquer push ao vivo (Fase 4, `docs/roadmap.md:15`).
- Disponibilidade, contagem por setor/lote, "esgotado" (`sector_availability`, `session_seat_map`: Fase 4).
- Autenticação e autorização das leituras do produtor (Fase 3, Identity). Na Fase 2 o produtor é um usuário seed.
- Cache HTTP, rate limit e fila no Nginx (Fase 9).
- MongoDB Search/`mongot` (ver OQ-ReadSide-6) e Redis.
- `organizer_sales` e qualquer dado de venda (Fase 7).
- Definição dos agregados, comandos e eventos do Catalog (área Dominio/Backend); aqui só se consome o que for definido.
- Telas do web (área Frontend); aqui só o contrato de leitura que elas consomem.

## Mapeamento da codebase

Estado atual do read side (Fase 1, módulo técnico `diagnostics` com o agregado `Ping`). Observação: os arquivos de compose foram movidos de `infra/` para a raiz (`docker-compose.yaml`, `docker-compose.override.yaml`) e a mudança ainda não está commitada (`git status`); as referências abaixo usam a raiz.

### Projector (`apps/projector`)

| Onde | O que faz | Impacto para o Catalog |
|---|---|---|
| `apps/projector/src/kafka/kafka-consumer.service.ts:29` | `subscribe([DIAGNOSTICS_TOPIC])`: só um tópico, fixo | Precisa assinar `catalog.events` também (OQ-ReadSide-12) |
| `apps/projector/src/kafka/kafka-consumer.service.ts:35` | Faz `DiagnosticsEventSchema.parse` em toda mensagem | O schema precisa ser escolhido por tópico; hoje um evento do Catalog derrubaria o projector (schema inválido → `exit(1)`) |
| `apps/projector/src/kafka/kafka-consumer.service.ts:36-38` | `dispatch` e só depois `commit` (offset por mensagem) | Reaproveitável sem mudança |
| `apps/projector/src/kafka/kafka-consumer.service.ts:39-46` | Qualquer erro: loga, não commita e `exit(1)` (restart reprocessa) | Reaproveitável; mas um erro "esperado" de ordem entre agregados viraria crash loop (OQ-ReadSide-8) |
| `apps/projector/src/kafka/confluent-event-consumer.ts:12-14` | Grupo `projector`, `fromBeginning: true`, `autoCommit: false` | Ao assinar um tópico novo, o grupo começa do início dele (sem offset salvo) |
| `apps/projector/src/kafka/confluent-event-consumer.ts:25-42` | `eachMessage` serial; repassa `topic` na `ConsumedMessage` | O `topic` já chega ao handler: base para o roteamento por tópico |
| `apps/projector/src/kafka/confluent-event-consumer.ts:45-53` | Commit explícito de `offset + 1` | Reaproveitável |
| `apps/projector/src/kafka/event-consumer.ts:10-16` | Interface `EventConsumer` (isola a biblioteca) | Reaproveitável; `subscribe(topics: string[])` já aceita vários tópicos |
| `apps/projector/src/projection/event-dispatcher.ts:5-9` | Mapa `eventType → handler` tipado pela union `DiagnosticsEvent` | Precisa virar registro por contexto (Catalog terá sua própria union) |
| `apps/projector/src/projection/ping.projection.ts:38-40` | Uma transação Mongo por evento (`withTransaction`) | Padrão a manter: dedupe + aplicação atômicos |
| `apps/projector/src/projection/ping.projection.ts:41-53` | Dedupe: procura e grava `processed_events` (`_id = eventId`) na transação | Reaproveitável como está; é independente do read model |
| `apps/projector/src/projection/ping.projection.ts:55-72` | Sequência: lê `version` do **próprio documento** e decide `apply`/`already-applied`/`gap` | Não serve para documento composto por vários agregados (OQ-ReadSide-9) |
| `apps/projector/src/projection/ping.projection.ts:74` | Datas do documento vêm de `occurredAt` | Regra de determinismo a manter (replay) |
| `apps/projector/src/projection/ping.projection.ts:88-106` | `updateOne` condicionado a `version = aggregateVersion - 1` | Guarda de concorrência no próprio update; padrão útil para fan-out |
| `apps/projector/src/projection/sequence.ts:8-14` | `decideProjection` puro; `:11` tem `PingIncremented` fixo no código | Generalizar (evento de criação por agregado) |
| `apps/projector/src/projection/projection-gap.error.ts:1-13` | Erro de lacuna | Reaproveitável |
| `apps/projector/src/mongo/mongo.module.ts:11-16` | `MongoClient` + `Db` globais | Reaproveitável |
| `apps/projector/src/config.ts:1-8` | Config por env (Mongo, Kafka, grupo) | Reaproveitável |
| `apps/projector/src/app.module.ts:7-9` | Sem `@nestjs/cqrs` (decisão OQ-27 da Fase 1) | Manter |
| `apps/projector/test/integration/ping-projection.int.test.ts:9,55-60` | Teste de integração contra Mongo real (porta 58017), cria coleções antes | Modelo para os testes da projeção do Catalog |
| `apps/projector/test/unit/architecture.spec.ts:5-10` | Garante que o projector não depende de `pg`/`typeorm` | Manter |

### Read-service (`apps/read-service`)

| Onde | O que faz | Impacto |
|---|---|---|
| `apps/read-service/src/main.ts:8` | Prefixo global `api` (exceto `health`) | Rotas do Catalog ficam em `/api/...` |
| `apps/read-service/src/app.module.ts:8` | `CqrsModule.forRoot()` + `MongoModule` + `DiagnosticsModule` | Novo `CatalogModule` entra aqui |
| `apps/read-service/src/diagnostics/pings.controller.ts:12-34` | Controller fino: valida params com `ZodPipe`, despacha no `QueryBus`, 404 com `minVersionReached: false` | Padrão a copiar para `ListEvents`/`GetEvent` |
| `apps/read-service/src/diagnostics/get-ping.handler.ts:6-7,15-31` | `min_version`: polling de 100 ms até 3 s no Mongo; no timeout devolve o estado atual com `minVersionReached: false` | O laço está dentro do handler; vale extrair um helper comum (`pollUntil`) para reuso |
| `apps/read-service/src/diagnostics/get-ping.query.ts:4-5` | Resultado como union `found`/`not found` | Padrão a copiar |
| `apps/read-service/src/diagnostics/ping-read.repository.ts:19-30` | Repositório de leitura: mapeia documento → view (Date → ISO) | Padrão a copiar; o documento Mongo não vaza para a API |
| `apps/read-service/src/common/zod-pipe.ts:5-23` | 400 com `issues` no mesmo formato do write-service | Reaproveitável para query string (`page`, filtros) |
| `apps/read-service/src/mongo/mongo.module.ts:26-45` | `MongoModule.forRoot(options?)` (testes passam URL e banco) | Reaproveitável |
| `apps/read-service/test/integration/get-ping.int.test.ts:12,27-42` | Integração com Mongo real (porta 58018) semeando documentos à mão | Modelo para testar queries sem o projector |
| `apps/read-service/test/unit/architecture.spec.ts:5-10` | Fronteira: sem dependência do write store | Manter |

### Contratos (`libs/contracts`)

| Onde | O que faz | Impacto |
|---|---|---|
| `libs/contracts/src/events/envelope.ts:4-21` | `createEventEnvelopeSchema(eventType, aggregateType, payload)`; `schemaVersion: z.literal(1)` em `:12` | Os eventos do Catalog usam a mesma fábrica (definidos por Dominio/Backend) |
| `libs/contracts/src/diagnostics/events.ts:18-21` | `DiagnosticsEventSchema` = discriminated union por `eventType` | O projector precisa de uma `CatalogEventSchema` equivalente |
| `libs/contracts/src/diagnostics/http.ts:13` | `CommandAcceptedSchema { id, version }` | A versão devolvida pelo command é a que o `min_version` compara (OQ-ReadSide-10) |
| `libs/contracts/src/diagnostics/http.ts:15-33` | View + resposta com `minVersionReached` + 404 | Padrão para `EventListingView`/`EventDetailView` |
| `libs/contracts/src/shared/schemas.ts:5` | `minVersionSchema` (coerce int ≥ 1) | Reaproveitável |
| `libs/contracts/src/http/constants.ts:2` | `MIN_VERSION_QUERY_PARAM = 'min_version'` | Reaproveitável |
| `libs/contracts/src/diagnostics/constants.ts:2,7-11` | Nome do tópico e rotas como constantes compartilhadas | Padrão para `CATALOG_TOPIC` e `catalogRoutes` |

### Infra e gateway

| Onde | O que faz | Impacto |
|---|---|---|
| `infra/nginx/nginx.prod.conf:3` | `map $request_method`: GET/HEAD → read-service, resto → write-service | Todas as queries do Catalog via GET já caem no read-service sem mudança. Só uma query via POST (ex.: busca complexa) exigiria regra por prefixo (ADR 0002:22) |
| `infra/nginx/nginx.prod.conf:7-14` | `location /api/`, `proxy_read_timeout 15s` | Folga suficiente para a espera de 3 s do `min_version` |
| `infra/nginx/nginx.prod.conf:15-18` | SPA com `try_files ... /index.html` | Deep link da página do evento (ex.: `/events/:id`) já funciona em produção |
| `infra/nginx/nginx.dev.conf:3,16-22` | Mesmo mapa; `/` vai para o Vite (com HMR) | Idem em dev |
| `infra/mongo/init-replica-set.js:21-27` | Cria as coleções `pings` e `processed_events`; nenhum índice | Ponto candidato para criar as coleções e índices do Catalog (OQ-ReadSide-15) |
| `infra/kafka/create-topics.sh:7-10` | Cria só `diagnostics.events` (3 partições, `retention.ms=-1`); auto-create desligado (`docker-compose.yaml:76`) | `catalog.events` precisa ser criado antes do projector assinar. **Dependência Backend/infra** (dono do script) |
| `infra/debezium/register-connector.sh:44-45` | Roteia pelo campo `bounded_context` para `${routedByValue}.events` | Gravar `bounded_context = 'catalog'` na outbox já publica em `catalog.events`; o conector não muda |
| `docker-compose.yaml:206-232` | projector depende de `kafka-init` e `mongo-init` | A ordem de subida já garante tópico e coleções antes do consumo |
| `docker-compose.yaml:183-204` | read-service depende de `mongo-init` | Idem para índices, se criados no `mongo-init` |

### E2E e replay (`e2e/`)

| Onde | O que faz | Impacto |
|---|---|---|
| `e2e/src/replay/replay.ts:4` | Grupo `projector` fixo | Continua válido com um grupo só (OQ-ReadSide-12) |
| `e2e/src/replay/replay.ts:13-16` | Apaga `pings` e `processed_events` com `deleteMany` (mantém índices) | Precisa apagar também as coleções do Catalog; `deleteMany` em vez de `drop` preserva os índices |
| `e2e/src/replay/replay.ts:21-35` | Reseta offsets `--to-earliest` só de `diagnostics.events` | Precisa incluir `catalog.events` (ou `--all-topics`) (OQ-ReadSide-14) |
| `e2e/src/replay/replay.e2e.test.ts:22-35` | Lê com `min_version`, faz replay e compara o documento com `toEqual` | Mesmo padrão para o Catalog; exige documento determinístico (ver Riscos) |
| `e2e/src/api/queries.e2e.test.ts:14-29,41-52` | `min_version` via gateway e roteamento GET/POST/`/` | Padrão para testes da vitrine e da página |
| `e2e/src/support/http.ts:14-17` | Helper `api` aceita só `GET` e `POST` | Se o Catalog tiver commands `PUT`/`PATCH`/`DELETE`, o helper precisa crescer (**dependência Backend**) |
| `e2e/src/support/env.ts:3` | `E2E_BASE_URL` padrão `http://localhost:8080` | O napkin (2026-10-24) recomenda `127.0.0.1` no host Windows; não é escopo desta fase, mas explica falhas intermitentes |
| `e2e/package.json:7` | `test:e2e` roda `src/api` e depois `src/replay` | Novos testes do Catalog entram nas mesmas pastas |

### Docs

- `docs/architecture/overview.md:11`: o read model serve para exibir; o write model é a verdade.
- `docs/architecture/overview.md:97`: `event_listing` = "Vitrine e busca". Não existe `event_detail` listado.
- `docs/architecture/adr/0005-read-store-mongodb.md:11`: "página do evento com sessões e setores embutidos".
- `docs/architecture/adr/0009-ferramental-e-pipeline-da-fase-1.md:40-41,43`: dedupe/sequência, `min_version`, replay.
- `docs/architecture/adr/0004-kafka.md:11,20`: um tópico por contexto, ordem só por agregado.

## Regras de negócio identificadas

Nenhuma regra de negócio específica do read side do Catalog está confirmada. As regras arquiteturais que se aplicam (não são de negócio, já estão decididas):

- O read model serve para exibir; o write model é a verdade (`docs/architecture/overview.md:11`).
- Projector idempotente, offset só depois de gravar, read model reconstruível por replay (CLAUDE.md, regra 6; ADR 0009:40, 43).
- Read-your-writes via `min_version` (CLAUDE.md, regra 7; ADR 0009:41).
- Partition key = ID do agregado (CLAUDE.md, regra 5).
- O write-service nunca lê do MongoDB para decidir (CLAUDE.md, regra 1). Não restringe o projector de ler o próprio read store.

O que aparece na vitrine, quais preços são mostrados, filtros e ordenação são regras de negócio/produto ainda não confirmadas: viraram OQ-ReadSide-2 a 5 e 11.

## Impacto CQRS

Os nomes de eventos abaixo são **ilustrativos**: a lista real, os agregados e os payloads são definidos pela área Dominio/Backend.

| Tipo | Itens (área ReadSide) |
|---|---|
| Commands | Nenhum (o read side não recebe commands). Consome a `version` devolvida pelos commands do Catalog para o `min_version` |
| Events (consumidos) | Todos os eventos de `catalog.events` definidos por Dominio (ex. ilustrativos: criação/edição de local, criação/edição/publicação de evento, agendamento de sessão, setores, lotes) |
| Queries | `ListEvents` (vitrine: paginação, filtros, ordenação, busca); `GetEvent` (página do evento, com `min_version`); se aprovadas (OQ-ReadSide-11): `ListOrganizerEvents`, `GetOrganizerEvent`, `ListVenues` |
| Aggregates | Nenhum no read side. A fronteira dos agregados do Catalog (Dominio) define a complexidade da projeção (OQ-ReadSide-8) |
| Read models | `event_listing` (existente no plano de arquitetura); `event_detail` (proposto, OQ-ReadSide-1); auxiliares internos do projector: lookup de locais (OQ-ReadSide-8), versões por agregado (OQ-ReadSide-9); `processed_events` (existente) |
| Sagas / process managers | Não se aplica ao read side nesta fase: o Catalog não reage a eventos de outros contextos |

### Esboço dos documentos (condicionado às OQs e aos campos que Dominio definir)

Apenas para tornar as OQs concretas; nenhum campo de negócio está decidido.

`event_listing` (um documento por evento, se OQ-ReadSide-2 = A):

```
{
  _id: eventId,
  title, city, venue: { id, name },          // campos dependem de Dominio
  status,                                    // se houver ciclo de vida (OQ-ReadSide-3)
  sessionStarts: [Date, ...],                // ordenado; serve filtro por data e "próxima sessão" calculada na query
  firstSessionAt, lastSessionAt,             // para ordenação/índice
  searchText,                                // se busca (OQ-ReadSide-6)
  version,                                   // versão do agregado raiz, para min_version (OQ-ReadSide-10)
  createdAt, updatedAt                       // vindos de occurredAt
}
```

`event_detail` (um documento por evento, se OQ-ReadSide-1 = B):

```
{
  _id: eventId,
  ...dados do evento, venue: { id, name, endereço... },
  sessions: [ { id, startsAt, sectors: [ { id, name, kind: 'seated'|'general_admission', batches: [ { id, name, price, validFrom?, validUntil? } ] } ] } ],
  version, createdAt, updatedAt
}
```

Arrays ordenados por chave estável (ex.: `startsAt` e `id`), nunca pela ordem de chegada dos eventos (ver Riscos).

### Proposta de mecanismo do projector (condicionada a OQ-ReadSide-8, 9, 12 e 13)

1. `KafkaConsumerService` escolhe o schema pelo `message.topic` (registro `tópico → schema`), em vez de `DiagnosticsEventSchema` fixo (`kafka-consumer.service.ts:35`).
2. Um executor genérico abre **uma** transação por evento: dedupe em `processed_events` (como hoje, `ping.projection.ts:41-53`), checagem de sequência por agregado e chamada de todos os handlers de projeção registrados para aquele `eventType` (ex.: um evento de sessão atualiza `event_listing` e `event_detail` na mesma transação).
3. Handlers de projeção recebem `(event, session)` e só fazem `updateOne`/`updateMany`/`insertOne` com `upsert` quando cabível; datas vêm de `occurredAt`.
4. Uma lacuna real dentro do mesmo agregado continua derrubando o processo (ADR 0009:68). Dependência entre agregados distintos **não** pode ser tratada como lacuna (OQ-ReadSide-8).

### Rotas (proposta, OQ-ReadSide-16)

| Método e rota | Query | Upstream (Nginx) |
|---|---|---|
| `GET /api/catalog/events` | `ListEvents` | read-service (regra de método existente) |
| `GET /api/catalog/events/:id?min_version=n` | `GetEvent` | read-service |
| `GET /api/catalog/organizer/events` (se aprovado) | `ListOrganizerEvents` | read-service |
| `GET /api/catalog/venues` (se aprovado) | `ListVenues` | read-service |
| `POST/PUT/...` em `/api/catalog/...` | commands (área Backend) | write-service |

Nenhuma alteração no Nginx é necessária se todas as queries forem `GET`.

### Cobertura de testes proposta (OQ-ReadSide-17)

- **Unitário (projector)**: decisão de sequência generalizada; roteamento por tópico; schema inválido de `catalog.events` → sem commit e `exit(1)`.
- **Integração (projector, Mongo real)**: cada handler; dedupe por `eventId`; lacuna no mesmo agregado; eventos de agregados diferentes em ordens diferentes produzem o **mesmo** documento (comutatividade); fan-out de edição de local.
- **Integração (read-service, Mongo semeado)**: paginação, filtros, ordenação, busca, 404, 400 de params, `min_version` (atingido, timeout, alcança durante a espera).
- **E2E API (gateway)**: fluxo completo de cadastro → vitrine/página com `min_version`; mensagem em `catalog.events` com key = ID do agregado; roteamento GET/POST.
- **E2E replay**: replay geral reproduz `event_listing`/`event_detail` idênticos.
- **Playwright** (área Frontend): vitrine e página do evento.

## Riscos

- **Ordem entre agregados**: eventos de agregados diferentes caem em partições diferentes e chegam em qualquer ordem (ADR 0004:20). Se a projeção tratar "referência ainda não projetada" como lacuna, o projector entra em crash loop (`kafka-consumer.service.ts:45` + `restart: unless-stopped` em `docker-compose.yaml:211`). Mitigação depende de OQ-ReadSide-8.
- **Sequência por documento não serve para documento composto**: o `version` do documento (`ping.projection.ts:55-57`) só representa um agregado. Com vários agregados num documento, o controle atual daria falsos "já aplicado" ou falsas lacunas (OQ-ReadSide-9).
- **Replay não determinístico**: arrays montados por ordem de chegada (ex.: `$push` de sessões vindas de partições diferentes) podem sair em ordem diferente no replay, e o teste `toEqual` (`replay.e2e.test.ts:34`) falharia. Todo array precisa ser ordenado por chave estável e toda data vir de `occurredAt`, nunca de `new Date()` (exceto `processedAt` em `processed_events`, que não é comparado).
- **Dados que dependem do relógio**: "sessão já aconteceu" e "lote vigente por data" mudam sem evento. Se calculados no projector, ficam congelados e o replay gera resultado diferente conforme o dia em que roda. Precisam ser calculados na query com o `now` do read-service (OQ-ReadSide-3 e 4).
- **Fan-out**: editar um dado compartilhado (ex.: nome do local) exige `updateMany` em todos os documentos que o embutem; com eventos fora de ordem, uma versão antiga pode sobrescrever uma nova sem guarda de versão.
- **Falha compartilhada**: com um consumer group só, um bug na projeção do Catalog também para a projeção do `diagnostics` (smoke test permanente, ADR 0009:64), e vice-versa (OQ-ReadSide-12).
- **Tópico inexistente**: com auto-create desligado (`docker-compose.yaml:76`), o projector não deve assinar `catalog.events` antes de o `kafka-init` criá-lo. A ordem de subida já cobre isso se o script for atualizado (dependência Backend/infra).
- **Índice de texto**: uma coleção só pode ter um índice de texto; `$text` falha se o índice não existir; não faz busca por prefixo ("roc" não acha "rock") (OQ-ReadSide-6).
- **Rascunhos expostos**: sem autenticação até a Fase 3, qualquer `GET` que devolva rascunhos do produtor é público (OQ-ReadSide-11).
- **Testes de integração dependem de índices**: se os índices só forem criados no `mongo-init`, os testes de integração (que usam Mongo próprio nas portas 58017/58018) precisam criá-los também, senão `$text` e ordenações divergem do ambiente real (OQ-ReadSide-15).
- **Regressão do `diagnostics`**: refatorar a `PingProjection` para o mecanismo genérico mexe no smoke test; a cobertura atual (integração + E2E + replay) protege, mas precisa rodar (OQ-ReadSide-13).
- **Crescimento de `processed_events`**: sem limpeza; aceitável para estudo, mas cresce com cada evento do Catalog.

## Dependências com outras áreas

| Área | O que o ReadSide precisa receber |
|---|---|
| Dominio | Fronteira dos agregados (evento como raiz com sessões/setores/lotes, ou agregados separados; local como agregado próprio); lista de eventos de domínio e payloads; ciclo de vida (rascunho, publicado, cancelado?); campos do evento (título, descrição, categoria, imagem, cidade); representação de dinheiro (centavos inteiros?); fuso horário da sessão; semântica de vigência de lote; edições e remoções permitidas |
| Backend | `CatalogEventSchema` e constantes em `libs/contracts`; criação de `catalog.events` no `create-topics.sh` (partições e retenção); qual `version` cada command devolve (de qual agregado); ID do produtor seed; métodos HTTP dos commands (impacta o helper `api` do E2E e confirma que nenhuma query vai por POST) |
| Frontend | Telas e o que cada uma mostra (vitrine, página do evento, telas do produtor); paginação na UI (páginas ou "carregar mais"); filtros e busca que a UI oferece; rota da página do evento (`/events/:id`); uso de `min_version` depois de cada command; dono dos testes Playwright |

## Open Questions

### OQ-ReadSide-1 [técnica] Um read model para vitrine e página, ou dois?
- **Contexto:** `overview.md:97` só lista `event_listing` ("vitrine e busca"); o ADR 0005:11 fala em "página do evento com sessões e setores embutidos". A vitrine precisa de um resumo por card e índices de filtro; a página precisa da árvore completa sessão → setor → lote.
- **Opções:** A) Só `event_listing`, com a árvore completa embutida; a vitrine usa projeção de campos na query. B) Dois read models: `event_listing` (resumo, indexado para vitrine/busca) e `event_detail` (árvore completa, lido por `_id`), atualizados na mesma transação pelo projector. C) Só `event_detail`, e a vitrine agrega em tempo de query.
- **Recomendação:** B. É a lição "um documento por tela": cada tela lê exatamente o que precisa, os índices da vitrine não carregam o peso da árvore, e mostra que o mesmo evento de domínio alimenta vários read models. Exige registrar `event_detail` no `overview.md` (dependência de docs, fora desta área escrever).

### OQ-ReadSide-2 [negócio] A vitrine lista eventos ou sessões?
- **Contexto:** Um evento pode ter várias sessões (glossário: "Tem uma ou mais sessões"). A vitrine pode mostrar um card por evento (com as datas) ou um card por sessão (cada data é um item). Isso define a granularidade do `event_listing` e a ordenação por data.
- **Opções:** A) Um card por evento, com as datas das sessões resumidas (ex.: "3 datas" ou a próxima data). B) Um card por sessão. C) Um card por evento e a página do evento lista as sessões.
- **Recomendação:** A (com C na página). É o padrão de sites de ingresso e mantém um documento por evento; a "próxima data" é calculada na query (ver Riscos, relógio). **Dependência Frontend** (layout do card).

### OQ-ReadSide-3 [negócio] Quais eventos e sessões aparecem na vitrine e na página pública?
- **Contexto:** Depende do ciclo de vida definido por Dominio (rascunho/publicado/cancelado?) e de como tratar sessões que já aconteceram. "Sessão passada" muda com o tempo, sem evento, então não pode ser decidido pelo projector.
- **Opções:** (a) Estado: A) só eventos publicados; B) todos, inclusive rascunhos; C) publicados e cancelados (com selo). (b) Sessões passadas: i) escondidas na vitrine e na página, calculado na query com o relógio do read-service; ii) mostradas; iii) evento some da vitrine quando todas as sessões passaram, mas a página continua acessível. (c) `GetEvent` de evento não visível: 1) `404`; 2) devolve com indicador.
- **Recomendação:** A + iii + 1, se Dominio tiver o conceito de publicação; senão, a pergunta (a) cai. Filtros por tempo sempre na query, nunca no projector. **Dependência Dominio** (ciclo de vida).

### OQ-ReadSide-4 [negócio] Que preço a vitrine e a página mostram?
- **Contexto:** Lotes são faixas de preço "válidas por período ou até esgotar" (glossário). "Até esgotar" depende de vendas (Inventory/Ordering, Fases 4-5), que não existem ainda. "Por período" depende do relógio. A vitrine costuma mostrar "a partir de R$ X".
- **Opções:** A) Vitrine sem preço; página mostra todos os lotes de cada setor com sua vigência. B) Vitrine mostra "a partir de" = menor preço entre os lotes vigentes agora, calculado na query; página destaca o lote vigente por setor. C) Vitrine mostra o menor preço entre todos os lotes cadastrados (sem considerar vigência), calculado no projector.
- **Recomendação:** perguntar ao usuário. Do lado técnico: se houver vigência por data, o "vigente" é calculado no read-service (documento guarda todos os lotes com janela; o cálculo é função pura de documento + `now`), nunca no projector. Ordenar a vitrine por preço vigente fica caro nesse modelo. **Dependência Dominio** (semântica de vigência e de moeda).

### OQ-ReadSide-5 [negócio] Filtros e ordenação da vitrine
- **Contexto:** Define os índices e os params da query `ListEvents`. Os campos disponíveis dependem do que Dominio captura (cidade, local, categoria, datas).
- **Opções:** (a) Filtros: A) nenhum; B) cidade + intervalo de datas; C) B + categoria (se existir) + local. (b) Ordenação padrão: i) próxima sessão mais cedo primeiro; ii) mais recentes cadastrados primeiro; iii) alfabética. (c) Ordenações escolhíveis pelo usuário: 1) só a padrão; 2) data e nome.
- **Recomendação:** B + i + 1 para a Fase 2. Filtro de data precisa de fuso definido: dia "15/11" em qual fuso? **Dependência Dominio** (fuso da sessão/local) e **Frontend** (UI dos filtros).

### OQ-ReadSide-6 [técnica] Busca textual na vitrine
- **Contexto:** `event_listing` é "vitrine e busca" (`overview.md:97`), mas o escopo da busca não está definido. O MongoDB 8.0.34 (`docker-compose.yaml:33`) tem índice de texto (`$text`, insensível a caixa e acento na versão 3, `default_language: 'portuguese'` com stemming, um por coleção, sem busca por prefixo). O MongoDB Search na Community exige 8.2+ e o binário `mongot`, e está em public preview, não recomendado para produção.
- **Opções:** A) Sem busca na Fase 2. B) `$text` com índice de texto em português sobre título (+ nome do local/cidade). C) Regex ancorada em um campo normalizado (`searchText` sem acento, minúsculo), que permite prefixo mas não usa índice de forma eficiente para substring. D) MongoDB Search com `mongot` (upgrade para 8.2+).
- **Recomendação:** B, se o usuário quiser busca na Fase 2 (simples, nativo, ensina índice de texto); senão A. D fica fora (preview, outro serviço). Busca via `GET` com query string, para não exigir exceção no Nginx. **Dependência Frontend.**

### OQ-ReadSide-7 [técnica] Paginação de `ListEvents`
- **Contexto:** A vitrine pode crescer; a query precisa de limite. Paginação por cursor (keyset) é mais estável sob escrita concorrente; por offset é mais simples e combina com `$text` (ordenação por score dificulta keyset).
- **Opções:** A) Offset: `page` e `pageSize`, resposta com `items`, `page`, `pageSize`, `total`. B) Cursor: `cursor` opaco + `limit`, resposta com `items` e `nextCursor` (keyset por `firstSessionAt` + `_id`). (Tamanhos) i) padrão 20, máximo 50; ii) outro valor.
- **Recomendação:** A + i. Volume de estudo é pequeno, combina com busca por texto e com paginação numerada ou "carregar mais" no web; keyset pode ser exercitado na Fase 9 (alta demanda). **Dependência Frontend** (forma de paginar na UI).

### OQ-ReadSide-8 [técnica] Como montar documentos com dados de vários agregados que chegam fora de ordem?
- **Contexto:** Ordem só é garantida por agregado (ADR 0004:20). Se local, evento e sessão forem agregados distintos, um evento de sessão pode chegar antes do evento de criação do evento ou do local que ela referencia. Tratar isso como lacuna gera crash loop (Riscos). A complexidade depende inteiramente da fronteira de agregados escolhida por Dominio.
- **Opções:** A) **Eventos carregam o necessário** (event-carried state transfer): o evento de sessão já traz nome e cidade do local; mudanças no local fazem fan-out (`updateMany` com guarda de versão do local). Acopla o payload do write às necessidades do read. B) **Lookups no projector + merge comutativo**: o projector mantém coleções internas (ex.: `catalog_venues`) com a última versão de cada agregado referenciado; ao chegar um evento que referencia algo ainda não visto, grava um placeholder (`venue: { id, pending: true }`) e o completa quando o evento do local chegar (`updateMany` com guarda de versão); queries públicas ignoram documentos incompletos. C) **Um agregado raiz para evento+sessões+setores+lotes** (decisão de Dominio): tudo do evento cai na mesma partição e em ordem; só o local fica entre agregados, tratado por A ou B. D) Tratar referência ausente como lacuna (derruba o processo). Descartável: crash loop.
- **Recomendação:** C para o que for do evento (se fizer sentido no domínio) + B para o local. B mantém os eventos enxutos e sem viés de tela e é a lição mais realista de consistência eventual entre agregados; o resultado final independe da ordem de chegada, o que também torna o replay seguro. **Dependência Dominio** (fronteira dos agregados) e **Backend** (payloads).

### OQ-ReadSide-9 [técnica] Controle de sequência quando o documento junta vários agregados
- **Contexto:** Hoje a regra "`aggregateVersion = version + 1`" usa o `version` do próprio documento (`ping.projection.ts:55-57`, `sequence.ts:8-14`). Com um documento alimentado por vários agregados (ou um agregado alimentando vários documentos, como `event_listing` + `event_detail` + fan-out), o `version` do documento não representa um agregado.
- **Opções:** A) Coleção `aggregate_versions` no projector (`_id = aggregateId`, `aggregateType`, `version`), lida e atualizada na mesma transação; a decisão `apply`/`already-applied`/`gap` passa a ser por agregado, independente de quantos documentos ele toca. Os documentos guardam só a versão usada pelo `min_version`. B) Mapa `sourceVersions: { [aggregateId]: n }` dentro de cada documento, conferido em cada update. C) Manter por documento e exigir que cada documento tenha um único agregado de origem.
- **Recomendação:** A. Separa "o que já foi aplicado de cada agregado" (infra do projector) de "o que a tela mostra" (read model), funciona com fan-out e com vários read models por evento, e mantém intacta a semântica de lacuna da Fase 1 (ADR 0009:40) dentro de cada agregado. O replay apaga `aggregate_versions` junto com `processed_events`.

### OQ-ReadSide-10 [técnica] Qual versão o `min_version` compara num documento composto?
- **Contexto:** O command devolve `{ id, version }` do agregado que alterou (`http.ts:13`). Se o produtor altera uma sessão, um setor ou um local, e esses forem agregados distintos do evento, a versão devolvida não é comparável com uma "versão do evento". O web precisa saber o que esperar antes de navegar para a página.
- **Opções:** A) `GET /api/catalog/events/:id?min_version=n` compara com a versão do agregado raiz do evento; só funciona se sessões, setores e lotes forem parte desse agregado (OQ-ReadSide-8 C). B) Parâmetro adicional que diz de qual agregado é a versão (`?aggregate_id=X&min_version=n`), comparado com as versões por agregado guardadas no documento (`sourceVersions`) ou em `aggregate_versions`. C) Cada agregado tem sua própria leitura com `min_version` (ex.: `GET /api/catalog/venues/:id?min_version=n`), e a página do evento não aceita `min_version` de outros agregados. (Listas) i) `List*` não aceita `min_version`; o web espera na query por ID e depois invalida a lista. ii) `List*` aceita `min_version` de um agregado específico.
- **Recomendação:** A se Dominio optar por evento como raiz (mais simples e didático); senão C. Em ambos, i para listas. **Dependência Dominio e Backend** (qual versão cada command devolve) e **Frontend** (fluxo depois do command).

### OQ-ReadSide-11 [negócio] O que o produtor lê, e por quais read models?
- **Contexto:** O cadastro (local, evento, sessão, setores, lotes) acontece no web pelo produtor seed. Para editar ou adicionar sessões a um evento, o produtor precisa ver seus eventos, inclusive os não publicados, e escolher um local já cadastrado. Na Fase 2 não há autenticação: qualquer endpoint que devolva rascunhos é público.
- **Opções:** A) Leituras do produtor no read-service: `ListOrganizerEvents` (inclui rascunhos, filtrado pelo produtor seed) servido por `event_detail`/`event_listing` com `status`, e `ListVenues` servido por um read model de locais (a mesma coleção de lookup da OQ-ReadSide-8 B, ou outra). Rascunhos públicos sem auth até a Fase 3. B) Read model separado `organizer_events`. C) O produtor só cria; não há listagem/edição na Fase 2 (fluxo linear de cadastro em uma tela). D) Como A, mas sem expor rascunhos: o produtor só vê o que é publicado.
- **Recomendação:** A, aceitando a exposição até a Fase 3 (projeto de estudo, sem dados reais) e registrando isso como risco conhecido. Mostra que o "back-office" também lê do read side, com read-your-writes. **Dependência Dominio** (ciclo de vida, edições) e **Frontend** (telas do produtor).

### OQ-ReadSide-12 [técnica] Topologia de consumo no projector
- **Contexto:** Hoje há um grupo `projector` assinando um tópico (`kafka-consumer.service.ts:29`, `confluent-event-consumer.ts:13`). O Catalog traz o segundo tópico. Um erro em qualquer projeção encerra o processo inteiro (`kafka-consumer.service.ts:45`).
- **Opções:** A) Um grupo `projector`, assinando `diagnostics.events` e `catalog.events`; schema e handlers escolhidos por `message.topic`. B) Um consumer (e grupo) por tópico no mesmo processo (ex.: `projector-diagnostics`, `projector-catalog`), com falha isolada por tópico, mas o processo ainda cai inteiro no `exit(1)`. C) Um processo/serviço de projector por contexto no compose.
- **Recomendação:** A. Menor mudança, o replay continua sendo "um grupo, todos os tópicos" e o padrão da Fase 1 se mantém. A isolação por consumidor faz mais sentido na Fase 6 ("projeções por consumidor", `docs/roadmap.md:17`).

### OQ-ReadSide-13 [técnica] Refatorar a projeção do `Ping` para o mecanismo genérico?
- **Contexto:** O mecanismo novo (OQ-ReadSide-9) muda onde fica a checagem de sequência. A `PingProjection` (`ping.projection.ts:35-112`) tem a sua própria, com `PingIncremented` fixo em `sequence.ts:11`.
- **Opções:** A) Migrar `Ping` para o executor genérico (um mecanismo só; `pings` mantém `version` para o `min_version`). B) Manter `PingProjection` como está e criar o mecanismo novo só para o Catalog (dois mecanismos convivendo).
- **Recomendação:** A. Um mecanismo único é o que as próximas fases herdam (ADR 0009:63); os testes de integração, E2E e replay do `diagnostics` cobrem a refatoração.

### OQ-ReadSide-14 [técnica] Escopo do replay
- **Contexto:** `replay.ts:13-16,21-35` apaga coleções e reseta offsets de um tópico, ambos fixos no código. Com o Catalog, há mais coleções e mais um tópico.
- **Opções:** A) Replay total: para o projector, `deleteMany` em todas as coleções do projector (read models, lookups, `aggregate_versions`, `processed_events`), reseta o grupo em todos os tópicos assinados, sobe o projector. B) Replay por contexto/tópico (`pnpm replay catalog`): apaga só as coleções do contexto e os `processed_events`/`aggregate_versions` daquele contexto (exige um campo de contexto nesses registros) e reseta só o tópico. C) A + B.
- **Recomendação:** A. Com um grupo só (OQ-ReadSide-12 A), resetar um tópico e não outro é possível, mas o ganho é pequeno com o volume de estudo; o replay por projeção é tema da Fase 8 (`docs/roadmap.md:19`). A lista de coleções e tópicos deve ficar num lugar só (constantes), para o replay não ficar desatualizado.

### OQ-ReadSide-15 [técnica] Onde criar coleções e índices do MongoDB
- **Contexto:** Hoje as coleções são criadas no `mongo-init` (`infra/mongo/init-replica-set.js:21-27`) e não há índice. A vitrine vai precisar de índices (filtros, ordenação, texto). O `$text` falha sem índice. read-service e projector sobem depois do `mongo-init` (`docker-compose.yaml:194,222`). Os testes de integração usam Mongo próprio e criam o que precisam (`ping-projection.int.test.ts:55-60`).
- **Opções:** A) No `mongo-init` (declarativo, um lugar só, antes dos apps); testes de integração criam os índices de que dependem. B) No bootstrap do projector (`createIndexes` idempotente; o dono da escrita define o schema); o read-service assume que existem. C) No bootstrap do read-service (quem consulta define os índices). D) Script de "migração" do read store versionado.
- **Recomendação:** A. Mantém o padrão atual, garante índices antes de qualquer app e é independente do replay (que usa `deleteMany`, preservando índices). Mudança de índice em ambiente com volume existente exige recriar o volume ou rodar o script de novo (o `createIndex` é idempotente). Dono: área ReadSide (o arquivo é de infra; confirmar na consolidação que nenhuma outra área precisa editá-lo).

### OQ-ReadSide-16 [técnica] Prefixo das rotas e identificação do evento na URL
- **Contexto:** O `diagnostics` usa `/api/diagnostics/pings` (`constants.ts:7-11`), espelhando o módulo. As rotas de commands (Backend) e de queries precisam ser coerentes, porque o Nginx separa só por método.
- **Opções:** (a) Prefixo: A) `/api/catalog/events`, `/api/catalog/venues` (espelha o bounded context); B) `/api/events`, `/api/venues`. (b) Identificador: i) UUID do agregado; ii) slug legível (exige slug único gerado no write side e índice único no read model).
- **Recomendação:** A + i. Mantém o padrão por contexto e evita regra de geração/unicidade de slug, que seria regra de negócio nova. **Dependência Backend** (rotas dos commands) e **Frontend** (rotas do web).

### OQ-ReadSide-17 [técnica] Cobertura E2E e de replay do read side
- **Contexto:** A Fase 1 tem E2E de API, replay e Playwright (ADR 0009:48). O Catalog adiciona composição entre agregados, que é o ponto mais frágil.
- **Opções:** A) E2E de API (cadastro completo → vitrine e página via gateway com `min_version`; mensagem em `catalog.events` com key = ID do agregado) + replay total comparando `event_listing` e `event_detail` + teste de integração do projector que aplica os mesmos eventos em ordens diferentes e confere documento idêntico. B) Só E2E de API e replay. C) A + teste E2E que força ordem entre partições (difícil de garantir num ambiente real).
- **Recomendação:** A. A ordem entre partições não é controlável no E2E; o teste de comutatividade fica no nível de integração, onde a ordem é escolhida pelo teste. Playwright da vitrine e da página é da área Frontend.

## Decisões

Preenchida pelo thread principal com as respostas do usuário, na consolidação.

- OQ-ReadSide-1 → ...
