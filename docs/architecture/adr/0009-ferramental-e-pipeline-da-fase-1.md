# ADR 0009 — Ferramental e pipeline da Fase 1

**Status:** aceito (2026-10-24)

## Contexto

A Fase 1 (Esqueleto) monta o monorepo, o ambiente Docker e um módulo técnico `diagnostics` (agregado `Ping`) que atravessa o caminho inteiro: command → PostgreSQL com outbox → Debezium → Kafka → projector → MongoDB → read-service → web. Não há regra de negócio. O que a fase prova é o mecanismo, e as escolhas abaixo fixam o padrão que as fases seguintes herdam. As decisões vêm da pesquisa SDD da fase (`SDD/RESEARCH/2026-10-24-SkeletonResearch.md`); os códigos `OQ-n` apontam para lá.

## Decisão

### Monorepo e ferramental

| Tema | Escolha | Por quê |
|---|---|---|
| Monorepo | pnpm workspaces puro (`apps/*`, `libs/*`, `e2e`) (OQ-1) | Os quatro apps e o contrato são pacotes independentes que só se falam por `libs/contracts`. Isso torna a fronteira entre write e read visível no grafo de dependências: o `package.json` do write-service não tem `mongodb`, e o do read-service e o do projector não têm `pg` nem `typeorm`. Testes automatizados conferem isso. |
| Runtime e linguagem | Node 24.22.1, TypeScript 6.0.3, ESM em todos os pacotes (OQ-2, OQ-4) | Versões exatas no host e nas imagens. O TypeScript 7 não serve ainda: o typescript-eslint exige `<6.1.0`. |
| Versões | Exatas (sem `^`/`~`), lockfile versionado, imagens com tag de patch (OQ-3) | Reprodutibilidade; atualização é uma decisão, não um efeito colateral do `install`. |
| Testes | Vitest em todos os pacotes; `unplugin-swc` nos apps Nest para emitir metadata de decorators (OQ-6) | Um só runner. Cada app tem um config de unitários e outro de integração. |
| Lint e formatação | ESLint flat config + typescript-eslint type-checked + Prettier (OQ-7) | `no-floating-promises` fica ligada: promessa solta em handler é perda silenciosa de evento. |
| Line endings | `.gitattributes` com `* text=auto eol=lf` (OQ-8) | O Git for Windows converte para CRLF por padrão, o que quebra scripts `.sh` e configs montados em containers (`/bin/sh^M`). |

### Docker

- **Um Dockerfile na raiz, multi-stage, com um target por app** (`write-service`, `read-service`, `projector`, `gateway`) e targets de desenvolvimento (`dev`, `gateway-dev`) (OQ-9, OQ-10). `pnpm fetch` com cache, instalação offline e `pnpm deploy --prod` por app (OQ-11); `libs/contracts` é um pacote compilado em `dist/`.
- **`infra/compose.yaml` (produção) e `infra/compose.dev.yaml` (override)** (OQ-12, OQ-13). O dev usa Compose Watch: `sync` do código-fonte para dentro do container e `rebuild` quando mudam manifests, lockfile ou contratos. A Kafbat UI só existe no dev (OQ-32). Defaults dentro do compose; não há `.env` obrigatório.
- **Ordem de subida garantida por healthchecks e one-shots** (OQ-14): `db-migrate`, `kafka-init`, `mongo-init` e `connect-init`. O `write-service` só sobe depois de `connect-init`, porque o slot de replicação é criado no registro do conector e, com `snapshot.mode=no_data`, o que foi escrito antes dele nunca chegaria ao Kafka.
- **Gateway:** em produção o Nginx serve o build estático do web e roteia `/api/*` por método (GET e HEAD → read-service, o resto → write-service); em dev faz proxy do Vite, inclusive o WebSocket do HMR (OQ-15, OQ-26). O roteamento por método é a separação de CQRS aplicada na borda (ADR 0002).
- **Engine no WSL2 sem Docker Desktop** (OQ-44, OQ-45, OQ-46). O engine roda no Ubuntu do WSL2 e o CLI do Windows usa o contexto `wsl-engine`. `infra/scripts/docker-up.ps1` mantém a distro ligada (o WSL a desliga sem processo Windows ligado a ela, e o `dockerd` cai junto) e cria o symlink `/c -> /mnt/c` de que os bind mounts relativos precisam, com `COMPOSE_CONVERT_WINDOWS_PATHS=1` como variável de usuário.
- **Portas publicadas:** Nginx 8080, PostgreSQL 5433 (a 5432 é de um Postgres nativo), MongoDB 27017, Kafka 9094 (listener externo), Kafka Connect 8083 e, no dev, Kafbat UI 8081.

### Mensageria e persistência

- **Cliente Kafka: `@confluentinc/kafka-javascript` 1.11.0** (OQ-20). O `kafkajs` está parado desde 2023 e sem compatibilidade confirmada com brokers 4.x. A biblioteca foi provada dentro da imagem `node:24.22.1-trixie-slim` contra `apache/kafka:4.3.2` (produce, consume e commit manual, com redelivery do que não foi commitado) antes de o projector ser escrito. O consumer fica atrás de uma interface (`EventConsumer`), então trocar a biblioteca não toca na lógica de projeção.
- **Tópico `diagnostics.events` criado explicitamente**: 3 partições, `retention.ms=-1`, auto-create desligado no broker (OQ-19). Retenção infinita faz o tópico servir de fonte para replay; partições múltiplas, com o ID do agregado como key, mostram que a ordem só é garantida por agregado.
- **TypeORM com Data Mapper** (OQ-21, OQ-34): o agregado de domínio (`Ping`, um `AggregateRoot`) e a entity são classes separadas e o repositório converte uma na outra. O domínio não conhece o ORM. Migrations geradas com `migration:generate`, revisadas e versionadas; `synchronize: false` (OQ-35).
- **Concorrência otimista com UPDATE condicional** (OQ-33): `UPDATE ... WHERE id = :id AND version = :expected`; zero linhas afetadas lança erro de concorrência (HTTP 409) e a transação inteira, incluindo a outbox, é desfeita. `@VersionColumn` não é usado: o controle fica explícito, visível no SQL, e é o mesmo mecanismo que o agregado de Inventory vai usar.
- **Eventos sem EventBus** (OQ-27): `AggregateRoot.apply` só acumula eventos; o repositório os grava na outbox na mesma transação do agregado. O `EventBus` do `@nestjs/cqrs` é in-memory e publicá-lo seria o dual-write que o ADR 0003 evita. Só `CommandBus` e `QueryBus` são usados; o projector nem depende do pacote e usa um mapa `eventType → handler`.
- **Envelope de evento e outbox** (OQ-17, OQ-18): o value da mensagem é o envelope completo (`eventId` uuid v7 gerado na aplicação, `eventType`, `schemaVersion`, `aggregateType`, `aggregateId`, `aggregateVersion`, `occurredAt`, `correlationId`, `causationId`, `payload`); `eventId` e `eventType` também vão em headers. JSON em camelCase, colunas SQL em snake_case. A coluna `bounded_context` define o tópico (`${bounded_context}.events`) e `aggregate_id` é a key. As linhas da outbox não são apagadas nesta fase. `correlationId` e `causationId` já existem no envelope (nulos por enquanto) para que adicioná-los depois não seja uma mudança de contrato.
- **Zod em `libs/contracts`** (OQ-5): os schemas versionados (`PingCreatedV1Schema`, requests, responses) são o contrato público e são validados em quatro lugares: requests no write-service, envelope antes de gravar na outbox, envelope consumido no projector e formulário e respostas no web. Um evento que não passa no schema derruba o projector em vez de entrar no read model.
- **Projector idempotente com `processed_events`** (OQ-22, OQ-23, OQ-43): o MongoDB roda como replica set de um nó para ter transações. Em uma transação o projector grava o `eventId` em `processed_events` e aplica o evento no read model. O documento guarda `version`, e o evento só é aplicado se `aggregateVersion = version + 1`. `aggregateVersion <= version` é tratado como já aplicado (grava o `eventId` e commita). Uma lacuna (`aggregateVersion > version + 1`, ou `PingIncremented` sem documento) é falha: aborta a transação, não commita, loga e encerra o processo. O offset é commitado por mensagem, só depois da transação. É a forma prática de ter processamento *at-least-once* com efeito *exactly-once* no read model, e é o que torna o replay seguro.
- **`min_version` com espera no servidor** (OQ-24): o read-service consulta o MongoDB a cada 100 ms até `version >= min_version` ou 3 s. No timeout devolve o estado atual com `minVersionReached: false` (ou `404`, se o documento nem existe). É o read-your-writes sobre um read model eventualmente consistente. O web faz o mesmo no cliente: refaz a query a cada 250 ms enquanto `minVersionReached` for `false`.
- **`Idempotency-Key` com retenção de 24 h** (OQ-25, OQ-36 a OQ-39, OQ-41): obrigatório em `CreatePing` e `IncrementPing`, UUID válido, senão `400`. A chave é gravada na mesma transação do agregado, com a PK `(key, scope)` em que `scope` é o template da rota, junto com o hash SHA-256 de método, caminho real e corpo validado. Mesma chave com hash diferente → `422`; mesma chave com mesmo hash → devolve a resposta salva. Uma requisição concorrente com a mesma chave bloqueia no INSERT até a primeira transação terminar. Um command que falha desfaz tudo, inclusive a chave. A chave vale por 24 h (também verificada na leitura) e um job horário do `@nestjs/schedule` apaga as vencidas. O cliente web gera uma chave por ação e a reusa nos retries.
- **Replay** (OQ-30): `pnpm replay` para o projector, apaga `pings` e `processed_events`, reseta os offsets do grupo `projector` para o início e sobe o projector. Um teste E2E compara o documento antes e depois. Isso depende de o documento ser determinístico: `createdAt` e `updatedAt` vêm do `occurredAt` dos eventos, não do relógio do projector.

### Web e testes ponta a ponta

- **Stack do ADR 0008**, com o uso real definido na fase (OQ-28, OQ-40): o formulário usa React Hook Form com o schema Zod de `libs/contracts`; o Zustand guarda só `selectedPingId` e o histórico local de latências; o dado do servidor vive só no TanStack Query.
- **Dois níveis de E2E, no host, contra a stack de produção** (OQ-29): testes de API em Vitest (`e2e/`), que conferem o PostgreSQL, a outbox, o tópico (key, headers, partição e ordem) e o read model, e o Playwright em `apps/web/e2e`. O replay é um teste do mesmo pacote.
- **CI** (OQ-31): GitHub Actions roda `pnpm install --frozen-lockfile`, `lint`, `typecheck` e os testes unitários em push e pull request. Os E2E não rodam no CI, porque exigem a stack completa.

## Alternativas

- **Monorepo:** Nest CLI monorepo (acopla os apps à CLI) e Nx (peso e curva de aprendizado que não ajudam o foco em CQRS).
- **Cliente Kafka:** transporte Kafka do NestJS (depende do kafkajs parado e esconde o commit de offset, que é o que precisa ficar explícito); kafkajs direto, mantido como contingência.
- **Acesso ao PostgreSQL:** Drizzle (query builder próximo do SQL, ainda pré-1.0), MikroORM (Unit of Work e identity map), Prisma (schema e client próprios) e `pg` puro com migrations em SQL. O TypeORM foi escolha explícita do usuário (OQ-21), por ser a integração oficial do Nest; para não esconder o SQL, a checagem de versão é um UPDATE condicional escrito à mão, e o Data Mapper evita que os decorators do ORM entrem no domínio.
- **Concorrência:** `@VersionColumn` do TypeORM (esconde o mecanismo) e lock pessimista (contraria a regra 4 do projeto).
- **Propagação:** publicar no Kafka pelo handler ou usar `EventBus` (dual-write); polling da outbox (ADR 0003).
- **Hot reload no Docker:** bind mount do código (o NTFS não propaga eventos de arquivo para o container e o `node_modules` do host tem binários de Windows).
- **Docker no Windows:** Docker Desktop (descartado pelo usuário); Podman e Rancher Desktop; tudo dentro do WSL (OQ-44).

## Consequências

- Todo contexto novo copia o padrão: agregado + entity separados, UPDATE condicional, eventos na outbox, contrato Zod versionado, projeção com `processed_events`.
- O módulo `diagnostics` permanece como smoke test permanente do pipeline; qualquer mudança na infra é validada subindo a stack e rodando `pnpm test:e2e`.
- A stack completa consome memória relevante (Kafka e Connect têm o heap limitado no compose); a medição está no README.
- O replay recria o read model a partir do tópico, o que exige que a retenção de `diagnostics.events` continue infinita enquanto não houver snapshot.
- O ambiente de containers depende do script `docker-up.ps1` e de duas configurações do Windows (`COMPOSE_CONVERT_WINDOWS_PATHS` e o modo de rede do WSL); estão documentadas no README.
- Falha do projector é barulhenta de propósito (encerra o processo): uma lacuna de eventos pede investigação e, se for o caso, replay, nunca avanço silencioso.
