---
feature: Skeleton
fase: 1 — Esqueleto
date: 2026-10-24
status: implemented
research: SDD/RESEARCH/2026-10-24-SkeletonResearch.md
plan: SDD/SPEC/2026-10-24-SkeletonPlan.md
---

# Skeleton — Spec

## Resumo

Monorepo, ambiente Docker completo e um módulo técnico `diagnostics` cujo agregado `Ping` atravessa o pipeline CQRS inteiro: command no write-service → PostgreSQL (agregado + outbox na mesma transação) → Debezium → Kafka → projector → MongoDB → read-service → web. Não há regra de negócio nesta fase. O que o skeleton prova é o mecanismo: outbox, ordem por agregado, idempotência, projeção idempotente, read-your-writes e replay.

## Requisitos

| Id | Requisito | Fonte |
|---|---|---|
| R-1 | Monorepo pnpm workspaces puro com `apps/write-service`, `apps/read-service`, `apps/projector`, `apps/web`, `libs/contracts` e o pacote de testes ponta a ponta `e2e/` | OQ-1, `CLAUDE.md:36` |
| R-2 | Node 24.22.1 no host e nos containers; pnpm 12.15.0 via corepack; TypeScript 6.0.3; ESM em todos os pacotes | OQ-2, OQ-3, OQ-4, OQ-10 |
| R-3 | Versões exatas (sem `^`/`~`) em todos os `package.json`, lockfile versionado, imagens Docker com tag de patch | OQ-3, OQ-32 |
| R-4 | Vitest em todos os pacotes; ESLint (flat config) + typescript-eslint type-checked + Prettier | OQ-6, OQ-7 |
| R-5 | `.gitattributes` com `* text=auto eol=lf` e binários marcados, conteúdo renormalizado; `.gitignore` com a lista da OQ-8, incluindo `.claude/settings.local.json`; sem `.editorconfig` | OQ-8, decisão pré-Gate 1 |
| R-6 | Sistema inteiro (infra e apps) sobe com docker-compose; um Dockerfile na raiz, multi-stage, com um target por app e targets de dev | `CLAUDE.md:23`, OQ-9, OQ-11, OQ-12 |
| R-7 | `infra/compose.yaml` (base, imagens de produção) + `infra/compose.dev.yaml` (targets de dev, Compose Watch, Kafbat UI); defaults no próprio compose, sem `.env` obrigatório | OQ-12, OQ-13, OQ-32 |
| R-8 | Portas publicadas no host: Nginx 8080, PostgreSQL 5433, MongoDB 27017, Kafka 9094, Kafka Connect 8083; em dev também Kafbat UI 8081 | OQ-13, OQ-32 |
| R-9 | Healthchecks em toda a infra, `depends_on` com condições, serviços one-shot `db-migrate`, `kafka-init`, `mongo-init`, `connect-init`; apps com `GET /health` | OQ-14 |
| R-10 | Web servido pelo Nginx gateway: em dev, proxy para o Vite com HMR; em produção, build estático no próprio gateway | OQ-15 |
| R-11 | `libs/contracts` com schemas Zod versionados (envelope, eventos, requests, responses), validados no write-service, no projector e no web | OQ-5 |
| R-12 | Módulo `diagnostics` com commands `CreatePing` e `IncrementPing`, eventos `PingCreated` v1 e `PingIncremented` v1, query `GetPing`; mantido como smoke test permanente | OQ-16 |
| R-13 | write-service com TypeORM, agregado e entity separados (Data Mapper), UPDATE condicional para concorrência, migrations geradas e versionadas, `synchronize: false` | OQ-21, OQ-33, OQ-34, OQ-35 |
| R-14 | Uso do `@nestjs/cqrs`: CommandBus e QueryBus; `AggregateRoot.apply` só acumula eventos; sem EventBus para eventos de domínio; projector sem `@nestjs/cqrs` | OQ-27 |
| R-15 | Debezium Outbox Event Router lendo só a tabela `outbox`; tópico `${bounded_context}.events`; key = `aggregate_id` | OQ-18, ADR 0003 |
| R-16 | Tópico `diagnostics.events` criado explicitamente, 3 partições, `retention.ms=-1`, auto-create desligado no broker | OQ-19 |
| R-17 | Projector com `@confluentinc/kafka-javascript` (contingência registrada: kafkajs), driver oficial `mongodb`, MongoDB em replica set de um nó | OQ-20, OQ-22 |
| R-18 | Prova automatizável de que o cliente Kafka funciona na imagem Node final antes de construir o projector | OQ-20, R-1/R-2 do Research |
| R-19 | Web com React Router, TanStack Query, Zustand, Tailwind + shadcn/ui, React Hook Form + Zod, Vitest + RTL, Playwright | OQ-28, OQ-40, ADR 0008 |
| R-20 | Testes ponta a ponta: API E2E (Vitest) e UI E2E (Playwright), rodando no host contra a stack de produção | OQ-29 |
| R-21 | Script de replay e teste que prova a reconstrução do read model | OQ-30 |
| R-22 | GitHub Actions com lint, typecheck e testes unitários em push e PR | OQ-31 |
| R-23 | ADR 0009 com as escolhas técnicas da fase; ajuste de `docs/architecture/overview.md:47` e `docs/architecture/adr/0008-frontend-react-vite.md:38` e `:40`; seção "Como rodar" no README | OQ-31, `README.md:93` |

## Regras de negócio

**Não há regra de negócio nesta fase** (Research, seção "Regras de negócio identificadas"). As regras abaixo são regras do sistema que o comportamento observável precisa cumprir. Estão numeradas como RN para manter a rastreabilidade do pipeline.

- RN-1 Command devolve só ack, ID e versão: `202 Accepted` com `{ id, version }`. Query nunca altera estado. (fonte: `CLAUDE.md:42`, OQ-26)
- RN-2 O estado do agregado, os eventos na `outbox` e o registro da `Idempotency-Key` são gravados na mesma transação PostgreSQL. Nenhum código de aplicação publica no Kafka. (fonte: `CLAUDE.md:43`, OQ-18, OQ-27, OQ-37)
- RN-3 Concorrência otimista: o UPDATE do agregado é `WHERE id = :id AND version = :expected`. Zero linhas afetadas é erro de concorrência e a transação inteira é desfeita. (fonte: `CLAUDE.md:44`, OQ-33)
- RN-4 Todo evento usa o envelope da OQ-17: `eventId` (uuid v7 gerado na aplicação), `eventType`, `schemaVersion`, `aggregateType`, `aggregateId`, `aggregateVersion`, `occurredAt`, `correlationId`, `causationId` (ambos `null` nesta fase) e `payload`. JSON em camelCase, colunas SQL em snake_case. (fonte: OQ-17)
- RN-5 A `outbox` segue o schema da OQ-18. O tópico de destino é `${bounded_context}.events`, a key da mensagem é `aggregate_id`, `eventId` e `eventType` também vão em headers, e as linhas da outbox não são apagadas nesta fase. (fonte: OQ-18, `CLAUDE.md:45`)
- RN-6 O tópico `diagnostics.events` tem 3 partições e retenção infinita. O broker não cria tópicos automaticamente. (fonte: OQ-19)
- RN-7 O projector:
  - deduplica por `eventId` gravando em `processed_events` na mesma transação MongoDB do read model;
  - só aplica o evento se `aggregateVersion = version + 1` (versão 0 quando o documento não existe);
  - commita o offset por mensagem, depois da transação;
  - em falha (erro de gravação ou evento que não passa no schema do contrato) não commita, loga e encerra o processo, e o restart reprocessa.

  Quando o `eventId` é novo mas a versão não bate:
  - `aggregateVersion ≤ version`: o evento já está refletido. Grava o `eventId` em `processed_events`, não altera o documento e commita.
  - `aggregateVersion > version + 1`, ou `PingIncremented` sem documento: é uma lacuna e conta como falha. Aborta a transação, não commita, loga e encerra.

  `PingCreated` tem `aggregateVersion` fixo em 1 no contrato. Um `PingCreated` repetido para um ping existente cai no primeiro caso (`1 ≤ version`).

  (fonte: `CLAUDE.md:46`, OQ-5, OQ-23, OQ-43)
- RN-8 Payloads são validados contra os schemas de `libs/contracts`: requests no write-service, envelope antes de gravar na outbox, envelope consumido no projector, respostas e formulário no web. (fonte: OQ-5)
- RN-9 Read-your-writes: `GET` aceita `min_version`. O read-service consulta o MongoDB a cada 100 ms até `version >= min_version` ou até 3 s. No timeout devolve o estado atual com `minVersionReached: false`. (fonte: `CLAUDE.md:47`, OQ-24)
- RN-10 `Idempotency-Key` é obrigatório em `CreatePing` e `IncrementPing`. Se faltar ou não for um UUID válido, a resposta é `400` e nada é gravado. (fonte: `CLAUDE.md:49`, OQ-25, OQ-39)
- RN-11 Unicidade por (chave, rota), em que rota é o template do endpoint. Junto com a chave é guardado o hash SHA-256 de método + caminho real + corpo validado. Mesma chave na mesma rota com hash diferente → `422`, nada executa. Mesma chave com o mesmo hash → devolve a resposta salva (mesmo status e corpo), sem novo efeito. (fonte: OQ-36, OQ-39)
- RN-12 Duas requisições concorrentes com a mesma chave: a segunda espera o commit da primeira e devolve a resposta salva. Se a primeira falhar (rollback), a segunda executa normalmente. (fonte: OQ-37)
- RN-13 A chave vale por 24 h a partir da criação. Um job de hora em hora apaga as chaves com mais de 24 h. Uma chave com mais de 24 h ainda não apagada é tratada como inexistente, e a requisição executa de novo. Só respostas de sucesso ficam salvas: um command que falha desfaz a transação e não deixa chave. (fonte: OQ-38, OQ-41, OQ-37)
- RN-14 `label`: obrigatório, trim nas pontas, de 1 a 50 caracteres depois do trim, com a mesma regra Zod no formulário e no write-service. Fora disso → `400`. O valor gravado é o valor após o trim. (fonte: OQ-42)
- RN-15 No web, o dado vindo da API vive só no cache do TanStack Query. O Zustand guarda só o `selectedPingId` e o histórico local de latências. (fonte: OQ-40, ADR 0008)
- RN-16 O write-service nunca depende do MongoDB. O read-service e o projector nunca dependem do PostgreSQL. (fonte: `CLAUDE.md:41`, `CLAUDE.md:50`)
- RN-17 O Nginx roteia `/api/*` por método (GET e HEAD → read-service; os demais → write-service) e `/` → web. (fonte: OQ-26, ADR 0002)
- RN-18 Qualquer read model é reconstruível por replay: apagar o read model e `processed_events`, resetar o offset do grupo do projector para o início e reprocessar produz documentos idênticos. (fonte: `CLAUDE.md:46`, OQ-30)

### Interpretações das decisões

Pontos em que a decisão não fixou o detalhe e a Spec escolheu a leitura mais direta. Devem ser conferidos no Gate 2:

| Ponto | Interpretação | Base |
|---|---|---|
| Status HTTP do erro de concorrência | `409 Conflict`, sem retry no servidor | OQ-33 ("erro de concorrência") |
| "Rota" na unicidade da chave | Template do endpoint (`POST /api/diagnostics/pings`, `POST /api/diagnostics/pings/:id/increment`). O caminho real entra no hash, então reusar uma chave em outro ping dá `422` | OQ-36 (hash de rota + corpo), OQ-39 |
| "Estado atual" quando o documento não existe no timeout do `min_version` | `404` com `minVersionReached: false` no corpo | OQ-24 |
| Retry automático do web | Mutations repetem até 2 vezes, só em erro de rede ou `5xx`, com intervalo de 500 ms e a mesma chave. Quando `minVersionReached` é `false`, a query é refeita a cada 250 ms | OQ-24, OQ-39 |
| Idioma dos textos da interface | PT-BR (os identificadores no código continuam em inglês) | `CLAUDE.md:54`, público do produto |
| Valor inicial do contador | `count = 0` na criação; `IncrementPing` soma 1 | OQ-16 |

## Contratos

Todos os schemas e constantes abaixo são exportados por `@stubb/contracts` (lista completa no Plan, seção "Interfaces entre trilhas").

### Commands

| Command | Payload (HTTP) | Retorno | Erros |
|---|---|---|---|
| `CreatePing` | Header `Idempotency-Key: <uuid>`; corpo `{ "label": string }` (RN-14) | `202 { id: uuid v7, version: 1 }` | `400` (header ausente ou inválido, label inválido); `422` (chave reusada com outro request) |
| `IncrementPing` | Header `Idempotency-Key: <uuid>`; path `:id` (uuid); corpo ignorado (tratado como `{}`) | `202 { id, version: n + 1 }` | `400` (header ou `:id` inválido); `404` (ping inexistente); `409` (concorrência); `422` (chave reusada com outro request) |

### Events

Tópico `diagnostics.events`, `aggregateType = "Ping"`, `schemaVersion = 1`, envelope da RN-4.

| Event | Versão | Payload | Partition key |
|---|---|---|---|
| `PingCreated` | 1 | `{ label: string }` (1-50 após trim); `aggregateVersion` sempre 1 | `aggregateId` (ID do ping) |
| `PingIncremented` | 1 | `{ count: integer ≥ 1 }` (valor do contador depois do incremento) | `aggregateId` (ID do ping) |

Headers da mensagem Kafka: `id` (padrão do Debezium), `eventId` e `eventType`. Value: envelope JSON completo, com `correlationId` e `causationId` presentes e `null`.

### Queries

| Query | Parâmetros | Retorno | Read model |
|---|---|---|---|
| `GetPing` | `id` (uuid); `min_version` opcional (inteiro ≥ 1) | `200 { ping: PingView, minVersionReached: boolean }`; `404 { statusCode: 404, message: "Ping not found", minVersionReached: false }`; `400` para parâmetros inválidos | coleção `pings` do banco `stubb_read` |

`PingView = { id, label, count, version, createdAt, updatedAt }`. As datas são strings ISO 8601. `createdAt` é o `occurredAt` do `PingCreated` e `updatedAt` é o `occurredAt` do último evento aplicado, o que torna o documento determinístico no replay. Sem `min_version`, `minVersionReached` é `true`.

### HTTP

| Método | Rota | Serviço | Command/Query |
|---|---|---|---|
| POST | `/api/diagnostics/pings` | write-service | `CreatePing` |
| POST | `/api/diagnostics/pings/:id/increment` | write-service | `IncrementPing` |
| GET | `/api/diagnostics/pings/:id?min_version=n` | read-service | `GetPing` |
| GET | `/health` (porta interna de cada app, não exposta pelo Nginx) | write-service, read-service, projector | — |
| GET | `/` e demais rotas fora de `/api` | gateway (web) | — |

## Critérios de aceite

### CA-1 Cliente Kafka provado na imagem Node final
- **Given** a imagem `node:24.22.1-trixie-slim` e um broker `apache/kafka:4.3.2` em containers isolados
- **When** o script de prova produz duas mensagens com key, consome a primeira e commita `offset + 1`, consome a segunda sem commitar, desconecta e um novo consumer do mesmo grupo conecta
- **Then** o novo consumer recebe só a segunda mensagem; o resultado (biblioteca usada e forma de import) é registrado no Board

### CA-2 Line endings e arquivos ignorados
- **Given** o repositório depois da fundação
- **When** rodo `git ls-files --eol` e `git check-ignore` nos caminhos da OQ-8
- **Then** todo arquivo de texto versionado aparece com `i/lf`, e `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.env`, `playwright-report/`, `test-results/`, `.vite/` e `.claude/settings.local.json` são ignorados (`.env.example` não é)

### CA-3 Lint, typecheck e testes unitários
- **Given** o monorepo com dependências instaladas
- **When** rodo `pnpm lint`, `pnpm typecheck` e `pnpm test`
- **Then** os três terminam com código 0

### CA-4 Fronteiras entre lados
- **Given** os manifests dos apps
- **When** os testes de arquitetura de cada app rodam
- **Then** o write-service não depende de `mongodb`; read-service e projector não dependem de `pg` nem de `typeorm`

### CA-5 Contratos validam o que prometem
- **Given** os schemas de `@stubb/contracts`
- **When** valido envelopes e requests válidos e inválidos (campo ausente, `eventType` desconhecido, `aggregateVersion` 0, `PingCreated` com `aggregateVersion` 2, label vazio, só espaços ou com 51 caracteres)
- **Then** os válidos passam (com o label já sem espaços nas pontas) e os inválidos são rejeitados

### CA-6 Stack sobe com um comando
- **Given** o Docker Engine do Ubuntu no WSL2 rodando, o docker CLI no contexto `wsl-engine` (OQ-44) e nenhum container da stack
- **When** rodo `docker compose -f infra/compose.yaml up -d --build --wait`
- **Then**:
  - o comando termina com 0, os serviços de longa duração ficam `healthy` e os one-shots terminam com 0;
  - o conector `stubb-outbox` está `RUNNING`;
  - a publication `stubb_outbox` contém só `public.outbox`;
  - `diagnostics.events` tem 3 partições e `retention.ms=-1`;
  - o broker tem `auto.create.topics.enable=false`.

### CA-7 CreatePing aceito
- **Given** a stack no ar
- **When** envio `POST /api/diagnostics/pings` com `Idempotency-Key` novo e `{ "label": "  primeiro  " }`
- **Then**:
  - a resposta é `202 { id, version: 1 }`, com `id` uuid v7;
  - `diagnostics_pings` tem o ping com label `primeiro`, `count` 0 e `version` 1;
  - `outbox` tem exatamente uma linha `PingCreated` com `aggregate_id = id`, `aggregate_version = 1`, `bounded_context = diagnostics` e `payload` válido contra o contrato.

### CA-8 Agregado e outbox são atômicos
- **Given** um write-service cuja gravação na outbox falha
- **When** executo `CreatePing`
- **Then** o command falha e não existe linha nem em `diagnostics_pings` nem em `outbox` nem em `idempotency_keys`

### CA-9 IncrementPing aceito
- **Given** um ping na versão n
- **When** envio `POST /api/diagnostics/pings/:id/increment` com chave nova
- **Then** a resposta é `202 { id, version: n + 1 }`, o ping fica com `count` +1, e a outbox ganha um `PingIncremented` com `aggregate_version = n + 1` e `payload.count` igual ao novo contador

### CA-10 Concorrência otimista
- **Given** duas cargas do mesmo ping na versão n
- **When** as duas tentam gravar um incremento, uma depois da outra
- **Then** a primeira grava; a segunda recebe erro de concorrência (`409` no HTTP) e não deixa nenhuma alteração no ping, na outbox nem em `idempotency_keys`

### CA-11 Incremento de ping inexistente
- **Given** um uuid que não é de nenhum ping
- **When** envio `IncrementPing` para ele
- **Then** a resposta é `404` e nada é gravado

### CA-12 Validação do label
- **Given** o endpoint e o formulário de criação
- **When** envio label ausente, `"   "` ou com 51 caracteres
- **Then** a API responde `400` sem gravar nada, e o formulário mostra o erro sem enviar a requisição

### CA-13 Header de idempotência obrigatório
- **Given** um command válido
- **When** envio sem `Idempotency-Key` ou com valor que não é UUID
- **Then** a resposta é `400` e nada é gravado

### CA-14 Repetição com a mesma chave
- **Given** um `CreatePing` aceito com a chave K
- **When** reenvio o mesmo request com K
- **Then** recebo o mesmo status e o mesmo corpo, e nenhuma linha nova aparece em `diagnostics_pings` nem em `outbox`

### CA-15 Chave reusada com outro request
- **Given** um command aceito com a chave K
- **When** envio K na mesma rota com outro label (create) ou para outro ping (increment)
- **Then** a resposta é `422` e nada é executado

### CA-16 Requisições concorrentes com a mesma chave
- **Given** a chave K ainda não usada
- **When** dois `CreatePing` idênticos com K são enviados ao mesmo tempo
- **Then** existe um único ping e uma única linha na outbox, e as duas respostas são iguais

### CA-17 Chave expirada
- **Given** uma chave K usada há mais de 24 h e ainda não apagada
- **When** reenvio um request com K
- **Then** o command executa de novo (novo ping, nova resposta)

### CA-18 Limpeza das chaves
- **Given** chaves com 25 h e com 1 h de idade
- **When** o job de limpeza roda
- **Then** só a chave de 25 h é apagada; o job está agendado com `CronExpression.EVERY_HOUR`

### CA-19 Evento publicado no Kafka
- **Given** um `CreatePing` aceito
- **When** consumo `diagnostics.events` desde o início
- **Then** existe uma mensagem com:
  - key = `id` do ping;
  - headers `eventId` e `eventType = PingCreated`;
  - value que passa no schema do contrato, com `correlationId` e `causationId` iguais a `null`.

### CA-20 Ordem por agregado
- **Given** um ping criado e incrementado duas vezes
- **When** leio as mensagens desse ping no tópico
- **Then** as três estão na mesma partição, com `aggregateVersion` 1, 2 e 3 em ordem crescente de offset

### CA-21 Projeção aplica os eventos
- **Given** o projector consumindo
- **When** chegam `PingCreated` (versão 1) e depois `PingIncremented` (versão 2)
- **Then** o documento em `pings` fica com `label`, `count` 1, `version` 2, `createdAt` = `occurredAt` do primeiro e `updatedAt` = `occurredAt` do segundo, e `processed_events` tem os dois `eventId`

### CA-22 Projeção idempotente
- **Given** um evento já aplicado
- **When** o mesmo evento chega de novo
- **Then** o documento não muda, `processed_events` continua com uma entrada para ele e o offset é commitado

### CA-23 Commit só depois de gravar
- **Given** o consumer do projector
- **When** a gravação no MongoDB falha ou o value não passa no schema do contrato
- **Then** o offset não é commitado, o erro é logado e o processo encerra com código diferente de 0; numa execução bem-sucedida o commit acontece só depois de a transação terminar, com offset igual ao da mensagem + 1

### CA-24 Evento fora de sequência
- **Given** um ping projetado na versão 2 e um evento com `eventId` que não está em `processed_events`
- **When** chega:
  - (a) um `PingIncremented` com `aggregateVersion` 2;
  - (b) um `PingIncremented` com `aggregateVersion` 4;
  - (c) um `PingIncremented` para um ping sem documento.
- **Then**:
  - em (a), o documento não muda, o `eventId` passa a constar em `processed_events` e o offset é commitado;
  - em (b) e (c), a transação é abortada (nada em `pings` nem em `processed_events`), o offset não é commitado, o erro é logado e o processo encerra com código diferente de 0.

### CA-25 Read-your-writes
- **Given** um ping projetado na versão v
- **When** consulto `GET /api/diagnostics/pings/:id?min_version=m`
- **Then**:
  - com `m ≤ v`, a resposta é `200` com `minVersionReached: true` sem esperar;
  - com `m > v` e sem nova projeção, a resposta é `200` com o estado atual e `minVersionReached: false`, em cerca de 3 s;
  - para um id sem documento, a resposta é `404` com `minVersionReached: false`, em cerca de 3 s.

### CA-26 Validação da query
- **Given** o read-service
- **When** consulto com `:id` que não é UUID ou com `min_version` que não é inteiro ≥ 1
- **Then** a resposta é `400`

### CA-27 Roteamento do Nginx
- **Given** a stack no ar
- **When** faço `GET /api/diagnostics/pings/:id`, `POST /api/diagnostics/pings` e `GET /` em `http://localhost:8080`
- **Then** o GET é atendido pelo read-service (corpo com `minVersionReached`), o POST pelo write-service (`202`) e `/` devolve o HTML do web

### CA-28 Fluxo no web
- **Given** a stack no ar e o navegador em `http://localhost:8080/`
- **When** crio um ping com label pelo formulário e depois clico em "Incrementar"
- **Then**:
  - a tela mostra o label, `count` 0 e `version` 1 após a criação, e depois `count` 1 e `version` 2, sempre com o indicador "sincronizado";
  - o histórico de latências ganha uma entrada por ação;
  - clicar numa entrada do histórico seleciona o ping correspondente.

### CA-29 Estado do cliente separado do estado do servidor
- **Given** a store Zustand do web
- **When** inspeciono o estado e as ações dela nos testes
- **Then** ela contém só `selectedPingId`, `latencyHistory` e as ações que os alteram; os dados do ping vêm só de `useQuery`

### CA-30 Chave gerada por ação e reusada em retry
- **Given** o hook de mutation de criação
- **When** a primeira tentativa falha com erro de rede e a segunda tem sucesso
- **Then** as duas requisições levam o mesmo `Idempotency-Key`, e uma nova ação do usuário gera uma chave nova

### CA-31 Replay reconstrói o read model
- **Given** um ping criado e incrementado duas vezes, já projetado
- **When** rodo o replay (para o projector, apaga `pings` e `processed_events`, reseta o grupo `projector` para o início, sobe o projector)
- **Then** `GET` com `min_version=3` devolve um `ping` idêntico ao de antes do replay

### CA-32 Ambiente de desenvolvimento
- **Given** `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml up --build --watch`
- **When** altero um arquivo em `apps/write-service/src` e um componente em `apps/web/src`
- **Then**:
  - o write-service recompila dentro do container sem rebuild da imagem;
  - a página em `http://localhost:8080` atualiza por HMR;
  - a Kafbat UI em `http://localhost:8081` mostra o tópico `diagnostics.events` e o conector.

### CA-33 CI
- **Given** `.github/workflows/ci.yml`
- **When** há push ou pull request
- **Then** o workflow instala com `--frozen-lockfile` e roda `pnpm lint`, `pnpm typecheck` e `pnpm test` com Node 24.22.1 e pnpm 12.15.0

### CA-34 Documentação
- **Given** a fase implementada
- **When** leio `docs/architecture/adr/0009-*.md`, `docs/architecture/overview.md`, `docs/architecture/adr/0008-frontend-react-vite.md` e `README.md`
- **Then**:
  - o ADR 0009 registra as escolhas da fase com o porquê;
  - as linhas que adiavam decisões para a Fase 1 apontam para as decisões tomadas;
  - o README tem a seção "Como rodar" com pré-requisitos, comandos de produção, de dev, de testes e de replay.

## Fora de escopo

- Qualquer bounded context real e qualquer regra de negócio.
- Autenticação e autorização (Fase 3): a unicidade da chave é por (chave, rota) até existir usuário.
- SSE e change streams (Fase 4); sagas e consumo de eventos pelo write-service (Fase 5); scheduler de expiração de hold (Fase 4).
- Limpeza da tabela `outbox` (OQ-18: linhas mantidas nesta fase).
- Dead-letter queue, retry com backoff no projector, métricas de lag.
- E2E no CI (OQ-31: CI só com lint, typecheck e testes unitários).
- Schema Registry / Avro; deploy remoto; `.editorconfig`.
