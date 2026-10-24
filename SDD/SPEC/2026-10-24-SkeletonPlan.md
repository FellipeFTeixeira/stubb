---
feature: Skeleton
fase: 1 — Esqueleto
date: 2026-10-24
status: implemented
research: SDD/RESEARCH/2026-10-24-SkeletonResearch.md
spec: SDD/SPEC/2026-10-24-SkeletonSpec.md
---

# Skeleton — Plan

COMO a Spec será implementada. As decisões citadas (OQ-n) estão na seção "Decisões" do Research.

## Roadmap

| # | Etapa | Objetivo | Entregável | Depende de |
|---|---|---|---|---|
| E1 | Prova do cliente Kafka | Provar que `@confluentinc/kafka-javascript` produz, consome e commita manualmente dentro de `node:24.22.1-trixie-slim` contra `apache/kafka:4.3.2` (riscos R-1/R-2 do Research) | Resultado no Board: biblioteca escolhida e forma de import | — |
| E2 | Fundação do monorepo | Raiz, manifests de todos os pacotes com versões exatas, lockfile, TypeScript, lint, configs de teste, scaffolds compiláveis, shadcn, line endings | `pnpm install`, `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes | E1 |
| E3 | Contratos | Schemas Zod e constantes públicas em `libs/contracts` | `@stubb/contracts` compilado e testado | E2 |
| E4 | Infra Docker | Dockerfile, compose base e dev, Nginx, scripts de bootstrap (tópicos, replica set, conector) | Configs validadas estaticamente | E2 |
| E5 | write-service | Commands, agregado, outbox, idempotência, migrations, job de limpeza | Unit e integração verdes (PostgreSQL isolado) | E3 |
| E6 | projector | Consumer com commit manual, dedupe, regra de sequência, projeção `pings` | Unit e integração verdes (MongoDB isolado) | E3 |
| E7 | read-service | Query `GetPing` com `min_version` | Unit e integração verdes (MongoDB isolado) | E3 |
| E8 | web | Página de diagnóstico com form, query, mutations e histórico | Unit verdes | E3 |
| E9 | Integração | Imagens, stack completa, E2E de API, Playwright, replay, roteiro de dev | `pnpm test:e2e` verde contra a stack de produção | E4, E5, E6, E7, E8 |
| E10 | CI e documentação | Workflow do GitHub Actions, ADR 0009, ajustes em overview, ADR 0008 e README | Arquivos revisados | E9 |

### Trilhas e ondas

No máximo 4 trilhas por onda. Todas trabalham na mesma working tree; cada uma só cria ou edita os arquivos que são seus. Arquivos de uma onda anterior passam a ser do dono indicado aqui e não são tocados por mais ninguém.

| Trilha | Onda | Etapas | Depende de | Arquivos donos (exclusivos) |
|---|---|---|---|---|
| F — Fundação | 0 | E1, E2 | — | `.gitattributes`, `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`; em cada pacote (`libs/contracts`, `apps/*`, `e2e`): `package.json`, `tsconfig*.json`, `nest-cli.json`, `vitest*.config.ts`; `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/components.json`, `apps/web/playwright.config.ts`, `apps/web/src/index.css`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/**`, `apps/web/src/test/setup.ts`. Cria também os scaffolds listados na T-6, que passam depois para as trilhas C, W, P, R e U |
| C — Contratos | 1 | E3 | F | `libs/contracts/src/**` |
| I — Infra | 1 | E4 | F | `Dockerfile`, `.dockerignore`, `infra/**` |
| W — write-service | 2 | E5 | C | `apps/write-service/src/**`, `apps/write-service/test/**` |
| P — projector | 2 | E6 | C | `apps/projector/src/**`, `apps/projector/test/**` |
| R — read-service | 2 | E7 | C | `apps/read-service/src/**`, `apps/read-service/test/**` |
| U — web | 2 | E8 | C | `apps/web/src/**`, exceto os arquivos da F listados acima (só leitura para U) |
| X — Integração | 3 | E9, E10 | I, W, P, R, U | `e2e/src/**`, `apps/web/e2e/**`, `.github/workflows/ci.yml`, `docs/architecture/adr/0009-ferramental-e-pipeline-da-fase-1.md`, `docs/architecture/overview.md`, `docs/architecture/adr/0008-frontend-react-vite.md`, `README.md` |

Ondas:
- **Onda 0:** F, sozinha.
- **Onda 1:** C e I em paralelo.
- **Onda 2:** W, P, R e U em paralelo (4 trilhas).
- **Onda 3:** X, sozinha.

Regras de convivência:
- **Dependências.** Nenhuma trilha roda `pnpm add`, `pnpm remove` ou altera manifests, lockfile ou configs da F depois da onda 0. Se faltar uma dependência ou um script, a trilha para e registra a falta no Board.
- **Docker.** Só a trilha X sobe a stack completa (`docker compose ... up`). As outras usam no máximo containers isolados com os nomes e portas da tabela "Containers isolados" e os removem ao terminar.
- **Correções na onda 3.** X roda sozinha e pode corrigir defeitos em arquivos de outras trilhas para fazer um CA passar, registrando cada correção no Board. Mudar uma interface desta seção não é correção: X para e pergunta.
- **Board.** O Board fica em `SDD/WORK/2026-10-24-SkeletonBoard.md` e é criado pelo thread principal. Cada trilha escreve só na própria seção (`## Trilha X`), com edições pontuais e nunca reescrevendo o arquivo inteiro: status, resultados que outras trilhas consomem (ex.: resultado da E1) e bloqueios.

### Interfaces entre trilhas

#### Pacotes do workspace

| Pacote | Caminho | Tipo |
|---|---|---|
| `@stubb/contracts` | `libs/contracts` | lib ESM compilada (`dist/`), `"files": ["dist"]` |
| `@stubb/write-service` | `apps/write-service` | NestJS, `"files": ["dist"]` |
| `@stubb/read-service` | `apps/read-service` | NestJS, `"files": ["dist"]` |
| `@stubb/projector` | `apps/projector` | NestJS, `"files": ["dist"]` |
| `@stubb/web` | `apps/web` | React + Vite |
| `@stubb/e2e` | `e2e` | testes ponta a ponta e replay (sem build) |

#### Exports de `@stubb/contracts` (entrada `libs/contracts/src/index.ts`)

| Export | Definição |
|---|---|
| `BOUNDED_CONTEXT_DIAGNOSTICS` | `'diagnostics'` |
| `DIAGNOSTICS_TOPIC` | `'diagnostics.events'` |
| `PING_AGGREGATE_TYPE` | `'Ping'` |
| `PING_EVENT_TYPES` | `{ created: 'PingCreated', incremented: 'PingIncremented' } as const` |
| `PING_LABEL_MAX_LENGTH` | `50` |
| `IDEMPOTENCY_KEY_HEADER` | `'Idempotency-Key'` |
| `MIN_VERSION_QUERY_PARAM` | `'min_version'` |
| `diagnosticsRoutes` | `{ createPing: '/api/diagnostics/pings', incrementPing: (id: string) => \`/api/diagnostics/pings/${id}/increment\`, getPing: (id: string) => \`/api/diagnostics/pings/${id}\` }` |
| `DIAGNOSTICS_ROUTE_TEMPLATES` | `{ createPing: 'POST /api/diagnostics/pings', incrementPing: 'POST /api/diagnostics/pings/:id/increment' } as const` (valor de `scope` da idempotência) |
| `uuidSchema` | `z.uuid()` |
| `idempotencyKeySchema` | `z.uuid()` |
| `minVersionSchema` | `z.coerce.number().int().min(1)` |
| `pingLabelSchema` | `z.string().trim().min(1, 'Informe um rótulo').max(50, 'Use no máximo 50 caracteres')` |
| `createEventEnvelopeSchema(eventType, aggregateType, payloadSchema)` | `z.object({ eventId: uuidSchema, eventType: z.literal(eventType), schemaVersion: z.literal(1), aggregateType: z.literal(aggregateType), aggregateId: uuidSchema, aggregateVersion: z.number().int().min(1), occurredAt: z.iso.datetime(), correlationId: uuidSchema.nullable(), causationId: uuidSchema.nullable(), payload: payloadSchema })` |
| `PingCreatedV1Schema` | envelope com `eventType 'PingCreated'` e `payload: z.object({ label: pingLabelSchema })`, estendido com `aggregateVersion: z.literal(1)` (`.extend`) |
| `PingIncrementedV1Schema` | envelope com `eventType 'PingIncremented'`, `payload: z.object({ count: z.number().int().min(1) })` |
| `DiagnosticsEventSchema` | `z.discriminatedUnion('eventType', [PingCreatedV1Schema, PingIncrementedV1Schema])` |
| `CreatePingRequestSchema` | `z.object({ label: pingLabelSchema })` |
| `IncrementPingRequestSchema` | `z.object({})` |
| `CommandAcceptedSchema` | `z.object({ id: uuidSchema, version: z.number().int().min(1) })` |
| `PingViewSchema` | `z.object({ id: uuidSchema, label: z.string(), count: z.number().int().min(0), version: z.number().int().min(1), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() })` |
| `GetPingResponseSchema` | `z.object({ ping: PingViewSchema, minVersionReached: z.boolean() })` |
| `PingNotFoundResponseSchema` | `z.object({ statusCode: z.literal(404), message: z.string(), minVersionReached: z.literal(false) })` |
| Tipos | `PingCreatedV1`, `PingIncrementedV1`, `DiagnosticsEvent`, `CreatePingRequest` (`z.output`), `CreatePingRequestInput` (`z.input`), `CommandAccepted`, `PingView`, `GetPingResponse`, `PingNotFoundResponse` |

#### HTTP

Rotas e respostas conforme a Spec (seção "Contratos"). Formato dos erros: o padrão do NestJS `{ statusCode, message, error }`. O `400` de validação Zod usa `message: 'Validation failed'` e `issues: Array<{ path: string; message: string }>`.

#### Serviços Docker, portas e variáveis

| Serviço (compose) | Imagem / target | Porta interna | Porta no host | Variáveis (default no compose) |
|---|---|---|---|---|
| `postgres` | `postgres:18.6-trixie` | 5432 | 5433 | `POSTGRES_USER=stubb`, `POSTGRES_PASSWORD=stubb`, `POSTGRES_DB=stubb` |
| `mongo` | `mongo:8.0.34` (`--replSet rs0`) | 27017 | 27017 | — |
| `kafka` | `apache/kafka:4.3.2` | 9092 (interno), 9093 (controller), 9094 (externo) | 9094 | ver T-13 |
| `connect` | `quay.io/debezium/connect:3.7.0.Final` | 8083 | 8083 | ver T-13 |
| `db-migrate` | target `write-service` | — | — | `DATABASE_URL` |
| `kafka-init` | `apache/kafka:4.3.2` | — | — | — |
| `mongo-init` | `mongo:8.0.34` | — | — | — |
| `connect-init` | `curlimages/curl:8.23.0` | — | — | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `write-service` | target `write-service` | 3001 | — | `PORT=3001`, `DATABASE_URL=postgres://stubb:stubb@postgres:5432/stubb` |
| `read-service` | target `read-service` | 3002 | — | `PORT=3002`, `MONGO_URL=mongodb://mongo:27017/?replicaSet=rs0`, `MONGO_DB=stubb_read` |
| `projector` | target `projector` | 3003 | — | `PORT=3003`, `MONGO_URL`, `MONGO_DB=stubb_read`, `KAFKA_BROKERS=kafka:9092`, `KAFKA_GROUP_ID=projector`, `KAFKA_CLIENT_ID=projector` |
| `gateway` | target `gateway` (dev: `gateway-dev`) | 80 | 8080 | — |
| `web` (só dev) | target `dev` | 5173 | — | — |
| `kafbat` (só dev) | `ghcr.io/kafbat/kafka-ui:v1.5.0` | 8080 | 8081 | ver T-16 |

Defaults das variáveis nos apps, usados quando rodam no host: `DATABASE_URL=postgres://stubb:stubb@localhost:5433/stubb`, `MONGO_URL=mongodb://localhost:27017/?directConnection=true`, `MONGO_DB=stubb_read`, `KAFKA_BROKERS=localhost:9094`, `KAFKA_GROUP_ID=projector`, `KAFKA_CLIENT_ID=projector`. `PORT`: 3001 no write-service, 3002 no read-service e 3003 no projector. O pacote `e2e` usa os mesmos defaults e mais `E2E_BASE_URL=http://localhost:8080`. O nome não é `BASE_URL` porque o Vitest injeta `BASE_URL='/'`.

#### Containers isolados (ondas 0 a 2)

| Trilha | Container | Imagem | Porta no host |
|---|---|---|---|
| F | `stubb-proof-kafka` (rede `stubb-proof`) | `apache/kafka:4.3.2` | nenhuma |
| W | `stubb-it-postgres-write` | `postgres:18.6-trixie` | 55432 |
| P | `stubb-it-mongo-projector` | `mongo:8.0.34` (`--replSet rs0`) | 58017 |
| R | `stubb-it-mongo-read` | `mongo:8.0.34` | 58018 |

As faixas 56946-57545 e 50000-50059 são portas TCP excluídas pelo Windows e não podem ser publicadas.

#### Banco de escrita (PostgreSQL, dono W)

| Tabela | Colunas |
|---|---|
| `diagnostics_pings` | `id uuid PK`, `label text`, `count integer`, `version integer`, `created_at timestamptz`, `updated_at timestamptz` |
| `outbox` | `id uuid PK`, `bounded_context text`, `aggregate_type text`, `aggregate_id text`, `aggregate_version bigint`, `event_type text`, `schema_version integer`, `occurred_at timestamptz`, `payload jsonb` (envelope completo) |
| `idempotency_keys` | `key uuid`, `scope text`, `request_hash char(64)`, `response_status integer null`, `response_body jsonb null`, `created_at timestamptz default now()`; PK `(key, scope)`; índice `idx_idempotency_keys_created_at` |

#### Read store (MongoDB, banco `stubb_read`)

| Coleção | Documento |
|---|---|
| `pings` | `{ _id: string (id do ping), label: string, count: number, version: number, createdAt: Date, updatedAt: Date }` |
| `processed_events` | `{ _id: string (eventId), consumer: 'projector', eventType: string, aggregateId: string, aggregateVersion: number, processedAt: Date }` |

#### Kafka e Debezium

- Tópico `diagnostics.events`: 3 partições, `retention.ms=-1`, criado pelo `kafka-init`. Grupo de consumo do projector: `projector`.
- Conector `stubb-outbox`: slot e publication `stubb_outbox`. Configuração na T-14.

#### `data-testid` do web (usados pelo Playwright)

`create-ping-label-input`, `create-ping-submit`, `create-ping-label-error`, `ping-label`, `ping-count`, `ping-version`, `ping-sync-status` (texto `sincronizado` ou `aguardando projeção`), `increment-ping`, `command-error`, `latency-history`, `latency-entry` (um por item, com atributo `data-ping-id`).

## Arquivos

| Ação | Caminho | Propósito |
|---|---|---|
| criar | `.gitattributes`, `.gitignore` | LF e arquivos ignorados (F) |
| criar | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore` | Raiz do monorepo (F) |
| criar | `libs/contracts/{package.json,tsconfig.json,tsconfig.build.json,vitest.config.ts}` | Pacote de contratos (F) |
| criar | `libs/contracts/src/**` | Schemas e constantes (C) |
| criar | `apps/{write-service,read-service,projector}/{package.json,tsconfig.json,tsconfig.build.json,nest-cli.json,vitest.config.ts,vitest.integration.config.ts}` | Configuração dos apps Nest (F) |
| criar | `apps/write-service/src/**`, `apps/write-service/test/**` | write-service (W) |
| criar | `apps/projector/src/**`, `apps/projector/test/**` | projector (P) |
| criar | `apps/read-service/src/**`, `apps/read-service/test/**` | read-service (R) |
| criar | `apps/web/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,playwright.config.ts,index.html,components.json}`, `apps/web/src/{index.css,lib/utils.ts,components/ui/**,test/setup.ts}` | Configuração do web e shadcn (F) |
| criar | `apps/web/src/**` (demais) | Aplicação web (U) |
| criar | `e2e/{package.json,tsconfig.json,vitest.config.ts}` | Pacote E2E (F) |
| criar | `e2e/src/**`, `apps/web/e2e/**` | Testes ponta a ponta e replay (X) |
| criar | `Dockerfile`, `.dockerignore` | Imagens (I) |
| criar | `infra/compose.yaml`, `infra/compose.dev.yaml` | Compose base e dev (I) |
| criar | `infra/nginx/nginx.prod.conf`, `infra/nginx/nginx.dev.conf` | Gateway (I) |
| criar | `infra/kafka/create-topics.sh`, `infra/mongo/init-replica-set.js`, `infra/debezium/register-connector.sh` | Bootstrap (I) |
| criar | `infra/scripts/docker-up.ps1` | Mantém a distro do WSL2 e o engine Docker no ar (I, OQ-45) |
| criar | `.github/workflows/ci.yml` | CI (X) |
| criar | `docs/architecture/adr/0009-ferramental-e-pipeline-da-fase-1.md` | ADR (X) |
| alterar | `docs/architecture/overview.md` (linha 47), `docs/architecture/adr/0008-frontend-react-vite.md` (linhas 38 e 40), `README.md` (linha 93 e nova seção) | Decisões da fase (X) |

## Tarefas

### E1 — Prova do cliente Kafka (trilha F)

- [ ] T-1 Provar `@confluentinc/kafka-javascript@1.11.0` na imagem final. (cobre CA-1)
  1. Criar um diretório temporário **fora do repositório** com `DIR=$(mktemp -d)` (Git Bash).
  2. Nesse diretório, criar três arquivos.

     `Dockerfile`:
     ```dockerfile
     FROM node:24.22.1-trixie-slim
     WORKDIR /proof
     COPY package.json proof.mjs ./
     RUN npm install --no-audit --no-fund
     CMD ["node", "proof.mjs"]
     ```

     `package.json`:
     ```json
     { "type": "module", "dependencies": { "@confluentinc/kafka-javascript": "1.11.0" } }
     ```

     `proof.mjs`:
     ```js
     import * as mod from '@confluentinc/kafka-javascript';
     const namedImport = typeof mod.KafkaJS !== 'undefined';
     const { Kafka } = mod.KafkaJS ?? mod.default.KafkaJS;
     const brokers = ['stubb-proof-kafka:9092'];
     const topic = 'proof.events';
     const groupId = 'proof-group';
     const kafka = new Kafka({ kafkaJS: { clientId: 'proof', brokers } });

     const producer = kafka.producer();
     await producer.connect();
     await producer.send({ topic, messages: [
       { key: 'agg-1', value: 'm1', headers: { eventId: 'e1' } },
       { key: 'agg-1', value: 'm2', headers: { eventId: 'e2' } },
     ] });
     await producer.disconnect();

     const first = kafka.consumer({ kafkaJS: { groupId, fromBeginning: true, autoCommit: false } });
     await first.connect();
     await first.subscribe({ topics: [topic] });
     await new Promise((resolve, reject) => {
       const timer = setTimeout(() => reject(new Error('timeout no primeiro consumer')), 30000);
       const seen = [];
       first.run({ eachMessage: async ({ topic: t, partition, message }) => {
         const value = message.value.toString();
         seen.push(value);
         if (value === 'm1') {
           await first.commitOffsets([{ topic: t, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
         }
         if (seen.includes('m1') && seen.includes('m2')) { clearTimeout(timer); resolve(); }
       } });
     });
     await first.disconnect();

     const second = kafka.consumer({ kafkaJS: { groupId, fromBeginning: true, autoCommit: false } });
     await second.connect();
     await second.subscribe({ topics: [topic] });
     const redelivered = await new Promise((resolve, reject) => {
       const timer = setTimeout(() => reject(new Error('timeout no segundo consumer')), 30000);
       second.run({ eachMessage: async ({ message }) => { clearTimeout(timer); resolve(message.value.toString()); } });
     });
     await second.disconnect();

     if (redelivered !== 'm2') { console.error(`FALHOU: esperado m2, recebido ${redelivered}`); process.exit(1); }
     console.log(`PROOF OK lib=@confluentinc/kafka-javascript namedImport=${namedImport}`);
     process.exit(0);
     ```
  3. Subir o broker isolado e criar o tópico:
     ```bash
     docker network create stubb-proof
     docker run -d --rm --name stubb-proof-kafka --network stubb-proof \
       -e KAFKA_NODE_ID=1 -e KAFKA_PROCESS_ROLES=broker,controller \
       -e KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 \
       -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://stubb-proof-kafka:9092 \
       -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT \
       -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
       -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@stubb-proof-kafka:9093 \
       -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
       -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
       apache/kafka:4.3.2
     until docker exec stubb-proof-kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1; do sleep 2; done
     docker exec stubb-proof-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic proof.events --partitions 3 --replication-factor 1
     ```
  4. Rodar a prova: `docker build -t stubb-kafka-proof "$(cygpath -w "$DIR")"` e `docker run --rm --network stubb-proof stubb-kafka-proof`.
  5. Limpar sempre, com sucesso ou falha: `docker stop stubb-proof-kafka; docker network rm stubb-proof; docker image rm stubb-kafka-proof; rm -rf "$DIR"`.
  6. Registrar no Board, na seção da F, a linha `PROOF OK ...` completa ou o erro.
  - Teste: a saída contém `PROOF OK lib=@confluentinc/kafka-javascript` e o processo termina com 0.
- [ ] T-2 Contingência, executada **só se a T-1 falhar**. (cobre CA-1)
  1. Repetir a T-1 com `package.json` dependendo de `"kafkajs": "2.2.4"` e com a prova adaptada à API do kafkajs:
     - `import { Kafka } from 'kafkajs'`;
     - `new Kafka({ clientId: 'proof', brokers })`;
     - `kafka.consumer({ groupId })`;
     - `subscribe({ topics: [topic], fromBeginning: true })`;
     - `run({ autoCommit: false, eachMessage })`;
     - mesmo `commitOffsets`.
  2. Na saída, imprimir `lib=kafkajs`.
  3. Se passar, registrar no Board `CONTINGÊNCIA kafkajs` e, na E2, trocar `@confluentinc/kafka-javascript` por `kafkajs@2.2.4` em `apps/projector` e `e2e` e retirar a entrada dela de `allowBuilds`. Se as duas falharem, **parar** e devolver a dúvida.
  - Teste: igual à T-1, com `lib=kafkajs`.

### E2 — Fundação do monorepo (trilha F)

Pré-requisitos: ver "Notas para o implementador" (Node 24.22.1 no host, pnpm via corepack, Docker Engine do Ubuntu no WSL2 rodando e CLI no contexto `wsl-engine`).

- [ ] T-3 Line endings e arquivos ignorados. (cobre CA-2)
  1. `.gitattributes`:
     ```
     * text=auto eol=lf
     *.png binary
     *.jpg binary
     *.jpeg binary
     *.gif binary
     *.ico binary
     *.webp binary
     *.woff binary
     *.woff2 binary
     *.pdf binary
     ```
  2. `.gitignore`:
     ```
     node_modules/
     dist/
     coverage/
     *.tsbuildinfo
     .env
     !.env.example
     playwright-report/
     test-results/
     .vite/
     .claude/settings.local.json
     ```
  3. Rodar `git add --renormalize .` sem commitar (o commit só acontece se o usuário pedir).
  - Teste: `git ls-files --eol` mostra só `i/lf` (ou `i/none` nos `.gitkeep`) nos arquivos de texto; `git check-ignore -v node_modules/x dist/x coverage/x a.tsbuildinfo .env playwright-report/x test-results/x .vite/x .claude/settings.local.json` lista todos; `git check-ignore .env.example` não lista nada.
- [ ] T-4 Raiz do monorepo. (cobre CA-3)
  1. `package.json`:
     ```json
     {
       "name": "stubb",
       "private": true,
       "type": "module",
       "packageManager": "pnpm@12.15.0",
       "engines": { "node": ">=24.22.1 <25" },
       "scripts": {
         "build": "pnpm -r build",
         "lint": "pnpm --filter @stubb/contracts build && eslint . && prettier --check .",
         "format": "prettier --write .",
         "typecheck": "pnpm --filter @stubb/contracts build && pnpm -r typecheck",
         "test": "pnpm --filter @stubb/contracts build && pnpm -r test",
         "test:e2e": "pnpm --filter @stubb/e2e test:e2e && pnpm --filter @stubb/web test:e2e",
         "replay": "pnpm --filter @stubb/e2e replay",
         "stack:up": "docker compose -f infra/compose.yaml up -d --build --wait",
         "stack:dev": "docker compose -f infra/compose.yaml -f infra/compose.dev.yaml up --build --watch",
         "stack:down": "docker compose -f infra/compose.yaml -f infra/compose.dev.yaml rm -fsv && docker compose -f infra/compose.yaml -f infra/compose.dev.yaml down"
       }
     }
     ```
     O pacote `e2e` não tem script `test`, então `pnpm -r test` o ignora.
  2. `pnpm-workspace.yaml`:
     ```yaml
     packages:
       - apps/*
       - libs/*
       - e2e
     savePrefix: ''
     engineStrict: true
     allowBuilds:
       '@confluentinc/kafka-javascript': true
       '@swc/core': true
       esbuild: true
     ```
     Se o `pnpm install` acrescentar outras entradas com valor provisório, colocar `false`. Se algum build, lint ou teste falhar por causa disso, parar e registrar no Board.
  3. `tsconfig.base.json`:
     ```json
     {
       "compilerOptions": {
         "target": "ES2023", "lib": ["ES2023"], "module": "nodenext", "moduleResolution": "nodenext",
         "resolvePackageJsonExports": true, "strict": true, "noUncheckedIndexedAccess": true,
         "esModuleInterop": true, "isolatedModules": true, "skipLibCheck": true,
         "forceConsistentCasingInFileNames": true, "sourceMap": true
       }
     }
     ```
  4. `.prettierrc.json`: `{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }`.
  5. `.prettierignore`: `pnpm-lock.yaml`, `**/dist`, `**/coverage`, `**/playwright-report`, `**/test-results`, `*.md`, `SDD/`, `docs/`, `.claude/`.
  6. `eslint.config.js` com `defineConfig` e `globalIgnores` de `eslint/config`:
     - ignores: `**/dist/**`, `**/coverage/**`, `**/playwright-report/**`, `**/test-results/**`, `apps/web/src/components/ui/**`, `SDD/**`, `docs/**`, `.claude/**`;
     - configs: `@eslint/js` `recommended`, `typescript-eslint` `recommendedTypeChecked` com `parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }`;
     - `tseslint.configs.disableTypeChecked` para `**/*.js` e `**/*.mjs`, com `globals.node`;
     - para `apps/web/**/*.{ts,tsx}`: o flat config recomendado do `eslint-plugin-react-hooks` 7.1.1 (`reactHooks.configs.flat.recommended`; se esse export não existir na versão instalada, `reactHooks.configs['recommended-latest']`), `reactRefresh.configs.vite` e `globals.browser`;
     - por último, `eslint-config-prettier`.

     A regra `@typescript-eslint/no-floating-promises` fica como `error` (já vem no `recommendedTypeChecked`; não desligar).
- [ ] T-5 Manifests de todos os pacotes, com versões exatas, e instalação. (cobre CA-3, CA-4)
  1. Criar os `package.json` com `"type": "module"`, `"private": true`, nome da tabela de pacotes, `"files": ["dist"]` (menos web e e2e) e os scripts abaixo. Instalar as dependências com `pnpm add -E` na versão exata da tabela.
  2. Para pacotes auxiliares que a tabela não lista (ex.: dependências que o `shadcn` instala), usar a versão que o comando resolver no dia e conferir que ficou sem `^`/`~`.
  3. Rodar `pnpm install` na raiz.

  | Pacote | dependencies | devDependencies |
  |---|---|---|
  | raiz | — | `typescript@6.0.3`, `@types/node@24.19.2`, `eslint@10.13.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.72.0`, `eslint-config-prettier@10.1.8`, `eslint-plugin-react-hooks@7.1.1`, `eslint-plugin-react-refresh@0.5.7`, `globals@17.13.0`, `prettier@3.9.10` |
  | `@stubb/contracts` | `zod@4.6.7` | `typescript@6.0.3`, `vitest@5.0.5` |
  | `@stubb/write-service` | `@nestjs/common@12.2.0`, `@nestjs/core@12.2.0`, `@nestjs/platform-express@12.2.0`, `@nestjs/cqrs@12.1.1`, `@nestjs/typeorm@12.0.2`, `@nestjs/schedule@12.0.2`, `typeorm@1.1.2`, `pg@8.23.1`, `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `uuid@14.0.3`, `zod@4.6.7`, `@stubb/contracts@workspace:*` | `@nestjs/cli@12.0.10`, `@nestjs/testing@12.2.0`, `typescript@6.0.3`, `vitest@5.0.5`, `unplugin-swc@2.0.0`, `@swc/core@1.16.20`, `@types/node@24.19.2`, `@types/express@5.0.6`, `supertest@7.3.1`, `@types/supertest@7.2.1` |
  | `@stubb/read-service` | `@nestjs/common@12.2.0`, `@nestjs/core@12.2.0`, `@nestjs/platform-express@12.2.0`, `@nestjs/cqrs@12.1.1`, `mongodb@7.7.0`, `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `zod@4.6.7`, `@stubb/contracts@workspace:*` | mesmas devDependencies do write-service |
  | `@stubb/projector` | `@nestjs/common@12.2.0`, `@nestjs/core@12.2.0`, `@nestjs/platform-express@12.2.0`, `@confluentinc/kafka-javascript@1.11.0` (ou `kafkajs@2.2.4` pela T-2), `mongodb@7.7.0`, `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `zod@4.6.7`, `@stubb/contracts@workspace:*` | mesmas devDependencies do write-service |
  | `@stubb/web` | `react@19.3.1`, `react-dom@19.3.1`, `react-router@8.5.0`, `@tanstack/react-query@5.104.5`, `zustand@5.0.16`, `react-hook-form@7.91.0`, `@hookform/resolvers@6.0.0`, `zod@4.6.7`, `@stubb/contracts@workspace:*` (mais as que o shadcn instala) | `vite@8.3.5`, `@vitejs/plugin-react@6.1.2`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, `typescript@6.0.3`, `vitest@5.0.5`, `jsdom@30.1.3`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event@14.6.8`, `@playwright/test@1.64.1`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `@types/node@24.19.2` |
  | `@stubb/e2e` | — | `typescript@6.0.3`, `vitest@5.0.5`, `pg@8.23.1`, `@types/pg@8.23.1`, `mongodb@7.7.0`, `@confluentinc/kafka-javascript@1.11.0` (ou `kafkajs@2.2.4`), `uuid@14.0.3`, `zod@4.6.7`, `@stubb/contracts@workspace:*`, `@types/node@24.19.2` |

  Scripts por pacote:
  - `@stubb/contracts`:
    - `build`: `tsc -p tsconfig.build.json`;
    - `typecheck`: `tsc -p tsconfig.json --noEmit`;
    - `test`: `vitest run`;
    - `lint`: `eslint . && prettier --check --ignore-path ../../.prettierignore .`;
    - `exports`: `{ ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`.
  - Apps Nest (os três):
    - `build`: `nest build`;
    - `start`: `node dist/main.js`;
    - `start:dev`: `nest start --watch`;
    - `typecheck`: `tsc -p tsconfig.json --noEmit`;
    - `test`: `vitest run`;
    - `test:integration`: `vitest run --config vitest.integration.config.ts`;
    - `lint`: igual ao do contracts.
  - Só no write-service:
    - `migration:generate`: `typeorm migration:generate -d dist/database/data-source.js`;
    - `migrate`: `node dist/database/migrate.js`.
  - `@stubb/web`:
    - `dev`: `vite`;
    - `build`: `tsc -p tsconfig.json --noEmit && vite build`;
    - `typecheck`: `tsc -p tsconfig.json --noEmit`;
    - `test`: `vitest run`;
    - `test:e2e`: `playwright test`;
    - `lint`: igual ao do contracts.
  - `@stubb/e2e`:
    - `typecheck`: `tsc -p tsconfig.json --noEmit`;
    - `test:e2e`: `vitest run src/api && vitest run src/replay`;
    - `replay`: `node src/replay-cli.ts`;
    - `lint`: igual ao do contracts.
  - Teste: `pnpm install` termina sem erro; `grep -rE '"[\^~][0-9]' --include=package.json apps libs e2e package.json` não encontra nada.
- [ ] T-6 Configs TypeScript e de teste por pacote e scaffolds compiláveis. (cobre CA-3)
  - **Apps Nest:**
    - `tsconfig.json`: estende `../../tsconfig.base.json`, com `experimentalDecorators`, `emitDecoratorMetadata`, `strictPropertyInitialization: false`, `noEmit: true`, `types: ["node"]` e `include: ["src", "test", "vitest.config.ts", "vitest.integration.config.ts"]`.
    - `tsconfig.build.json`: estende `./tsconfig.json`, com `noEmit: false`, `rootDir: "src"`, `outDir: "dist"`, `include: ["src"]` e `exclude: ["src/**/*.spec.ts"]`.
    - `nest-cli.json`: `{ "$schema": "https://json.schemastore.org/nest-cli", "sourceRoot": "src", "entryFile": "main", "compilerOptions": { "builder": "tsc", "tsConfigPath": "tsconfig.build.json", "deleteOutDir": true } }`.
    - `vitest.config.ts` segue a receita SWC da doc do NestJS: `plugins: [swc.vite({ module: { type: 'es6' } })]` e `test: { include: ['src/**/*.spec.ts', 'test/unit/**/*.spec.ts'], passWithNoTests: true }`.
    - `vitest.integration.config.ts` usa o mesmo plugin e `test: { include: ['test/integration/**/*.int.test.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000, passWithNoTests: true }`.
  - **`libs/contracts`:**
    - `tsconfig.json`: estende o base, com `noEmit: true` e `include: ["src", "vitest.config.ts"]`.
    - `tsconfig.build.json`: com `noEmit: false`, `declaration: true`, `rootDir: "src"`, `outDir: "dist"`, `include: ["src"]` e `exclude: ["src/**/*.test.ts"]`.
    - `vitest.config.ts`: `include: ['src/**/*.test.ts']`, `passWithNoTests: true`.
  - **`apps/web/tsconfig.json`:** estende o base, sobrescrevendo `module: "esnext"`, `moduleResolution: "bundler"`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `types: ["vite/client", "node"]`, `noEmit: true` e `paths: { "@/*": ["./src/*"] }` (sem `baseUrl`, que o TS 6 descontinua). `include: ["src", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]`.
  - **`e2e/tsconfig.json`:** estende o base, com `noEmit: true`, `allowImportingTsExtensions: true`, `erasableSyntaxOnly: true`, `types: ["node"]` e `include: ["src", "vitest.config.ts"]`.
  - **`e2e/vitest.config.ts`:** `test: { include: ['src/**/*.e2e.test.ts'], fileParallelism: false, testTimeout: 60000, hookTimeout: 120000 }`.
  - **Scaffolds** (depois da onda 0 passam para as trilhas donas dos diretórios):
    - `libs/contracts/src/index.ts` com `export {};`;
    - em cada app Nest, `src/main.ts` (`import 'reflect-metadata'`, `NestFactory.create(AppModule)`, `enableShutdownHooks()`, `listen(Number(process.env.PORT ?? <porta>), '0.0.0.0')`), `src/app.module.ts` e `src/health/health.controller.ts` (`GET /health` → `{ status: 'ok' }`), com imports relativos terminando em `.js`;
    - `apps/web/src/main.tsx` renderizando `<div>Stubb</div>`;
    - `e2e/src/.gitkeep`.
  - Teste: `pnpm typecheck` e `pnpm test` terminam com 0.
- [ ] T-7 Base do web: Vite, Tailwind, shadcn/ui, testes e Playwright. (cobre CA-3)
  1. `apps/web/vite.config.ts`:
     ```ts
     import path from 'node:path';
     import tailwindcss from '@tailwindcss/vite';
     import react from '@vitejs/plugin-react';
     import { defineConfig } from 'vite';

     export default defineConfig({
       plugins: [react(), tailwindcss()],
       resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
       server: { host: '0.0.0.0', port: 5173, strictPort: true, hmr: { clientPort: 8080 } },
     });
     ```
  2. `apps/web/vitest.config.ts`: `mergeConfig(viteConfig, defineConfig({ test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'], passWithNoTests: true } }))`.
  3. `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest';` e `afterEach(cleanup)` (de `vitest` e `@testing-library/react`). O Vitest roda sem globals, então o RTL não limpa o DOM sozinho entre os testes.
  4. `index.html` com `<div id="root">`, `<script type="module" src="/src/main.tsx">` e `lang="pt-BR"`.
  5. Em `apps/web`, rodar `pnpm dlx shadcn@4.22.1 init -t vite -b radix -p nova --no-monorepo --no-rtl -y`. Se algum prompt aparecer, responder com esses mesmos valores.
  6. Rodar `pnpm dlx shadcn@4.22.1 add button input label card`.
  7. Conferir que `components.json`, `src/index.css`, `src/lib/utils.ts` e `src/components/ui/{button,input,label,card}.tsx` existem e rodar `pnpm exec prettier --write apps/web/src apps/web/components.json`.
  8. `playwright.config.ts`: `testDir: 'e2e'`, `use: { baseURL: 'http://localhost:8080' }`, projeto único `chromium`, `retries: 0`, `reporter: 'list'`.
  9. Instalar o navegador com `pnpm --filter @stubb/web exec playwright install chromium`.
  - Teste: `pnpm --filter @stubb/web build` termina com 0.
- [ ] T-8 Verificação da fundação. (cobre CA-2, CA-3)
  - Teste: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` e `pnpm test` terminam com 0. Registrar "F concluída" no Board.

### E3 — Contratos (trilha C)

- [ ] T-9 Constantes, schemas compartilhados e de HTTP, exatamente como em "Interfaces entre trilhas". Arquivos: `src/diagnostics/constants.ts`, `src/http/constants.ts`, `src/shared/schemas.ts`, `src/diagnostics/http.ts`, reexportados por `src/index.ts` com imports terminando em `.js`. (cobre CA-5, CA-12)
  - Teste: `src/diagnostics/http.test.ts`:
    - `CreatePingRequestSchema` aceita `'  abc  '` → `'abc'` e aceita 50 caracteres;
    - rejeita ausente, `''`, `'   '` e 51 caracteres, com as mensagens em PT-BR;
    - `minVersionSchema` aceita `'3'` → 3 e rejeita `'0'`, `'-1'`, `'1.5'` e `'x'`;
    - `idempotencyKeySchema` rejeita `'abc'` e aceita um uuid v7.
- [ ] T-10 Envelope e eventos: `src/events/envelope.ts` e `src/diagnostics/events.ts`. (cobre CA-5)
  - Teste: `src/diagnostics/events.test.ts`:
    - aceita um `PingCreated` e um `PingIncremented` completos, com `correlationId`/`causationId` `null`;
    - rejeita sem `eventId`, com `eventType` desconhecido, com `schemaVersion: 2`, com `aggregateVersion: 0`, `PingCreated` com `aggregateVersion: 2`, com `occurredAt` inválido, sem `correlationId` (campo ausente) e com `payload.count: 0`;
    - `DiagnosticsEventSchema` discrimina pelos dois tipos.
- [ ] T-11 Verificação. (cobre CA-5)
  - Teste: `pnpm --filter @stubb/contracts build`, `typecheck`, `test` e `lint` terminam com 0. Registrar "C concluída" no Board.

### E4 — Infra Docker (trilha I)

- [ ] T-12 `Dockerfile` na raiz e `.dockerignore`. (cobre CA-6)
  ```dockerfile
  # syntax=docker/dockerfile:1
  FROM node:24.22.1-trixie-slim AS base
  ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  RUN corepack enable
  WORKDIR /usr/src/app

  FROM base AS deps
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
  COPY libs/contracts/package.json libs/contracts/
  COPY apps/write-service/package.json apps/write-service/
  COPY apps/read-service/package.json apps/read-service/
  COPY apps/projector/package.json apps/projector/
  COPY apps/web/package.json apps/web/
  COPY e2e/package.json e2e/
  RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
      pnpm fetch --store-dir /pnpm/store && \
      pnpm install --frozen-lockfile --offline --store-dir /pnpm/store

  FROM deps AS dev
  RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
  COPY . .
  RUN pnpm --filter @stubb/contracts build

  FROM deps AS build
  COPY . .
  RUN pnpm --filter @stubb/contracts build && \
      pnpm --filter @stubb/write-service --filter @stubb/read-service --filter @stubb/projector --filter @stubb/web build
  RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
      pnpm --filter @stubb/write-service deploy --prod --store-dir /pnpm/store /prod/write-service && \
      pnpm --filter @stubb/read-service deploy --prod --store-dir /pnpm/store /prod/read-service && \
      pnpm --filter @stubb/projector deploy --prod --store-dir /pnpm/store /prod/projector

  FROM base AS write-service
  ENV NODE_ENV=production PORT=3001
  COPY --from=build --chown=node:node /prod/write-service ./
  USER node
  EXPOSE 3001
  CMD ["node", "dist/main.js"]
  ```
  Os targets `read-service` (porta 3002, `/prod/read-service`) e `projector` (porta 3003, `/prod/projector`) são idênticos ao `write-service`, trocando porta e diretório. Depois deles:
  ```dockerfile
  FROM nginx:1.30.6-alpine AS gateway
  COPY infra/nginx/nginx.prod.conf /etc/nginx/conf.d/default.conf
  COPY --from=build /usr/src/app/apps/web/dist /usr/share/nginx/html

  FROM nginx:1.30.6-alpine AS gateway-dev
  COPY infra/nginx/nginx.dev.conf /etc/nginx/conf.d/default.conf
  ```
  `.dockerignore`: `**/node_modules`, `**/dist`, `**/coverage`, `**/playwright-report`, `**/test-results`, `**/*.tsbuildinfo`, `.git`, `.github`, `.claude`, `SDD`, `docs`.
  - Teste: `docker build --target deps -t stubb-check-deps .` termina com 0 (só depende dos manifests da F); depois `docker image rm stubb-check-deps`. O build dos targets de app é verificado pela X (T-39).
- [ ] T-13 `infra/compose.yaml` (base). (cobre CA-6)
  - **Topo do arquivo:** `name: stubb` e volumes nomeados `postgres-data`, `mongo-data` e `kafka-data`. Os serviços seguem a tabela de "Interfaces entre trilhas"; os apps usam `build: { context: .., dockerfile: Dockerfile, target: <target> }`. Credenciais e nome do banco usam `${POSTGRES_USER:-stubb}`, `${POSTGRES_PASSWORD:-stubb}` e `${POSTGRES_DB:-stubb}`.
  - **`postgres`:**
    - `command: ["postgres", "-c", "wal_level=logical"]`;
    - volume `postgres-data:/var/lib/postgresql` (a partir da 18, a imagem usa `PGDATA` versionado dentro desse diretório);
    - healthcheck `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` com `interval: 5s` e `retries: 20`.
  - **`mongo`:**
    - `command: ["--replSet", "rs0", "--bind_ip_all"]`;
    - volume `mongo-data:/data/db`;
    - healthcheck `mongosh --quiet --eval "db.adminCommand('ping').ok"`.
  - **`mongo-init`:** `mongosh --host mongo:27017 --quiet /scripts/init-replica-set.js`, com bind de `./mongo/init-replica-set.js` (read-only) e `depends_on: mongo: service_healthy`.
  - **`kafka`:**
    - variáveis:
      - `KAFKA_NODE_ID=1`, `KAFKA_PROCESS_ROLES=broker,controller`;
      - `KAFKA_LISTENERS=INTERNAL://:9092,CONTROLLER://:9093,EXTERNAL://:9094`;
      - `KAFKA_ADVERTISED_LISTENERS=INTERNAL://kafka:9092,EXTERNAL://localhost:9094`;
      - `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT`;
      - `KAFKA_INTER_BROKER_LISTENER_NAME=INTERNAL`, `KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER`, `KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093`;
      - `CLUSTER_ID=4L6g3nShT-eMCtK--X86sw`;
      - `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1`, `KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1`, `KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1`;
      - `KAFKA_SHARE_COORDINATOR_STATE_TOPIC_REPLICATION_FACTOR=1`, `KAFKA_SHARE_COORDINATOR_STATE_TOPIC_MIN_ISR=1`;
      - `KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0`;
      - `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false`;
      - `KAFKA_LOG_DIRS=/var/lib/kafka/data`;
      - `KAFKA_HEAP_OPTS=-Xms512m -Xmx512m`;
    - `hostname: kafka`, volume `kafka-data:/var/lib/kafka/data`;
    - healthcheck `/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null 2>&1`, com `start_period: 20s` e `retries: 30`.
  - **`kafka-init`:** `entrypoint: ["/bin/bash", "/scripts/create-topics.sh"]`, `depends_on: kafka: service_healthy`.
  - **`connect`:**
    - variáveis:
      - `BOOTSTRAP_SERVERS=kafka:9092`, `GROUP_ID=stubb-connect`;
      - `CONFIG_STORAGE_TOPIC=_connect_configs`, `OFFSET_STORAGE_TOPIC=_connect_offsets`, `STATUS_STORAGE_TOPIC=_connect_statuses`;
      - `CONNECT_CONFIG_STORAGE_REPLICATION_FACTOR=1`, `CONNECT_OFFSET_STORAGE_REPLICATION_FACTOR=1`, `CONNECT_STATUS_STORAGE_REPLICATION_FACTOR=1`;
      - `HEAP_OPTS=-Xms256m -Xmx512m`;
    - `depends_on`: `kafka-init` concluído com sucesso e `postgres` saudável;
    - healthcheck `curl -fsS http://localhost:8083/connectors` (ou a alternativa da T-17).
  - **`connect-init`:** `entrypoint: ["/bin/sh", "/scripts/register-connector.sh"]` e as variáveis `DB_*`; `depends_on`: `connect` saudável e `db-migrate` concluído com sucesso.
  - **`db-migrate`:** target `write-service`, `command: ["node", "dist/database/migrate.js"]`, `DATABASE_URL`; `depends_on: postgres: service_healthy`.
  - **`write-service`:** `depends_on`: `db-migrate` e `connect-init` concluídos com sucesso. Sem o conector registrado o slot não existe, e escritas anteriores a ele não chegariam ao Kafka.
  - **`read-service`:** `depends_on`: `mongo-init` concluído com sucesso.
  - **`projector`:** `depends_on`: `kafka-init` e `mongo-init` concluídos com sucesso.
  - **Os três apps:**
    - `restart: unless-stopped`;
    - healthcheck `["CMD", "node", "-e", "fetch('http://127.0.0.1:<porta>/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`, com `start_period: 30s`.
  - **`gateway`:**
    - `ports: ["8080:80"]`;
    - `depends_on`: `write-service` e `read-service` saudáveis;
    - healthcheck `wget -q -O /dev/null http://127.0.0.1/ || exit 1`.
  - Teste: `docker compose -f infra/compose.yaml config --quiet` termina com 0.
- [ ] T-14 Scripts de bootstrap. (cobre CA-6, CA-19)
  - **`infra/kafka/create-topics.sh`** (bash, `set -euo pipefail`):
    - cria com `kafka-topics.sh --bootstrap-server kafka:9092 --create --if-not-exists --topic diagnostics.events --partitions 3 --replication-factor 1 --config retention.ms=-1`;
    - em seguida roda `--describe` do mesmo tópico.
  - **`infra/mongo/init-replica-set.js`:**
    - faz `try { rs.status() } catch { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] }) }`;
    - espera `db.hello().isWritablePrimary`, com no máximo 60 tentativas de 500 ms (depois disso, `throw`);
    - cria as coleções `pings` e `processed_events` em `stubb_read`, se não existirem.
  - **`infra/debezium/register-connector.sh`** (sh do `curlimages/curl`, `set -eu`):
    1. Espera `curl -fsS http://connect:8083/connectors` responder (até 60 tentativas de 2 s).
    2. Faz `PUT http://connect:8083/connectors/stubb-outbox/config` com o JSON abaixo, montado por heredoc sem aspas no delimitador. As variáveis `DB_*` são expandidas e `\${routedByValue}` é escapado para chegar literal.
    3. Espera o `GET .../stubb-outbox/status` conter pelo menos duas ocorrências de `"state":"RUNNING"` (conector e task), com até 30 tentativas de 2 s. Se não chegar, sai com 1.

    ```json
    {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "tasks.max": "1",
      "database.hostname": "${DB_HOST}", "database.port": "${DB_PORT}",
      "database.user": "${DB_USER}", "database.password": "${DB_PASSWORD}", "database.dbname": "${DB_NAME}",
      "topic.prefix": "stubb",
      "plugin.name": "pgoutput",
      "slot.name": "stubb_outbox",
      "publication.name": "stubb_outbox",
      "publication.autocreate.mode": "filtered",
      "table.include.list": "public.outbox",
      "snapshot.mode": "no_data",
      "tombstones.on.delete": "false",
      "key.converter": "org.apache.kafka.connect.storage.StringConverter",
      "value.converter": "org.apache.kafka.connect.json.JsonConverter",
      "value.converter.schemas.enable": "false",
      "transforms": "outbox",
      "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
      "transforms.outbox.table.field.event.id": "id",
      "transforms.outbox.table.field.event.key": "aggregate_id",
      "transforms.outbox.table.field.event.payload": "payload",
      "transforms.outbox.route.by.field": "bounded_context",
      "transforms.outbox.route.topic.replacement": "${routedByValue}.events",
      "transforms.outbox.table.expand.json.payload": "true",
      "transforms.outbox.table.json.payload.null.behavior": "optional_bytes",
      "transforms.outbox.table.fields.additional.placement": "id:header:eventId,event_type:header:eventType"
    }
    ```
    `table.json.payload.null.behavior=optional_bytes` é necessário: o padrão (`ignore`) descartaria `correlationId: null` e `causationId: null` do envelope.
  - Teste: `bash -n infra/kafka/create-topics.sh` e `sh -n infra/debezium/register-connector.sh` terminam com 0. A execução real é coberta pela T-39.
- [ ] T-15 Nginx. (cobre CA-27, CA-32)
  - `infra/nginx/nginx.prod.conf` (conteúdo de `conf.d`, nível `http`):
    ```nginx
    upstream read_service { server read-service:3002; }
    upstream write_service { server write-service:3001; }
    map $request_method $api_upstream { GET read_service; HEAD read_service; default write_service; }
    server {
      listen 80;
      server_name _;
      location /api/ {
        proxy_pass http://$api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-Id $request_id;
        proxy_read_timeout 15s;
      }
      location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
      }
    }
    ```
  - `infra/nginx/nginx.dev.conf`:
    - mantém os mesmos `upstream`, `map` e `location /api/`;
    - acrescenta `map $http_upgrade $connection_upgrade { default upgrade; '' close; }`;
    - `location /` faz `proxy_pass http://web:5173;` com `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection $connection_upgrade` e `proxy_set_header Host $host`.
  - Teste (Git Bash; `MSYS_NO_PATHCONV=1` evita a conversão de caminho):
    ```bash
    MSYS_NO_PATHCONV=1 docker run --rm --add-host read-service:127.0.0.1 --add-host write-service:127.0.0.1 --add-host web:127.0.0.1 \
      -v "$(pwd -W)/infra/nginx/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.30.6-alpine nginx -t
    ```
    Repetir com `nginx.dev.conf`. As duas saídas devem conter `test is successful`.
- [ ] T-16 `infra/compose.dev.yaml`. (cobre CA-32)
  - **`write-service`, `read-service`, `projector`:**
    - `build: { target: dev }`;
    - `command: ["pnpm", "--filter", "@stubb/<app>", "start:dev"]`;
    - healthcheck igual ao da base, com `start_period: 60s`;
    - `develop.watch`:
      - `sync` de `../apps/<app>/src` para `/usr/src/app/apps/<app>/src`;
      - `rebuild` em `../libs/contracts/src`, `../apps/<app>/package.json` e `../pnpm-lock.yaml`.
  - **`web`:**
    - `build: { context: .., dockerfile: Dockerfile, target: dev }`;
    - `command: ["pnpm", "--filter", "@stubb/web", "dev"]`;
    - healthcheck por `fetch('http://127.0.0.1:5173/')`;
    - `develop.watch`:
      - `sync` de `../apps/web/src` para `/usr/src/app/apps/web/src`;
      - `rebuild` em `../apps/web/package.json`, `../apps/web/index.html`, `../libs/contracts/src` e `../pnpm-lock.yaml`.
  - **`gateway`:** `build: { target: gateway-dev }` e `depends_on` acrescido de `web: { condition: service_healthy }`.
  - **`kafbat`:**
    - `image: ghcr.io/kafbat/kafka-ui:v1.5.0`, `ports: ["8081:8080"]`;
    - `KAFKA_CLUSTERS_0_NAME=stubb`, `KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS=kafka:9092`;
    - `KAFKA_CLUSTERS_0_KAFKACONNECT_0_NAME=debezium`, `KAFKA_CLUSTERS_0_KAFKACONNECT_0_ADDRESS=http://connect:8083`;
    - `depends_on`: `kafka` e `connect` saudáveis.
  - **`db-migrate`:** fica com o target de produção.
  - Teste: `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml config --quiet` termina com 0.
- [ ] T-46 Script `infra/scripts/docker-up.ps1` para manter o engine do WSL2 no ar (OQ-45). (cobre CA-6)
  - Contexto: o WSL desliga a distro quando nenhum processo do Windows está ligado a ela, e o `dockerd` desliga junto. A solução é manter oculto um `wsl.exe -d Ubuntu --exec sleep infinity`. O usuário escolheu um script manual, não uma tarefa de logon.
  - Restrições do script:
    - compatível com Windows PowerShell 5.1 (sem `&&`, `||`, operador ternário nem `??`);
    - mensagens só em ASCII, porque o PS 5.1 lê `.ps1` sem BOM como ANSI;
    - LF, conforme o `.gitattributes`.
  - Parâmetro `param([string]$Distro = 'Ubuntu', [int]$TimeoutSeconds = 60)`.
  - Passos:
    1. **Detectar o keepalive.** `Get-CimInstance Win32_Process -Filter "Name='wsl.exe'"` e procurar um processo cuja `CommandLine` contenha `sleep infinity` e `-d $Distro`. Se existir, imprimir `docker-up: keepalive ja ativo (PID <pid>)` e não iniciar outro. A detecção é pelo processo e não pelo `wsl -l -v`: o estado `Running` não garante que haja keepalive, porque a distro pode estar no ar por outro processo passageiro.
    2. **Iniciar o keepalive** se não existir: `Start-Process -FilePath 'wsl.exe' -ArgumentList '-d', $Distro, '--exec', 'sleep', 'infinity' -WindowStyle Hidden -PassThru`. Imprimir `docker-up: keepalive iniciado (PID <pid>)`.
    3. **Esperar o engine.** Repetir `docker --context wsl-engine info *> $null` a cada 2 s até `$LASTEXITCODE -eq 0` ou até `$TimeoutSeconds`.
    4. **Resultado:**
       - sucesso: `docker-up: OK - engine respondendo no contexto wsl-engine` e `exit 0`;
       - timeout: `docker-up: FALHA - engine nao respondeu em <n> s (contexto wsl-engine, distro <Distro>)` e `exit 1`.
  - Uso: `powershell -NoProfile -ExecutionPolicy Bypass -File infra/scripts/docker-up.ps1`.
  - Teste (manual, registrado no Board):
    1. `wsl --terminate Ubuntu`. Isso encerra também um keepalive anterior; conferir com o passo 1 do script que não sobrou nenhum.
    2. Rodar o script: termina com 0 e imprime `OK`.
    3. `docker --context wsl-engine info` termina com 0.
    4. Rodar o script de novo: imprime `keepalive ja ativo`.
    5. `Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -like '*sleep infinity*' }` devolve exatamente um processo.
- [ ] T-17 Verificar `curl` na imagem do Connect e fechar a trilha. (cobre CA-6)
  1. Rodar `docker run --rm --entrypoint sh quay.io/debezium/connect:3.7.0.Final -c 'command -v curl'`.
  2. Se não houver `curl`, trocar o healthcheck do `connect` por `["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/127.0.0.1/8083'"]` e registrar no Board.
  3. Conferir que o target `dev` tem `ps`: `docker build --target dev -t stubb-check-dev .` e `docker run --rm stubb-check-dev ps --version`; depois `docker image rm stubb-check-dev`. Sem o `procps`, o `nest start --watch` não consegue matar o processo anterior (tree-kill usa `ps`), e todo rebuild falha com `EADDRINUSE`.
  - Teste: T-12 a T-16 e T-46 verdes, e o item 3 imprime a versão do `ps`. Registrar "I concluída" no Board.

### E5 — write-service (trilha W)

Container de integração: `docker run -d --rm --name stubb-it-postgres-write -e POSTGRES_USER=stubb -e POSTGRES_PASSWORD=stubb -e POSTGRES_DB=stubb -p 55432:5432 postgres:18.6-trixie`. Os testes de integração usam `DATABASE_URL=postgres://stubb:stubb@localhost:55432/stubb`. Ao terminar a trilha: `docker stop stubb-it-postgres-write`.

- [ ] T-18 Base do app. (cobre CA-7)
  - **`src/config.ts`:** schema Zod de `process.env` com os defaults de host (`PORT` 3001, `DATABASE_URL` em localhost:5433), exportando `config`.
  - **`src/main.ts`:** `setGlobalPrefix('api', { exclude: ['health'] })`, `enableShutdownHooks()`, `listen(config.PORT, '0.0.0.0')`.
  - **`src/app.module.ts`:**
    - `CqrsModule.forRoot()`, `ScheduleModule.forRoot()`;
    - `TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(config.DATABASE_URL) })`;
    - `DiagnosticsModule`, `HealthController`.
  - **Entities** (`@PrimaryColumn({ type: 'uuid' })` e nomes de coluna snake_case da tabela de interfaces):
    - `src/diagnostics/infrastructure/ping.entity.ts`;
    - `src/shared/outbox/outbox.entity.ts`, com `aggregate_version bigint` e transformer `{ to: (v: number) => v, from: (v: string) => Number(v) }`;
    - `src/shared/idempotency/idempotency-key.entity.ts`, com PK composta `(key, scope)`, `@Index('idx_idempotency_keys_created_at', ['createdAt'])` e `created_at` com `default: () => 'now()'`.
  - **`src/database/data-source.ts`:**
    - `buildDataSourceOptions(url)` devolve `{ type: 'postgres', url, entities: [PingEntity, OutboxEntity, IdempotencyKeyEntity], migrations, synchronize: false, migrationsRun: false }`;
    - `migrations` vem de `src/database/migrations/index.ts`; sem globs, para funcionar igual no Vitest e no `dist`;
    - `export default new DataSource(buildDataSourceOptions(config.DATABASE_URL))`, o único export de `DataSource` do arquivo, como exige a CLI do TypeORM.
  - **`src/database/migrations/index.ts`** começa com `export const migrations = [];`.
  - Teste: `pnpm --filter @stubb/write-service build` termina com 0.
- [ ] T-19 Migration inicial e runner. (cobre CA-6, CA-7)
  1. Com o container de integração no ar, rodar `pnpm --filter @stubb/write-service build`.
  2. Rodar `DATABASE_URL=postgres://stubb:stubb@localhost:55432/stubb pnpm --filter @stubb/write-service migration:generate src/database/migrations/InitialSchema`, com `apps/write-service` como diretório de trabalho do pnpm.
  3. Revisar o SQL gerado: as três tabelas, a PK composta e o índice, conforme a tabela de interfaces.
  4. Rodar `prettier --write` no arquivo gerado.
  5. Acrescentar a classe gerada a `migrations/index.ts`.
  6. Criar `src/database/migrate.ts`: inicializa o DataSource padrão, `runMigrations({ transaction: 'each' })`, loga as migrations aplicadas, `destroy()` e `process.exit(0)`; em erro, loga e sai com 1.
  - Teste: `DATABASE_URL=...55432... node apps/write-service/dist/database/migrate.js` aplica a migration, e rodar de novo não aplica nada; `docker exec stubb-it-postgres-write psql -U stubb -c '\d outbox'` mostra as colunas da interface.
- [ ] T-20 Domínio. (cobre CA-7, CA-9)
  - `src/diagnostics/domain/ping.events.ts`, com classes que implementam `IEvent`:
    - `PingCreatedEvent(pingId, label, aggregateVersion, occurredAt: Date)`;
    - `PingIncrementedEvent(pingId, count, aggregateVersion, occurredAt: Date)`.
  - `src/diagnostics/domain/ping.aggregate.ts`, `Ping extends AggregateRoot`:
    - estado: `id`, `label`, `count`, `version`, `createdAt`, `updatedAt`;
    - `static create(id, label, now)`: `count` 0, `version` 1, `apply(new PingCreatedEvent(...))`;
    - `static rehydrate(state)`: sem eventos;
    - `increment(now)`: `count + 1`, `version + 1`, `apply(new PingIncrementedEvent(...))`;
    - não usa `commit()` nem `EventPublisher` (OQ-27).
  - Teste: `src/diagnostics/domain/ping.aggregate.spec.ts`:
    - `create` gera versão 1, `count` 0 e um evento com `aggregateVersion` 1;
    - `rehydrate` seguido de `increment` duas vezes gera versão 3, `count` 2 e eventos com versões 2 e 3 e `count` 1 e 2;
    - `uncommit()` limpa os eventos.
- [ ] T-21 Transação, outbox e repositório. (cobre CA-7, CA-8, CA-9, CA-10)
  - **`src/shared/transaction/transaction-context.ts`** (`@Injectable`, injeta `DataSource`):
    - usa `AsyncLocalStorage<EntityManager>`;
    - `run<T>(fn)` = `dataSource.transaction(m => storage.run(m, fn))`;
    - `manager()` lança `Error('No active transaction')` fora de `run`.
  - **`src/shared/outbox/outbox-writer.ts`:**
    - `append(events)` monta para cada evento de domínio o envelope da RN-4:
      - `eventId: v7()` (de `uuid`);
      - `eventType` e `aggregateType` pelas constantes do contrato;
      - `schemaVersion: 1`;
      - `occurredAt: event.occurredAt.toISOString()`;
      - `correlationId: null`, `causationId: null`;
      - `payload` (`{ label }` ou `{ count }`);
    - valida com `PingCreatedV1Schema` ou `PingIncrementedV1Schema` (`parse`);
    - insere em `outbox` com `manager()`, `bounded_context = BOUNDED_CONTEXT_DIAGNOSTICS`, `aggregate_id`, `aggregate_version`, `event_type`, `schema_version`, `occurred_at` e `payload` = envelope.
  - **`src/diagnostics/infrastructure/ping.repository.ts`** (Data Mapper):
    - `findById(id)`: `manager().findOne(PingEntity, { where: { id } })` → `Ping.rehydrate` ou `null`;
    - `insert(ping)`: `manager().insert(PingEntity, ...)`, depois `outbox.append(ping.getUncommittedEvents())` e `ping.uncommit()`;
    - `update(ping, expectedVersion)`: `manager().createQueryBuilder().update(PingEntity).set({ count, version, updatedAt }).where('id = :id AND version = :expected', { id, expected: expectedVersion }).execute()`;
      - se `result.affected !== 1`, lança `ConcurrencyConflictError`;
      - senão, `append` e `uncommit`.
  - **`src/shared/errors.ts`:** `ConcurrencyConflictError`, `AggregateNotFoundError` e `IdempotencyKeyMismatchError`.
  - Teste: coberto pela T-26 (integração).
- [ ] T-22 Commands, controller e HTTP. (cobre CA-7, CA-9, CA-11, CA-12)
  - **Commands** (`extends Command<CommandAccepted>`, de `@nestjs/cqrs`):
    - `src/diagnostics/application/create-ping.command.ts` (`label`);
    - `increment-ping.command.ts` (`id`).
  - **Handlers:**
    - `CreatePingHandler`: `id = v7()`, `Ping.create(id, label, new Date())`, `repository.insert`, retorna `{ id, version: 1 }`;
    - `IncrementPingHandler`: `findById` (`null` → `AggregateNotFoundError`), `expected = ping.version`, `ping.increment(new Date())`, `repository.update(ping, expected)`, retorna `{ id, version: ping.version }`.
  - **`src/shared/http/zod-validation.pipe.ts`:** `safeParse`; em falha, `BadRequestException({ message: 'Validation failed', issues })`.
  - **`src/shared/http/domain-error.filter.ts`:** `ConcurrencyConflictError` → 409, `AggregateNotFoundError` → 404 (`'Ping not found'`), `IdempotencyKeyMismatchError` → 422, no formato padrão do Nest.
  - **`src/diagnostics/http/pings.controller.ts`** (`@Controller('diagnostics/pings')`):
    - `@Post()` e `@Post(':id/increment')`, ambos com `@HttpCode(202)`;
    - corpo validado com `CreatePingRequestSchema` / `IncrementPingRequestSchema` (corpo ausente vira `{}`);
    - `:id` validado com `uuidSchema`;
    - chave lida pelo decorator da T-23;
    - chama `idempotency.execute({ key, scope: DIAGNOSTICS_ROUTE_TEMPLATES.<rota>, requestHash: hashRequest('POST', req.path, body) }, () => commandBus.execute(command))`;
    - devolve o `body` do resultado.
  - **`src/diagnostics/diagnostics.module.ts`:** registra handlers, repository, writer, controller e filter.
  - Teste: `src/shared/http/zod-validation.pipe.spec.ts` (aceita, rejeita e formata `issues`); `src/shared/http/domain-error.filter.spec.ts` (mapeia os três erros); o comportamento HTTP completo está na T-26.
- [ ] T-23 Idempotência. (cobre CA-13, CA-14, CA-15, CA-16, CA-17)
  - **`src/shared/idempotency/idempotency-key.decorator.ts`:** `createParamDecorator` que lê o header `idempotency-key`. Ausente ou fora de `idempotencyKeySchema` → `BadRequestException('Idempotency-Key header is required and must be a UUID')`.
  - **`src/shared/idempotency/request-hash.ts`:** `hashRequest(method, path, body)` = SHA-256 hex (`node:crypto`) de `JSON.stringify({ method, path, body })`. O `body` é a saída do Zod e o `path` é `req.path` (sem query string).
  - **`src/shared/idempotency/idempotency.service.ts`:** `execute<T>({ key, scope, requestHash }, operation: () => Promise<T>): Promise<T>`, com tudo dentro de `transactionContext.run`:
    1. Tenta reservar a chave:
       ```sql
       INSERT INTO idempotency_keys (key, scope, request_hash, created_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (key, scope) DO UPDATE
         SET request_hash = EXCLUDED.request_hash, response_status = NULL, response_body = NULL, created_at = now()
         WHERE idempotency_keys.created_at < now() - interval '24 hours'
       RETURNING key
       ```
       Usar `manager().queryRunner.query(sql, params, true)` (resultado estruturado) e ler `.records`. No TypeORM 1.1.2, `EntityManager.query` não aceita o terceiro argumento. Uma requisição concorrente com a mesma chave bloqueia nesse INSERT até a primeira transação terminar.
    2. Sem linha retornada (a chave existe e vale): `SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1 AND scope = $2`. Hash diferente → `IdempotencyKeyMismatchError`; igual → retorna `response_body` sem executar `operation`.
    3. Com linha retornada: `result = await operation()`, depois `UPDATE idempotency_keys SET response_status = 202, response_body = $3 WHERE key = $1 AND scope = $2` e retorna `result`.

    Uma falha em `operation` desfaz tudo, inclusive a reserva da chave (RN-13).
  - Teste: `src/shared/idempotency/request-hash.spec.ts` (mesmo input dá o mesmo hash; path ou corpo diferente dá outro hash); `idempotency-key.decorator.spec.ts` (ausente, inválido, válido). Concorrência e expiração na T-26.
- [ ] T-24 Job de limpeza. (cobre CA-18)
  - `src/shared/idempotency/idempotency-cleanup.job.ts`:
    - `@Cron(CronExpression.EVERY_HOUR, { name: 'idempotency-cleanup' })`;
    - `deleteExpired()` executa, fora de transação de command, `DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'` pelo `DataSource` e loga a quantidade apagada.
  - Teste: na T-26.
- [ ] T-25 Fronteira do write-service. (cobre CA-4)
  - Teste: `test/unit/architecture.spec.ts` lê `apps/write-service/package.json` (via `import.meta.dirname`) e verifica que `dependencies` e `devDependencies` não contêm `mongodb` nem `mongoose`.
- [ ] T-26 Testes de integração contra `stubb-it-postgres-write`. (cobre CA-7, CA-8, CA-9, CA-10, CA-11, CA-12, CA-13, CA-14, CA-15, CA-16, CA-17, CA-18)
  - **Setup:**
    - `test/integration/setup.ts` sobe um `TestingModule` com `AppModule`, com `DATABASE_URL` apontando para 55432;
    - roda `dataSource.runMigrations()` uma vez;
    - antes de cada teste, `TRUNCATE diagnostics_pings, outbox, idempotency_keys`;
    - HTTP via `supertest` sobre `app.getHttpServer()`, com o mesmo `setGlobalPrefix` do `main.ts`.
  - **Arquivos:**
    - `test/integration/create-ping.int.test.ts`: CA-7 (202, uuid v7, `label` sem espaços, uma linha na outbox com envelope válido pelo contrato), CA-12 (400 sem gravar) e CA-13 (sem header e header inválido → 400 sem gravar).
    - `test/integration/increment-ping.int.test.ts`: CA-9 (versão n+1 e `payload.count`) e CA-11 (404).
    - `test/integration/concurrency.int.test.ts`: CA-10. Carregar o mesmo ping duas vezes pelo repository dentro de dois `transactionContext.run`, incrementar os dois e gravar em sequência: o segundo lança `ConcurrencyConflictError`, o ping fica com a versão do primeiro e a outbox tem um só `PingIncremented`. Pelo HTTP, simular com `Promise.all` de dois incrementos: um `202` e um `202` ou `409`. Se der `409`, nada é gravado pela perdedora.
    - `test/integration/atomicity.int.test.ts`: CA-8. Sobrescrever o provider `OutboxWriter` com um stub que lança erro; `POST` create → `500`; as três tabelas ficam vazias.
    - `test/integration/idempotency.int.test.ts`:
      - CA-14: mesmo request duas vezes dá corpos iguais e uma linha só em `diagnostics_pings` e em `outbox`;
      - CA-15: outro label com a mesma chave → 422; increment com a mesma chave para outro ping → 422;
      - CA-16: `Promise.all` de dois `idempotencyService.execute` com a mesma chave e `operation` que cria um ping e espera 300 ms → `operation` chamada uma vez e resultados iguais;
      - CA-17: depois de um create, `UPDATE idempotency_keys SET created_at = now() - interval '25 hours'`; o reenvio cria um segundo ping.
    - `test/integration/cleanup.int.test.ts`: CA-18. Inserir chaves com `created_at` de 25 h e de 1 h e chamar `deleteExpired()`: só a de 25 h some. `app.get(SchedulerRegistry).getCronJob('idempotency-cleanup').cronTime.source` é igual a `CronExpression.EVERY_HOUR`.
  - Teste: `pnpm --filter @stubb/write-service test:integration` termina com 0.

  Fechamento da trilha: `pnpm --filter @stubb/write-service lint`, `typecheck` e `test` terminam com 0. Registrar "W concluída" no Board.

### E6 — projector (trilha P)

Container de integração:
```bash
docker run -d --rm --name stubb-it-mongo-projector -p 58017:27017 mongo:8.0.34 --replSet rs0 --bind_ip_all
docker exec stubb-it-mongo-projector mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
```
Os testes leem a URL de `MONGO_TEST_URL`, com default `mongodb://localhost:58017/?directConnection=true`. Ao terminar: `docker stop stubb-it-mongo-projector`.

- [ ] T-27 Base do app e fronteira. (cobre CA-4)
  - `src/config.ts` (variáveis do projector, com os defaults de host).
  - `src/main.ts`: sem prefixo global, `enableShutdownHooks()`, `listen(config.PORT, '0.0.0.0')`.
  - `src/app.module.ts`: sem `@nestjs/cqrs` (OQ-27).
  - `src/mongo/mongo.module.ts`: providers `MONGO_CLIENT` (conecta em `onModuleInit`, fecha em `onModuleDestroy`) e `MONGO_DB` (`client.db(config.MONGO_DB)`).
  - Teste: `test/unit/architecture.spec.ts` verifica que o `package.json` não contém `pg`, `typeorm` nem `@nestjs/typeorm`.
- [ ] T-28 Consumo com commit manual. (cobre CA-22, CA-23)
  - **`src/kafka/event-consumer.ts`:** interface `EventConsumer`:
    - `connect()`, `subscribe(topics)`, `run(handler)`, `commit(message)`, `disconnect()`;
    - `ConsumedMessage = { topic, partition, offset: string, key: string | null, value: Buffer | null, headers: Record<string, string> }`.
  - **`src/kafka/confluent-event-consumer.ts`:**
    - forma de import conforme o Board (T-1):
      - com `namedImport=true`: `import { KafkaJS } from '@confluentinc/kafka-javascript'`;
      - senão: `import confluentKafka from '@confluentinc/kafka-javascript'` e `const { KafkaJS } = confluentKafka`;
    - `new KafkaJS.Kafka({ kafkaJS: { clientId, brokers } })`;
    - `consumer({ kafkaJS: { groupId, fromBeginning: true, autoCommit: false } })`;
    - `commit` = `commitOffsets([{ topic, partition, offset: (BigInt(offset) + 1n).toString() }])`;
    - headers convertidos de `Buffer` para string.

    Se o Board indicar a contingência, criar `kafkajs-event-consumer.ts` com a API equivalente da T-2 e registrá-lo no lugar.
  - **`src/kafka/kafka-consumer.service.ts`** (`OnApplicationBootstrap` / `OnModuleDestroy`):
    - no bootstrap: `connect`, `subscribe([DIAGNOSTICS_TOPIC])` e `run(m => this.handle(m))`;
    - `handle`:
      ```
      try {
        evento = DiagnosticsEventSchema.parse(JSON.parse(value))
        await dispatcher.dispatch(evento)
        await consumer.commit(m)
      } catch (err) {
        logger.error(eventId, offset, partição, erro)
        exit(1)
      }
      ```
    - `exit` é injetado pelo token `PROCESS_EXIT` (default `code => process.exit(code)`);
    - no destroy: `disconnect`.
  - **`src/projection/event-dispatcher.ts`:** mapa `Record<DiagnosticsEvent['eventType'], (e) => Promise<void>>` apontando para a `PingProjection`.
  - Teste: `src/kafka/kafka-consumer.service.spec.ts` com `EventConsumer` falso e dispatcher falso:
    - (1) mensagem válida: `dispatch` resolve antes de `commit`, que é chamado com a mensagem;
    - (2) `dispatch` rejeita: sem `commit`, `exit(1)`;
    - (3) JSON inválido e (4) envelope que falha no schema: sem `dispatch`, sem `commit`, `exit(1)`;
    - (5) `commit` rejeita: `exit(1)`.
- [ ] T-29 Regra de sequência (OQ-43). (cobre CA-24)
  - `src/projection/sequence.ts`: função pura `decideProjection(eventType, aggregateVersion, currentVersion: number | null): 'apply' | 'already-applied' | 'gap'`, com `current = currentVersion ?? 0`:
    1. `aggregateVersion <= current` → `'already-applied'`;
    2. `eventType === 'PingIncremented' && currentVersion === null` → `'gap'`;
    3. `aggregateVersion > current + 1` → `'gap'`;
    4. senão → `'apply'`.

    `PingCreated` sempre chega com `aggregateVersion` 1 (garantido pelo contrato, T-10), então um `PingCreated` repetido para um documento existente cai na regra 1.
  - `src/projection/projection-gap.error.ts`: `ProjectionGapError(eventId, aggregateId, aggregateVersion, currentVersion)`, com mensagem que inclua os quatro valores, para o log.
  - Teste: `src/projection/sequence.spec.ts`:
    - (`PingCreated`, 1, `null`) → `apply`;
    - (`PingCreated`, 1, 1) → `already-applied`;
    - (`PingCreated`, 1, 3) → `already-applied`;
    - (`PingIncremented`, 2, 1) → `apply`;
    - (`PingIncremented`, 2, 2) → `already-applied`;
    - (`PingIncremented`, 1, 2) → `already-applied`;
    - (`PingIncremented`, 4, 2) → `gap`;
    - (`PingIncremented`, 2, `null`) → `gap`.
- [ ] T-30 Projeção `pings` com dedupe. (cobre CA-21, CA-22, CA-24)
  - `src/projection/ping.projection.ts` (injeta `MONGO_CLIENT` e `MONGO_DB`): para cada evento, uma sessão com `session.withTransaction(async () => { ... })` contendo, em ordem:
    1. `processed_events.findOne({ _id: eventId }, { session })`. Se existir, retorna sem alterar nada (o consumer commita normalmente).
    2. `processed_events.insertOne({ _id: eventId, consumer: 'projector', eventType, aggregateId, aggregateVersion, processedAt: new Date() }, { session })`.
    3. `doc = pings.findOne({ _id: aggregateId }, { session })` e `decideProjection(eventType, aggregateVersion, doc?.version ?? null)`.
    4. Conforme a decisão:
       - `'already-applied'`: loga em nível `warn` (`eventId`, `aggregateVersion`, versão atual) e retorna. A transação confirma só o `processed_events` e o consumer commita o offset.
       - `'gap'`: lança `ProjectionGapError`. A transação é abortada, o `processed_events` do passo 2 não é gravado, e a T-28 loga, não commita e encerra.
       - `'apply'` com `PingCreated`: `pings.insertOne({ _id: aggregateId, label: payload.label, count: 0, version: 1, createdAt: new Date(occurredAt), updatedAt: new Date(occurredAt) }, { session })`.
       - `'apply'` com `PingIncremented`: `pings.updateOne({ _id: aggregateId, version: aggregateVersion - 1 }, { $set: { count: payload.count, version: aggregateVersion, updatedAt: new Date(occurredAt) } }, { session })`. Se `matchedCount !== 1`, lança `ProjectionGapError` (o documento mudou no meio da transação, o que não deveria acontecer com um consumer por partição).
    5. `session.endSession()` no `finally`.

    Erros não tratados sobem e caem na T-28 (falha).
  - Teste: `test/integration/ping-projection.int.test.ts` contra 58017, limpando as coleções antes de cada teste:
    - CA-21: `PingCreated` v1 seguido de `PingIncremented` v2 gera o documento com `count` 1, `version` 2, `createdAt` e `updatedAt` iguais aos `occurredAt`, e dois `processed_events`;
    - CA-22: aplicar o mesmo `PingCreated` (mesmo `eventId`) duas vezes deixa o documento inalterado e um único `processed_events`;
    - CA-24 (a): com o documento na versão 2, um `PingIncremented` de `eventId` novo e `aggregateVersion` 2 resolve sem erro, o documento continua igual e o `eventId` aparece em `processed_events`;
    - CA-24 (b): com o documento na versão 2, um `PingIncremented` com `aggregateVersion` 4 rejeita com `ProjectionGapError`, o documento não muda e o `eventId` não aparece em `processed_events` (prova o rollback);
    - CA-24 (c): um `PingIncremented` para um `aggregateId` sem documento rejeita com `ProjectionGapError`, e nada é gravado em `pings` nem em `processed_events`.

    A parte "não commita e encerra" do CA-24 já é coberta pelo caso (2) do teste da T-28.
  - Fechamento da trilha: `pnpm --filter @stubb/projector lint`, `typecheck`, `test` e `test:integration` terminam com 0. Registrar "P concluída" no Board.

### E7 — read-service (trilha R)

Container de integração: `docker run -d --rm --name stubb-it-mongo-read -p 58018:27017 mongo:8.0.34`. Os testes leem a URL de `MONGO_TEST_URL`, com default `mongodb://localhost:58018/?directConnection=true`. Ao terminar: `docker stop stubb-it-mongo-read`.

- [ ] T-31 Base do app e fronteira. (cobre CA-4)
  - `src/config.ts`.
  - `src/main.ts`: `setGlobalPrefix('api', { exclude: ['health'] })`.
  - `src/app.module.ts`: `CqrsModule.forRoot()`.
  - `src/mongo/mongo.module.ts`: igual ao do projector, mas implementado na própria trilha.
  - Teste: `test/unit/architecture.spec.ts` verifica que o `package.json` não contém `pg`, `typeorm` nem `@nestjs/typeorm`.
- [ ] T-32 Query `GetPing`. (cobre CA-25, CA-26)
  - **`src/diagnostics/get-ping.query.ts`:** `GetPingQuery extends Query<GetPingResult>`, com `id` e `minVersion?: number`. `GetPingResult = { found: true; ping: PingView; minVersionReached: boolean } | { found: false }`.
  - **`src/diagnostics/ping-read.repository.ts`:** `findById(id)` em `pings`. Mapeia o documento para `PingView` (datas com `toISOString()`, `_id` → `id`).
  - **`src/diagnostics/get-ping.handler.ts`:**
    - sem `minVersion`: uma leitura (`minVersionReached: true` quando encontra);
    - com `minVersion`: lê a cada 100 ms até `doc.version >= minVersion` ou até 3000 ms;
    - devolve `found` e `minVersionReached` conforme a RN-9;
    - só lê, nunca grava.
  - **`src/diagnostics/pings.controller.ts`:**
    - `@Get(':id')`, com `:id` validado por `uuidSchema` e `min_version` por `minVersionSchema.optional()` (pipe Zod próprio da trilha, mesmo formato de 400 do write-service);
    - `found` → 200 com `{ ping, minVersionReached }`;
    - não encontrado → `NotFoundException({ statusCode: 404, message: 'Ping not found', minVersionReached: false })`.
  - Teste: `src/diagnostics/get-ping.handler.spec.ts` com repository falso:
    - documento na versão 1 e `minVersion` 1 → resolve na primeira leitura;
    - documento que passa para a versão 2 na terceira leitura com `minVersion` 2 → `reached true`;
    - `vi.useFakeTimers` para o timeout de 3 s → `reached false`.

    `src/diagnostics/pings.controller.spec.ts` com `QueryBus` falso: `:id` inválido → 400; `min_version=0` → 400; ausente → `minVersion` `undefined`.
- [ ] T-33 Integração com o MongoDB. (cobre CA-25, CA-26)
  - Teste: `test/integration/get-ping.int.test.ts` contra 58018 (Nest app + `supertest`):
    - documento v1 e `min_version=1` → 200 com `reached true` em menos de 500 ms;
    - `min_version=2` → 200, `reached false` e `version` 1, entre 2,9 s e 4 s;
    - documento atualizado para v2 500 ms depois do início da requisição → 200 com `reached true`;
    - id ausente com `min_version=1` → 404 com `minVersionReached: false`;
    - id inválido → 400.
  - Fechamento da trilha: `pnpm --filter @stubb/read-service lint`, `typecheck`, `test` e `test:integration` terminam com 0. Registrar "R concluída" no Board.

### E8 — web (trilha U)

Textos da interface em PT-BR. Sem chamadas reais à API nos testes: `fetch` é mockado.

- [ ] T-34 Infra de dados e rotas. (cobre CA-28)
  - **`src/api/diagnostics.ts`:**
    - classe `ApiError(status, body)`;
    - `createPing({ label, idempotencyKey })` e `incrementPing({ id, idempotencyKey })`: `fetch` com `POST`, `Content-Type: application/json` e o header `IDEMPOTENCY_KEY_HEADER`; status diferente de 202 → `ApiError`; sucesso → `CommandAcceptedSchema.parse`;
    - `getPing({ id, minVersion })`: `GET diagnosticsRoutes.getPing(id)` com `?min_version=` quando houver;
      - 200 → `{ status: 'found', ...GetPingResponseSchema.parse(json) }`;
      - 404 → `{ status: 'not-found' }`;
      - outro → `ApiError`.
  - `src/app/query-client.ts`: `new QueryClient()`.
  - `src/app/router.tsx`: `createBrowserRouter([{ path: '/', element: <DiagnosticsPage /> }])` de `react-router`.
  - `src/main.tsx`: `QueryClientProvider` + `RouterProvider` de `react-router/dom`, e `import './index.css'`.
  - Teste: `src/api/diagnostics.test.ts` com `fetch` mockado:
    - headers e corpo corretos no create;
    - 202 → objeto parseado;
    - 409 → `ApiError` com status;
    - `getPing` com e sem `min_version` na URL;
    - 404 → `not-found`.
- [ ] T-35 Store Zustand. (cobre CA-29)
  - `src/stores/diagnostics-store.ts`: `useDiagnosticsStore` com:
    - `selectedPingId: string | null`;
    - `latencyHistory: LatencyEntry[]`, onde `LatencyEntry = { pingId, action: 'create' | 'increment', version, latencyMs, measuredAt: string }`;
    - `selectPing(id)`;
    - `recordLatency(entry)`, que insere no início.

    Nada mais.
  - Teste: `src/stores/diagnostics-store.test.ts`:
    - as chaves de `getState()` são exatamente `selectedPingId`, `latencyHistory`, `selectPing` e `recordLatency`;
    - as ações alteram o estado esperado.
- [ ] T-36 Formulário e mutations. (cobre CA-12, CA-30)
  - **`src/features/diagnostics/use-create-ping.ts`** e **`use-increment-ping.ts`:** `useMutation` com:
    - `mutationFn` da T-34;
    - `retry: (failureCount, error) => failureCount < 2 && (error instanceof TypeError || (error instanceof ApiError && error.status >= 500))`;
    - `retryDelay: 500`.

    A chave vai nas variáveis da mutation, então todo retry reusa a mesma.
  - **`src/features/diagnostics/create-ping-form.tsx`:**
    - `useForm({ resolver: zodResolver(CreatePingRequestSchema) })`, input com `create-ping-label-input`, erro com `create-ping-label-error` e botão "Criar ping" (`create-ping-submit`);
    - no submit: `mutate({ label, idempotencyKey: crypto.randomUUID() })` e notifica a página com `onCreated(result, startedAt)`.
  - Teste: `src/features/diagnostics/create-ping-form.test.tsx`:
    - label `'   '` e 51 caracteres mostram o erro e não chamam `fetch`;
    - um label válido chama `fetch` uma vez com header UUID.

    `src/features/diagnostics/use-create-ping.test.tsx`:
    - primeiro `fetch` rejeita com `TypeError` e o segundo devolve 202: as duas chamadas têm o mesmo `Idempotency-Key`;
    - uma nova chamada de `mutate` gera chave diferente;
    - resposta 409 não repete.
- [ ] T-37 Página, painel, incremento e histórico. (cobre CA-28, CA-29)
  - **`src/pages/diagnostics-page.tsx`:**
    - estado local React `pending: { pingId, minVersion, action, startedAt } | null` (não vai para o Zustand);
    - `onCreated`: `selectPing(id)` e `setPending({ pingId: id, minVersion: version, action: 'create', startedAt })`.
  - **`src/features/diagnostics/use-ping.ts`:** `useQuery` com:
    - `queryKey: ['diagnostics', 'ping', id, minVersion ?? null]`;
    - `enabled: id !== null`;
    - `refetchInterval`: 250 enquanto o resultado for `not-found` ou `minVersionReached === false` com `minVersion` definido; senão `false`;
    - `retry: false`.
  - **`src/features/diagnostics/ping-panel.tsx`:**
    - mostra `ping-label`, `ping-count`, `ping-version` e `ping-sync-status` (`aguardando projeção` enquanto houver `pending` para o ping selecionado, senão `sincronizado`);
    - quando a query com `minVersion` volta com `minVersionReached: true`, chama `recordLatency({ pingId, action, version, latencyMs: performance.now() - startedAt, measuredAt: new Date().toISOString() })` e `setPending(null)`;
    - erros de command aparecem em `command-error`.
  - **`src/features/diagnostics/increment-button.tsx`:** botão "Incrementar" (`increment-ping`) que chama `mutate({ id, idempotencyKey: crypto.randomUUID() })` e, no sucesso, faz `setPending({ pingId: id, minVersion: version, action: 'increment', startedAt })`.
  - **`src/features/diagnostics/latency-history.tsx`:** lista `latency-history` com itens `latency-entry` (`data-ping-id`) mostrando ação, versão e latência em ms. Clicar no item chama `selectPing(pingId)`.
  - Componentes do shadcn: `Button`, `Input`, `Label`, `Card`.
  - Teste: `src/pages/diagnostics-page.test.tsx` com `fetch` mockado (create → 202 v1; get com `min_version=1` → `reached true`; increment → 202 v2; get com `min_version=2` → `reached true`):
    - a tela mostra `count` 0 / `version` 1 e depois 1 / 2, com `sincronizado`;
    - o histórico fica com 2 entradas;
    - clicar numa entrada mantém o ping selecionado;
    - o `fetch` com `min_version` é chamado só pela query, nunca a partir do Zustand.
- [ ] T-38 Fechamento da trilha. (cobre CA-12, CA-29, CA-30)
  - Teste: `pnpm --filter @stubb/web lint`, `typecheck`, `test` e `build` terminam com 0. Registrar "U concluída" no Board.

### E9 — Integração (trilha X)

- [ ] T-39 Stack completa. (cobre CA-6)
  1. Confirmar que não há containers da stack (`docker compose -f infra/compose.yaml ps`).
  2. Rodar `pnpm stack:up` (`docker compose -f infra/compose.yaml up -d --build --wait`).
  - Teste:
    - o comando termina com 0;
    - `docker compose -f infra/compose.yaml ps -a` mostra os apps e a infra `healthy` e os quatro one-shots `exited (0)`;
    - `curl -fsS http://localhost:8083/connectors/stubb-outbox/status` mostra conector e task `RUNNING`.
- [ ] T-40 E2E de API (`e2e/src/api/*.e2e.test.ts`). (cobre CA-6, CA-7, CA-9, CA-11, CA-12, CA-13, CA-14, CA-15, CA-16, CA-17, CA-19, CA-20, CA-25, CA-27)
  - **Suporte em `e2e/src/support/`:**
    - `env.ts`: defaults de host da seção de interfaces;
    - `http.ts`: `fetch` com `E2E_BASE_URL`;
    - `db.ts`: `pg.Client` em 5433;
    - `mongo.ts`: `MongoClient` com `directConnection=true`;
    - `kafka.ts`: consumer com o mesmo cliente do projector, `groupId` `e2e-<uuid>`, `fromBeginning: true`, `autoCommit: false` e `'broker.address.family': 'v4'`; coleta mensagens de `diagnostics.events` até um predicado ou 20 s. Sem forçar IPv4, `localhost` também resolve para `::1` e o librdkafka perde cerca de 11 s tentando IPv6;
    - `compose.ts`: `execFileSync('docker', ['compose', '-f', <caminho absoluto de infra/compose.yaml>, ...])`.

    Imports relativos com extensão `.ts`.
  - **`stack.e2e.test.ts` (CA-6):**
    - `pg_publication_tables` de `stubb_outbox` = só `public.outbox`;
    - `docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --describe --topic diagnostics.events` mostra `PartitionCount: 3` e `retention.ms=-1`;
    - `kafka-configs.sh --bootstrap-server kafka:9092 --entity-type brokers --entity-name 1 --describe --all` mostra `auto.create.topics.enable=false`.
  - **`commands.e2e.test.ts`:**
    - CA-7: `POST` via `http://localhost:8080` e conferência da linha em `diagnostics_pings` e na `outbox`;
    - CA-9;
    - CA-11;
    - CA-12: label inválido → 400;
    - CA-13.
  - **`idempotency.e2e.test.ts`:**
    - CA-14;
    - CA-15;
    - CA-16: `Promise.all` de dois `POST` idênticos com a mesma chave → corpos iguais e um só ping no banco;
    - CA-17: `UPDATE ... created_at = now() - interval '25 hours'` via `pg` e reenvio cria outro ping.
  - **`events.e2e.test.ts`:**
    - CA-19: mensagem com key = `id`, headers `eventId` e `eventType`, value válido por `PingCreatedV1Schema` e com `correlationId === null` e `causationId === null` no JSON bruto;
    - CA-20: create + 2 increments → três mensagens com a mesma partição e `aggregateVersion` 1, 2 e 3 em ordem de offset.
  - **`queries.e2e.test.ts`:**
    - CA-25: após o create, `GET ?min_version=1` → `reached true`; `?min_version=99` → `reached false` em cerca de 3 s;
    - CA-27: o `GET` devolve o corpo do read-service (`minVersionReached` presente), o `POST` devolve 202 e `GET /` devolve HTML contendo `<div id="root">`.
  - Teste: `pnpm --filter @stubb/e2e exec vitest run src/api` termina com 0.
- [ ] T-41 Replay. (cobre CA-31)
  - **`e2e/src/replay/replay.ts`:** `export async function replay()`:
    1. `compose stop projector`.
    2. `deleteMany({})` em `pings` e `processed_events`.
    3. `compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --group projector --reset-offsets --to-earliest --topic diagnostics.events --execute`, repetindo a cada 2 s por até 30 s enquanto o grupo ainda não estiver vazio.
    4. `compose up -d --wait projector`.
  - **`e2e/src/replay-cli.ts`:** `await replay()` e imprime `replay concluído`.
  - Teste: `e2e/src/replay/replay.e2e.test.ts`:
    1. Cria um ping e o incrementa duas vezes.
    2. Lê com `min_version=3` (snapshot).
    3. Chama `replay()`.
    4. Lê com `min_version=3`, repetindo enquanto vier `404` ou `reached false`, por até 30 s.
    5. Confere `toEqual(snapshot.ping)`.

    `pnpm replay` também termina com 0.
- [ ] T-42 Playwright (`apps/web/e2e/diagnostics.spec.ts`). (cobre CA-28)
  - Teste:
    1. `page.goto('/')` e preencher `create-ping-label-input` com `teste e2e`.
    2. Clicar em `create-ping-submit` e esperar `ping-count` = `0`, `ping-version` = `1` e `ping-sync-status` = `sincronizado`.
    3. Clicar em `increment-ping` e esperar `1` / `2` / `sincronizado`.
    4. Conferir que `latency-entry` tem 2 itens.
    5. Criar um segundo ping, clicar na primeira entrada referente ao primeiro ping e esperar `ping-label` = `teste e2e`.

    `pnpm --filter @stubb/web test:e2e` termina com 0.
- [ ] T-43 Roteiro do ambiente de dev. (cobre CA-32)
  1. Rodar `pnpm stack:down`.
  2. Rodar `pnpm stack:dev` (em um terminal separado).
  3. Esperar `http://localhost:8080` responder.
  4. Acrescentar um campo `version` à resposta de `/health` do write-service e conferir no log do container que o Nest recompilou e reiniciou o processo, sem rebuild de imagem. Depois desfazer a alteração.
  5. Alterar um texto em `apps/web/src/pages/diagnostics-page.tsx` e conferir que a página atualiza sem reload completo. Depois desfazer.
  6. Abrir `http://localhost:8081` e conferir o tópico `diagnostics.events` e o conector `stubb-outbox`.
  7. Rodar `pnpm stack:down`.
  - Teste: os itens conferidos registrados no Board.

### E10 — CI e documentação (trilha X)

- [ ] T-44 `.github/workflows/ci.yml`. (cobre CA-33)
  ```yaml
  name: ci
  on:
    push:
    pull_request:
  jobs:
    checks:
      runs-on: ubuntu-24.04
      steps:
        - uses: actions/checkout@v7.0.1
        - uses: pnpm/action-setup@v6.1.0
        - uses: actions/setup-node@v7.1.0
          with:
            node-version: 24.22.1
            cache: pnpm
        - run: pnpm install --frozen-lockfile
        - run: pnpm lint
        - run: pnpm typecheck
        - run: pnpm test
  ```
  O `pnpm/action-setup` lê a versão do `packageManager`.
  - Teste: os quatro comandos `run` passam localmente. A execução no GitHub acontece no primeiro push autorizado pelo usuário.
- [ ] T-45 Documentação. (cobre CA-34)
  - **ADR `docs/architecture/adr/0009-ferramental-e-pipeline-da-fase-1.md`**, no formato dos ADRs existentes (Status, Contexto, Decisão, Alternativas, Consequências). Registra:
    - pnpm workspaces;
    - Node 24, TypeScript 6 e ESM;
    - Vitest, ESLint e Prettier;
    - Dockerfile único multi-target e compose base + dev com Compose Watch;
    - cliente Kafka (resultado da E1);
    - TypeORM com Data Mapper e UPDATE condicional;
    - Zod em `libs/contracts`;
    - envelope de evento e schema da outbox;
    - dedupe com `processed_events`;
    - `min_version` com espera no servidor;
    - `Idempotency-Key` com 24 h de retenção.

    Cada item com o porquê ligado a CQRS e referência à OQ.
  - **`docs/architecture/overview.md:47`:** substituir a frase por "Ferramenta de monorepo: pnpm workspaces (ADR 0009)."
  - **`docs/architecture/adr/0008-frontend-react-vite.md:38` e `:40`:** trocar "é decidido na Fase 1" pelas decisões (Zod no backend: sim, em `libs/contracts`; versões fixadas no ADR 0009).
  - **`README.md`:** substituir a frase da linha 93 por uma seção "Como rodar" com:
    - pré-requisitos (Docker Engine no Ubuntu do WSL2 com o contexto `wsl-engine` no CLI do Windows, conforme a OQ-44; Node 24.22.1; pnpm via corepack);
    - antes de subir a stack, rodar `powershell -NoProfile -ExecutionPolicy Bypass -File infra/scripts/docker-up.ps1`, que mantém a distro e o engine no ar (OQ-45);
    - `pnpm install`;
    - `pnpm stack:up` e o endereço `http://localhost:8080`;
    - `pnpm stack:dev` e a Kafbat UI em `http://localhost:8081`;
    - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` e `pnpm replay`;
    - portas publicadas.

    Sem badges nem seções genéricas (napkin).
  - Teste: revisão dos quatro arquivos contra o CA-34.

## Verificação

Comandos finais (trilha X, com a stack de produção no ar), todos com saída 0:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm stack:up
pnpm test:e2e
pnpm replay
git ls-files --eol
```

Resultados esperados:
- `pnpm test` roda os testes unitários de `contracts`, dos três apps e do `web`.
- `pnpm test:e2e` roda os E2E de API, o replay e o Playwright.
- `git ls-files --eol` não mostra `i/crlf`.

Integração por trilha (containers isolados, rodada pelas trilhas W, P e R antes de fechar):

```
pnpm --filter @stubb/write-service test:integration   # PostgreSQL em 55432
pnpm --filter @stubb/projector test:integration       # MongoDB rs em 58017
pnpm --filter @stubb/read-service test:integration    # MongoDB em 58018
```

Rastreabilidade CA → tarefa:

| CA | Tarefas |
|---|---|
| CA-1 | T-1, T-2 |
| CA-2 | T-3, T-8 |
| CA-3 | T-4 a T-8 |
| CA-4 | T-5, T-25, T-27, T-31 |
| CA-5 | T-9, T-10, T-11 |
| CA-6 | T-12, T-13, T-14, T-17, T-19, T-39, T-40, T-46 |
| CA-7 | T-18 a T-22, T-26, T-40 |
| CA-8 | T-21, T-26 |
| CA-9 | T-20, T-21, T-22, T-26, T-40 |
| CA-10 | T-21, T-26 |
| CA-11 | T-22, T-26, T-40 |
| CA-12 | T-9, T-22, T-26, T-36, T-38, T-40 |
| CA-13 a CA-17 | T-23, T-26, T-40 |
| CA-18 | T-24, T-26 |
| CA-19 | T-14, T-40 |
| CA-20 | T-40 |
| CA-21 | T-30 |
| CA-22 | T-28, T-30 |
| CA-23 | T-28 |
| CA-24 | T-28, T-29, T-30 |
| CA-25 | T-32, T-33, T-40 |
| CA-26 | T-32, T-33 |
| CA-27 | T-15, T-40 |
| CA-28 | T-34, T-37, T-42 |
| CA-29 | T-35, T-37, T-38 |
| CA-30 | T-36, T-38 |
| CA-31 | T-41 |
| CA-32 | T-15, T-16, T-43 |
| CA-33 | T-44 |
| CA-34 | T-45 |

## Notas para o implementador

**Pré-requisitos do ambiente** (o thread principal confirma antes da onda 0):
- **Docker Engine no Ubuntu do WSL2** (OQ-44). O Docker Desktop nunca é iniciado. Antes de qualquer etapa com containers:
  - o engine da distro Ubuntu precisa estar rodando;
  - `docker --context wsl-engine info` precisa responder;
  - o docker CLI precisa estar usando o contexto `wsl-engine` (`docker context show` mostra `wsl-engine`; se não mostrar, `docker context use wsl-engine`).
- **Portas publicadas pelo engine no WSL2** chegam ao Windows por `localhost` via o localhost forwarding do WSL. A trilha X precisa confirmar isso no início da T-39: com a stack no ar, `curl -fsS http://localhost:8080/`, `curl -fsS http://localhost:8083/connectors` e uma conexão a `localhost:5433`, `localhost:27017` e `localhost:9094` a partir do Windows. Se alguma falhar, parar e registrar no Board, porque os E2E, o Playwright e o replay dependem disso. As trilhas W, P e R dependem do mesmo forwarding para 55432, 58017 e 58018 e também param se a conexão falhar.
- **WSL em modo de rede `mirrored`**, configurado em `%USERPROFILE%\.wslconfig` (seção `[wsl2]`, `networkingMode=mirrored`) e aplicado com `wsl --shutdown`. É obrigatório: em modo NAT, o CLI do Windows recebia stdout vazio de `docker run` e `docker exec`.
- **Bind mounts com o engine no WSL** (OQ-46): o symlink `/c -> /mnt/c` na distro é recriado pelo `infra/scripts/docker-up.ps1`, e `COMPOSE_CONVERT_WINDOWS_PATHS=1` precisa existir como variável de usuário do Windows.
- **Node 24.22.1 no host** (OQ-2). O host tinha 24.14.0, e `engineStrict` recusa a instalação com versão menor.
- **pnpm via corepack:** `corepack enable`. No Windows, com o Node em `C:\Program Files`, isso pode exigir PowerShell como administrador. Em seguida, `pnpm --version` dentro do repositório deve mostrar `12.15.0` (lido do `packageManager`).
- **PostgreSQL da stack publicado em 5433.** A 5432 do host é de um `postgres.exe` nativo, que não deve ser parado.
- **Portas livres:** 8080, 8081, 8083, 9094, 27017, 5433 (stack); 55432, 58017, 58018 (integração por trilha). As faixas 56946-57545 e 50000-50059 são excluídas pelo Windows (`netsh interface ipv4 show excludedportrange protocol=tcp`).

**Shell e caminhos:**
- O shell principal é PowerShell 5.1, sem `&&` (napkin). Os comandos deste Plan com `&&`, `$(...)` e heredoc são para Git Bash.
- `pnpm` roda scripts de `package.json` pelo shell do sistema; os scripts deste Plan usam só `&&`, que funciona no cmd.
- Ao montar arquivos do Windows em `docker run` pelo Git Bash, usar `MSYS_NO_PATHCONV=1` e `$(pwd -W)`, ou `cygpath -w`.

**Line endings:** `core.autocrlf=true` vem da configuração global do Git for Windows. Depois da T-3, todo arquivo novo deve estar em LF. Scripts `.sh` e configs montados em containers quebram com CRLF (`/bin/sh^M`).

**ESM:**
- Imports relativos em TypeScript terminam em `.js` nos apps Nest e em `libs/contracts`.
- No `e2e`, terminam em `.ts` (Node 24 executa TypeScript com type stripping; só sintaxe apagável).
- `__dirname` não existe: usar `import.meta.dirname`.

**TypeScript 6:**
- Não usar `baseUrl`, que é descontinuado; `paths` funciona sem ele.
- Não usar TypeScript 7: o typescript-eslint 8.72 exige `<6.1.0`.

**NestJS + Vitest:** os decorators precisam de metadata. Por isso os configs usam `unplugin-swc`, que lê `experimentalDecorators` e `emitDecoratorMetadata` do `tsconfig.json`. Sem ele, a injeção de dependência falha nos testes.

**TypeORM:**
- `synchronize: false` sempre.
- A CLI roda sobre o JavaScript compilado (`dist/database/data-source.js`) para não depender de `ts-node`.
- A `outbox` é só INSERT. O Debezium registra aviso em UPDATE e ignora DELETE. Não atualizar linhas da outbox.

**Debezium:**
- O conector precisa existir antes da primeira escrita: o slot é criado no registro, e com `snapshot.mode=no_data` nada anterior é lido. Por isso o `write-service` depende do `connect-init`.
- Se a stack for recriada sem apagar volumes, o `PUT .../config` é idempotente.

**Kafka:**
- Offset commitado = offset da mensagem + 1.
- Com `autoCommit: false`, `disconnect` não commita.
- O reset do grupo no replay só funciona com o grupo vazio, o que depende do `enableShutdownHooks()` do projector chamar `disconnect` no SIGTERM.

**MongoDB:** do host, conectar sempre com `directConnection=true`. O membro do replica set se anuncia como `mongo:27017`, que não resolve fora da rede do compose.

**`pnpm deploy`:** os `"files": ["dist"]` dos manifests são obrigatórios. Sem eles o `.gitignore` excluiria `dist/` da pasta de deploy. Desde o pnpm 11.26, `pnpm deploy` não exige `injectWorkspacePackages`.

**Board:** registrar resultados e bloqueios em `SDD/WORK/2026-10-24-SkeletonBoard.md`, só na seção da própria trilha. A trilha P lê ali o resultado da E1.

**Docs consultadas:**
- NestJS: migration guide v12 (ESM), recipe SWC/Vitest, CQRS (AggregateRoot, `Command<T>`), Kafka (`commitOffsets`).
- TypeORM 1.1: CLI `migration:generate`/`run`, `runMigrations`.
- Debezium 3.6 reference: Outbox Event Router (`table.fields.additional.placement`, `table.expand.json.payload`, `table.json.payload.null.behavior`), imagem `connect`.
- Confluent `kafka-javascript`: INTRODUCTION e MIGRATION (API KafkaJS, `fromBeginning` e `autoCommit` no nível do consumer).
- Apache Kafka: exemplo de compose KRaft de nó único.
- pnpm 12: Docker (`fetch`, `deploy`), `allowBuilds`.
- Docker Compose: file watch.
- Vitest 5: projects e migração.
- React Router 8: `react-router/dom`.
- shadcn 4.21: CLI `init`.
- Kafbat UI: compose de exemplo.

## Desvios da implementação

O que mudou em relação ao Plan aprovado, encontrado durante a implementação e registrado no Board. Nenhuma decisão do Research mudou; as linhas afetadas acima já foram corrigidas.

1. **Portas dos containers isolados.** Os Mongo de integração usam 58017 (projector, replica set) e 58018 (read-service), não 57017 e 57018. As faixas 56946-57545 e 50000-50059 são portas TCP excluídas pelo Windows, e o `docker run` falha ao publicar nelas. Os dois testes leem a URL de `MONGO_TEST_URL`, com default na porta nova. Afeta "Containers isolados", E6, E7, "Verificação" e "Notas para o implementador".
2. **URL base do e2e.** O pacote `e2e` lê `E2E_BASE_URL` (default `http://localhost:8080`), não `BASE_URL`, porque o Vitest injeta `BASE_URL='/'` no ambiente. Afeta as variáveis em "Interfaces entre trilhas" e a T-40.
3. **Kafka do e2e em IPv4.** O consumer do e2e usa `'broker.address.family': 'v4'`. No host, `localhost` também resolve para `::1`, e o librdkafka perdia cerca de 11 s tentando IPv6 antes de cair para IPv4. Afeta a T-40.
4. **`procps` no target `dev`.** O `nest start --watch` mata o processo anterior com tree-kill, que depende de `ps`. Sem o `procps`, todo rebuild falhava com `EADDRINUSE`. Afeta a T-12 (Dockerfile) e a T-17 (verificação).
5. **Query estruturada na idempotência.** O `IdempotencyService` usa `manager().queryRunner.query(sql, params, true)`, porque `EntityManager.query` no TypeORM 1.1.2 não aceita o terceiro argumento. O comportamento é o mesmo. Afeta a T-23.
6. **Limpeza do DOM nos testes do web.** `apps/web/src/test/setup.ts` roda `afterEach(cleanup)`: o Vitest roda sem globals, então o RTL não limpa sozinho entre os testes. Afeta a T-7.
7. **Roteiro de dev.** No item 4 da T-43, o log do container mostra o Nest recompilando e reiniciando o processo.
8. **Rede do WSL em modo `mirrored`.** É obrigatória (`%USERPROFILE%\.wslconfig`, `networkingMode=mirrored`): em modo NAT, o CLI do Windows recebia stdout vazio de `docker run` e `docker exec`. Complementa a OQ-44, a OQ-45 e a OQ-46. Afeta "Notas para o implementador".
9. **`stack:down` remove volumes anônimos.** As imagens do Mongo (`/data/configdb`), do Kafka (`secrets`, `shared/config`) e do Debezium Connect (`config`, `data`, `logs`) declaram `VOLUME`. A cada subida o Docker criava cerca de 11 volumes anônimos, e o `down` sem `-v` os deixava para trás. Agora `stack:down` roda `rm -fsv` (para e remove os containers e os volumes anônimos deles) antes do `down`; os volumes nomeados com os dados continuam. Decisão do usuário na verificação. Afeta a T-4 (scripts da raiz) e o README.
