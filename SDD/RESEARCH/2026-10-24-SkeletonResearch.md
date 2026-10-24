---
feature: Skeleton
fase: 1 — Esqueleto
date: 2026-10-24
status: implemented
---

# Skeleton — Research

## Objetivo

Entregar o **walking skeleton** do Stubb: o monorepo, o ambiente Docker completo e um evento fictício que atravessa todo o caminho CQRS antes de existir qualquer regra de negócio:

```
web ─► Nginx ─► write-service ─► PostgreSQL (agregado + outbox, mesma transação)
                                   │ WAL (só a tabela outbox)
                                   ▼
                     Debezium (Outbox Event Router) ─► Kafka ─► projector ─► MongoDB
                                                                              │
web ◄─ Nginx ◄─ read-service ◄────────────────────────────────────────────────┘
```

Conceito de CQRS exercitado: **separação física entre lado de escrita e lado de leitura, ligados só por eventos**. O skeleton prova, com o menor domínio possível, que:

- o command grava estado e evento na mesma transação (sem dual-write);
- o evento sai do PostgreSQL pelo WAL, não pelo código da aplicação;
- o projector transforma o evento num read model sem tocar no write store;
- a query lê só do MongoDB, e a UI precisa lidar com consistência eventual (read-your-writes).

Também define os padrões que todas as fases seguintes vão copiar: formato do envelope de evento, schema da `outbox`, configuração do conector, estratégia de idempotência do projector, layout de pastas, Dockerfile, compose, lint e testes. Por isso várias OQs abaixo são técnicas mas têm efeito longo.

## Escopo

**Dentro:**
- Monorepo com `apps/write-service`, `apps/read-service`, `apps/projector` (NestJS), `apps/web` (React + Vite) e `libs/contracts` (fonte: `CLAUDE.md:36`, `docs/roadmap.md:12`).
- Dockerfile(s) dos apps e docker-compose em `infra/` subindo infra (Nginx, PostgreSQL, Kafka KRaft, Debezium/Kafka Connect, MongoDB) **e** os apps (decisão confirmada: `CLAUDE.md:23`, `docs/roadmap.md:12`).
- Lint, typecheck e testes configurados em todos os pacotes.
- Um command fictício no write-service, o evento fictício na `outbox`, conector Debezium com Outbox Event Router, tópico Kafka, consumer no projector com dedupe por `event_id` e commit de offset após gravar, read model no MongoDB, query no read-service, tela no web.
- Teste automatizado que prova que o evento atravessou o pipeline.
- `.gitignore` (decisão do usuário, registrada pelo thread principal) e `.gitattributes` (OQ-8).
- Instruções de como rodar o projeto no `README.md` (o próprio README promete isso: `README.md:93`).
- Atualização dos docs que adiaram decisões para a Fase 1 (`docs/architecture/overview.md:47`, `docs/architecture/adr/0008-frontend-react-vite.md:38` e `:40`), conforme OQ-31.

**Fora:**
- Qualquer bounded context real (Catalog, Inventory, Ordering, Ticketing, Identity) e qualquer regra de negócio.
- Autenticação/autorização (Fase 3), SSE (Fase 4), sagas e consumo de eventos pelo write-service (Fase 5), scheduler de expiração (Fase 4).
- Dead-letter queue, retry com backoff sofisticado e métricas de lag (Fase 9 trata medição de lag).
- Schema Registry / Avro (não faz parte da stack decidida).
- Deploy em ambiente remoto.
- `Idempotency-Key`: o roadmap o coloca na Fase 5 (`docs/roadmap.md:16`), mas a regra 9 (`CLAUDE.md:49`) vale para todo command vindo do cliente. Fica fora **somente se** o usuário aceitar a exceção da OQ-25.

## Mapeamento da codebase

**Não existe código de aplicação.** O repositório contém apenas documentação e o pipeline SDD (`git ls-files`: `.claude/`, `CLAUDE.md`, `README.md`, `SDD/*/.gitkeep`, `docs/`). Não há `.gitignore`, `.gitattributes`, `package.json`, Dockerfile nem compose. Tudo será criado do zero.

Referências que a feature precisa respeitar ou atualizar:

| Fonte | O que diz | Impacto no skeleton |
|---|---|---|
| `CLAUDE.md:23` | Docker obrigatório: infra e apps sobem com docker-compose; apps empacotados com Dockerfile | Confirmado; não é OQ. Forma (um ou vários Dockerfiles, dev/prod) vira OQ-9 a OQ-15 |
| `CLAUDE.md:36` | Monorepo alvo `apps/*`, `libs/contracts`, `infra/` | Layout fixo |
| `CLAUDE.md:41-50` | 10 regras arquiteturais invioláveis | Regras 2, 3, 5, 6, 7, 9 e 10 já se aplicam ao skeleton |
| `docs/architecture/overview.md:29` | Nginx roteia `GET` para read e demais métodos para write; exceções por prefixo | OQ-26 |
| `docs/architecture/overview.md:31-32` | Outbox lido do WAL, Outbox Event Router publica no tópico do agregado; retenção longa | OQ-18, OQ-19 |
| `docs/architecture/overview.md:47` | "A ferramenta de monorepo ... é decidida na pesquisa SDD da Fase 1" | OQ-1; doc será atualizado (OQ-31) |
| `docs/architecture/overview.md:78` | Read-your-writes: "a query espera até o read model alcançar a versão" | OQ-24 |
| `docs/architecture/adr/0003-outbox-debezium.md:13` | Debezium lê só a tabela `outbox` | Config do conector |
| `docs/architecture/adr/0004-kafka.md:11` | Um tópico por contexto (`catalog.events` ...), key = ID do agregado, retenção longa | Topologia de tópicos; o evento fictício não pertence a nenhum contexto (OQ-16) |
| `docs/architecture/adr/0004-kafka.md:21` | Consumers idempotentes (at-least-once) | OQ-23 |
| `docs/architecture/adr/0006-event-sourcing-ordering.md:22` | Contratos em `libs/contracts` pensados para evolução de versão desde já | OQ-5, OQ-17 |
| `docs/architecture/adr/0008-frontend-react-vite.md:38` | Zod também no backend "é decidido na Fase 1" | OQ-5 |
| `docs/architecture/adr/0008-frontend-react-vite.md:40` | Versões exatas definidas na pesquisa da Fase 1 | OQ-3 |
| `README.md:93` | "As instruções para rodar entram neste README junto com a Fase 1" | Entrega de documentação |
| `docs/roadmap.md:27-28` | Seção "Arquivos SDD por fase" da Fase 1 ainda "(pendente)" | Atualizada na Etapa 6 do pipeline |

### Ambiente (levantado em 2026-10-24 com comandos de leitura)

| Item | Valor | Observação |
|---|---|---|
| SO | Windows 11 Home 10.0.26200, PowerShell 5.1 + Git Bash | napkin `.claude/napkin.md:16` |
| CPU / RAM | 8 lógicos / 13,9 GB | Kafka + Kafka Connect são JVMs; a stack inteira com 3 apps Nest + Vite deve ficar perto de 4-6 GB (risco R-4) |
| Node (host) | v24.14.0 | Linha 24 "Krypton" |
| npm (host) | 11.9.0 | |
| pnpm (host) | **não instalado** | |
| corepack (host) | 0.34.6 | Ainda vem com Node 24; **não vem mais a partir do Node 25** |
| Docker | 29.5.3 | Docker Desktop instalado (`C:\Program Files\Docker\Docker`) |
| Docker Compose | v5.1.4 | |
| Docker daemon | **parado** no momento da pesquisa | `failed to connect to ... dockerDesktopLinuxEngine` |
| git | 2.53.0.windows.1 | `core.autocrlf=true` vindo de `C:/Program Files/Git/etc/gitconfig` (nível system); `core.symlinks=false` |
| Line endings atuais | índice e working tree em LF (`git ls-files --eol`: `i/lf w/lf`) | O git já avisa "LF will be replaced by CRLF the next time Git touches it": um checkout novo trará CRLF |
| Porta 5432 no host | **ocupada** por `postgres.exe` (serviço Windows, PID 6940) | Publicar o PostgreSQL do compose em 5432 vai conflitar (OQ-13) |
| Portas 80, 443, 3000-3002, 5173, 8080, 8083, 9092, 9093, 27017 | livres | |

### Versões atuais levantadas (2026-10-24)

| Item | Última versão | Fonte / observação |
|---|---|---|
| Node.js 24 | 24.22.1 (LTS Krypton, **Maintenance desde 2026-10-20**, EOL 2028-04-30) | nodejs.org/dist/index.json, nodejs/Release schedule.json |
| Node.js 26 | 26.12.1 (**vira Active LTS em 2026-10-28**, EOL 2029-04-30) | idem; sem corepack embutido |
| Imagens node | `node:24.22.1-trixie-slim`, `-bookworm-slim`, `-alpine3.24` | Docker Hub |
| pnpm | 12.15.0 (linha 11: 11.28.8) | npm registry; imagem oficial `ghcr.io/pnpm/pnpm:12` com `pnpm runtime set node 24` |
| TypeScript | 7.0.2 (nativo em Go, **sem API programática**); linha 6.0.x | TS 7.0 anunciado em 2026-07-08; typescript-eslint 8.72.0 exige `typescript >=4.8.4 <6.1.0`; `@nestjs/cli` 12.0.10 depende de `typescript ~6.0.2` |
| NestJS (`@nestjs/core`) | 12.2.0 (Node ≥ 20.19 ou ≥ 22.12) | v12: pacotes em ESM; `nest new` gera ESM por padrão, Vitest para ESM (Jest para CJS), oxlint no lugar de ESLint, Rspack como bundler de monorepo |
| `@nestjs/cqrs` | 12.1.1 | peer `@nestjs/core ^12` |
| `@nestjs/cli` | 12.0.10 | |
| `@nestjs/microservices` | 12.2.0 | Transporte Kafka usa **kafkajs** (peer opcional); não suporta o cliente da Confluent |
| kafkajs | 2.2.4 | Sem commits upstream desde meados de 2024 (fonte de terceiros); compatibilidade com Kafka 4.x não confirmada (KIP-896 removeu versões antigas do protocolo) |
| `@confluentinc/kafka-javascript` | 1.11.0 | Wrapper do librdkafka 2.16, API compatível com KafkaJS ("promisified"); binários pré-compilados para Linux glibc e musl, Windows x64, macOS arm64; doc lista Node 18-22 (verificar 24/26) |
| Apache Kafka (imagem `apache/kafka`) | 4.4.0 (2026-10-22), 4.3.2 (2026-10-20), 4.2.2 | Docker Hub; KRaft é o único modo desde 4.0 |
| Debezium | 3.7.0.Final (2026-09-29), 3.6.3.Final | `quay.io/debezium/connect:3.7.0.Final`; suporta PostgreSQL 14-18 (não 19) |
| PostgreSQL | 18.6 (imagem `postgres:18.6-trixie`, `-alpine`) | PostgreSQL 19 sem GA confirmada; Debezium 3.7 não lista 19 |
| MongoDB | 9.0.4, 8.0.34 | Docker Hub (`mongo`) |
| Driver `mongodb` | 7.7.0 (Node ≥ 20.19) | Mongoose 9.11.4 usa `mongodb ~7.7` |
| Nginx | stable 1.30.6, mainline 1.31.8 | nginx.org |
| React | 19.3.1 | |
| Vite | 8.3.5 (Node `^20.19 \|\| >=22.12`) | |
| Vitest | 5.0.5 (Node `^22.12 \|\| ^24 \|\| >=26`) | |
| Jest | 30.5.2 | |
| React Router | 8.5.0 | |
| TanStack Query | 5.104.5 | |
| Zustand | 5.0.16 | |
| Tailwind CSS | 4.3.3 | |
| Playwright | 1.64.1 | |
| Zod | 4.6.7 | |
| ESLint / typescript-eslint / Prettier | 10.13.0 / 8.72.0 / 3.9.10 | |
| Biome / oxlint | 2.6.3 / 1.89.0 | |
| drizzle-orm / typeorm / @mikro-orm/core | 0.45.4 / 1.1.2 / 7.2.5 | |

### Fatos de ferramentas relevantes para o desenho

- **Outbox Event Router (Debezium 3.6 reference):** colunas padrão `id` (uuid, vira header e serve para dedupe), `aggregatetype` (roteamento: `route.topic.replacement` padrão `outbox.event.${routedByValue}`), `aggregateid` (vira a **key** da mensagem, garantindo ordem por partição), `type`, `payload` (jsonb; por padrão o value da mensagem é só o payload). Colunas extras podem ir para header ou para o envelope via `table.fields.additional.placement`; `table.expand.json.payload=true` expande o jsonb. Todos os nomes de coluna são configuráveis (`table.field.event.id`, `table.field.event.key`, `route.by.field`, ...).
- **NestJS Kafka transport:** commit manual exige `run.autoCommit: false` e `consumer.commitOffsets([{ topic, partition, offset: offset + 1 }])` via `KafkaContext`.
- **Confluent client:** autocommit ligado por padrão (a cada 5 s); commit manual com `enable.auto.commit=false` + `commitOffsets` (offset + 1); em revogação de partição não commita sozinho.
- **MongoDB:** transações multi-documento e change streams exigem replica set (mesmo de um nó só).
- **pnpm + Docker:** a doc oficial recomenda, para monorepo, um Dockerfile com estágio de build compartilhado e `pnpm deploy --filter=<app> --prod /prod/<app>` por app (com `injectWorkspacePackages: true` no `pnpm-workspace.yaml`), cache do store via BuildKit.
- **TypeScript 7:** sem API programática até a 7.1; ferramentas como typescript-eslint precisam da 6.0 (`@typescript/typescript6` como alias). NestJS depende de `experimentalDecorators` + `emitDecoratorMetadata`; o anúncio do TS 7 não menciona essas flags.

### Fontes consultadas

- [Node.js dist index](https://nodejs.org/dist/index.json), [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json), [Node.js corepack docs (v25)](https://nodejs.org/dist/latest/docs/api/corepack.html)
- npm registry: `@nestjs/core`, `@nestjs/cqrs`, `@nestjs/cli`, `@nestjs/microservices`, `pnpm`, `typescript`, `typescript-eslint`, `react`, `vite`, `vitest`, `zod`, `kafkajs`, `@confluentinc/kafka-javascript`, `mongodb`, `mongoose`, `typeorm`, `drizzle-orm`, `@mikro-orm/core`, `react-router`, `@tanstack/react-query`, `zustand`, `tailwindcss`, `@playwright/test`, `eslint`, `prettier`, `@biomejs/biome`, `oxlint`, `jest`
- [NestJS v12.0.0 release](https://github.com/nestjs/nest/releases/tag/v12.0.0), [NestJS Kafka docs](https://docs.nestjs.com/microservices/kafka)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Confluent Kafka JavaScript client](https://docs.confluent.io/kafka-clients/javascript/current/overview.html), [changelog](https://docs.confluent.io/kafka-clients/javascript/current/changelog.html), [openapps.pro kafkajs](https://openapps.pro/packages/kafkajs), [KIP-896](https://cwiki.apache.org/confluence/display/KAFKA/KIP-896:+Remove+old+client+protocol+API+versions+in+Kafka+4.0)
- [Debezium releases](https://debezium.io/releases/), [Debezium 3.7](https://debezium.io/releases/3.7/), [Outbox Event Router 3.6](https://debezium.io/documentation/reference/3.6/transformations/outbox-event-router.html), [quay.io debezium/connect](https://quay.io/repository/debezium/connect)
- [Apache Kafka downloads](https://kafka.apache.org/community/downloads/), [apache/kafka tags](https://hub.docker.com/r/apache/kafka/tags)
- [PostgreSQL versioning](https://www.postgresql.org/support/versioning/), [PostgreSQL 19 Beta 1](https://postgresql.org/about/news/postgresql-19-beta-1-released-3313/)
- [mongo tags](https://hub.docker.com/_/mongo/tags), [node tags](https://hub.docker.com/_/node/tags), [postgres tags](https://hub.docker.com/_/postgres/tags), [nginx download](https://nginx.org/en/download.html)
- [pnpm: Working with Docker](https://pnpm.io/docker)

## Regras de negócio identificadas

**Nenhuma.** O skeleton existe justamente para provar o pipeline antes de qualquer regra de negócio (`docs/roadmap.md:12`, coluna "Aprendizado CQRS"). O evento fictício não tem significado de domínio; nenhuma OQ desta pesquisa é `[negócio]`.

Restrições arquiteturais já confirmadas que o skeleton precisa cumprir (não são regras de negócio):

| Fonte | Restrição |
|---|---|
| `CLAUDE.md:23` | Sistema inteiro (infra e apps) sobe com docker-compose; apps empacotados com Dockerfile |
| `CLAUDE.md:42` | Command retorna só ack, ID e versão; query nunca altera estado |
| `CLAUDE.md:43` | Evento gravado na `outbox` na mesma transação do agregado; nunca publicar direto no Kafka |
| `CLAUDE.md:45` | Partition key = ID do agregado |
| `CLAUDE.md:46` | Projector deduplica por `event_id`, confirma offset só depois de gravar no MongoDB; read model reconstruível por replay |
| `CLAUDE.md:47` | Command devolve versão; query aceita `min_version` |
| `CLAUDE.md:49` | `Idempotency-Key` em commands vindos do cliente (ver OQ-25) |
| `CLAUDE.md:21`, ADR 0008 | Dado da API vive só no TanStack Query |
| `CLAUDE.md:54-56` | Código em inglês, docs em PT-BR; commands no imperativo, eventos no passado, queries `Get*`/`List*` |
| Usuário (via thread principal) | `.gitignore` entra nesta fase |

## Impacto CQRS

Nomes abaixo são **propostas** da OQ-16; mudam conforme a decisão.

| Tipo | Itens |
|---|---|
| Commands | `CreatePing` (cria o agregado, versão 1); `IncrementPing` (incrementa contador, versão n+1) — opção B da OQ-16 |
| Events | `PingCreated` v1, `PingIncremented` v1, no envelope da OQ-17, tópico da OQ-16/OQ-18 |
| Queries | `GetPing` (por ID, com `min_version` opcional) |
| Aggregates | `Ping` (state-stored, coluna `version`), num módulo técnico fora dos 5 bounded contexts |
| Read models | `pings` (um documento por ping: id, contador/mensagem, `version`, `updatedAt`) + coleção de controle de dedupe (OQ-23) |
| Sagas / process managers | Não se aplica: o skeleton não tem reação entre contextos; sagas entram na Fase 5 |

Infraestrutura CQRS construída aqui e reaproveitada em todas as fases: repositório que grava agregado + outbox na mesma transação, conector Debezium, convenção de tópicos, consumer idempotente com commit manual, espera por `min_version` no read-service, padrão de chamada command → query com versão no web.

## Riscos

- **R-1 kafkajs parado e Kafka 4.x.** O transporte Kafka do NestJS depende do kafkajs, sem releases desde 2023 e sem compatibilidade confirmada com brokers 4.x (KIP-896). Mitigação: OQ-20; o Plan deve ter uma etapa inicial que prova produce/consume contra o broker escolhido antes de construir o projector.
- **R-2 Binário nativo do cliente Confluent.** `@confluentinc/kafka-javascript` usa librdkafka pré-compilado; a doc cita Node 18-22. Se não houver binário para a versão de Node escolhida, a instalação cai para compilação (precisa de toolchain C na imagem). Mitigação: mesma etapa de prova do R-1, rodando dentro da imagem final.
- **R-3 TypeScript 7 x ferramentas.** TS 7 não tem API; typescript-eslint exige `<6.1.0` e a Nest CLI usa `~6.0.2`. Usar TS 7 quebra lint tipado e possivelmente o build do Nest. Mitigação: OQ-4.
- **R-4 Memória.** Host com 13,9 GB; o Docker Engine roda dentro da VM do WSL2 (OQ-44), que por padrão reserva só uma fração da RAM. Kafka + Connect + Mongo + Postgres + 3 apps Nest + Vite podem passar de 5 GB. Mitigação: limitar heap das JVMs (`KAFKA_HEAP_OPTS`, `HEAP_OPTS` do Connect) no compose; Plan deve medir com `docker stats`.
- **R-5 Line endings.** `core.autocrlf=true` no nível system: um clone novo converte LF em CRLF, o que quebra scripts `.sh` montados em containers (`/bin/sh^M`) e arquivos de config do Nginx/Debezium. Mitigação: `.gitattributes` (OQ-8) + `git add --renormalize .`.
- **R-6 Hot reload em Windows.** Bind mount de código no NTFS não propaga eventos de arquivo (inotify) para o container Linux; Vite e `nest start --watch` não percebem mudanças sem polling, e `node_modules` do host (binários Windows de esbuild/rolldown/swc/librdkafka) não roda no container. Mitigação: OQ-12.
- **R-7 Porta 5432 ocupada** por um PostgreSQL nativo no host. Mitigação: OQ-13.
- **R-8 Engine Docker parado.** O daemon não estava rodando na pesquisa. Com a OQ-44, o implementer precisa confirmar que o Docker Engine do Ubuntu no WSL2 está ativo e que o CLI usa o contexto `wsl-engine` antes de qualquer etapa com containers. O Docker Desktop não é iniciado.
- **R-9 Ordem de subida.** O conector Debezium só pode ser registrado depois que o Connect responde, a tabela `outbox` existe e o PostgreSQL está com `wal_level=logical`. Sem isso o conector falha ou cria publicação errada. Mitigação: OQ-14.
- **R-10 Imagem do PostgreSQL 18.** A partir da 18, a imagem oficial mudou o `PGDATA` padrão para um subdiretório versionado; o volume deve ser montado no diretório pai (`/var/lib/postgresql`). Verificar na doc da imagem ao escrever o compose.
- **R-11 Decorators no Vitest.** NestJS depende de `emitDecoratorMetadata`; o transformador padrão do Vitest/Vite pode não emitir metadata. Mitigação: usar a configuração de Vitest gerada pela Nest CLI 12 (ou plugin SWC) e confirmar na doc atual durante o Plan.
- **R-12 Escopo crescendo.** O skeleton toca quase toda a infra do projeto; cada OQ "incluir agora" aumenta o tamanho. As recomendações abaixo tentam manter o mínimo que estabelece padrão.

## Open Questions

Nenhuma OQ é de negócio. Estão agrupadas: A) ferramental do monorepo, B) Docker, C) pipeline CQRS, D) web, testes e entrega.

### A) Ferramental do monorepo

### OQ-1 [técnica] Qual ferramenta de monorepo?
- **Contexto:** `docs/architecture/overview.md:47` adiou a decisão. O monorepo mistura três apps NestJS, um app Vite e uma lib compartilhada. O Dockerfile (OQ-11) depende dessa escolha.
- **Opções:**
  - A) **pnpm workspaces** puro: cada app/lib com `package.json` próprio, scripts rodados com `pnpm -r` / `pnpm --filter`. A Nest CLI é usada dentro de cada app no modo padrão (não monorepo).
  - B) pnpm workspaces + **Turborepo**: igual a A, com cache e orquestração de tarefas (`turbo run build`) e `turbo prune` para Docker.
  - C) **Nest CLI monorepo mode**: um `package.json` e um `node_modules` na raiz, `apps/`/`libs/` gerenciados pelo `nest-cli.json`. Não cobre bem o app Vite.
  - D) **Nx**: geradores, grafo de dependências, cache; muita abstração e configuração própria.
- **Recomendação:** A. É o padrão do ecossistema, cobre Nest e Vite igualmente, o Docker tem receita oficial (`pnpm deploy`) e não esconde nada; para quem está aprendendo TS/Node, cada app parece um projeto normal. Turbo/Nx resolvem problema de escala de build que ainda não existe. Conexão CQRS: cada lado (write, read, projector) vira um pacote com dependências próprias, o que deixa visível que o read-service não depende de nada do write, só de `libs/contracts`.

### OQ-2 [técnica] Qual versão de Node.js (containers e host)?
- **Contexto:** Hoje (2026-10-24) o Node 24 acabou de entrar em Maintenance LTS (2026-10-20, EOL 2028-04-30) e o Node 26 vira Active LTS em 2026-10-28 (EOL 2029-04-30). O host tem Node 24.14.0. Node 25+ não traz corepack. O cliente Kafka da Confluent documenta Node 18-22.
- **Opções:** A) Node 24 (24.22.1) nos containers e no host. B) Node 26 nos containers e no host (instalar 26 no host). C) Node 26 nos containers, 24 no host.
- **Recomendação:** A. Já está no host (mesmo major em host e container evita diferença entre o que roda no editor e no Docker), é LTS até 2028, tem corepack, e reduz o risco R-2 de binário nativo. Subir para 26 depois é uma tarefa `chore` simples. Se o usuário preferir começar na LTS mais nova, B é viável, mas a etapa de prova do Kafka (R-1/R-2) vira obrigatória.

### OQ-3 [técnica] Quais versões exatas de bibliotecas e imagens?
- **Contexto:** `docs/architecture/adr/0008-frontend-react-vite.md:40` pede definição na Fase 1. Tabela de versões atuais na seção "Versões atuais levantadas". Imagens com tag exata (não `latest`) tornam o ambiente reproduzível.
- **Opções:** A) Fixar as versões abaixo (dependências npm com versão exata no `package.json` + lockfile; imagens com tag de patch). B) Fixar só major (`^`) e deixar o lockfile travar. C) Usar sempre a mais nova de cada linha, inclusive TS 7, Kafka 4.4 e Mongo 9.
- **Recomendação:** A, com a lista:
  - Runtime: Node 24.22.1 (OQ-2), pnpm 12.15.0 (`packageManager` no `package.json` raiz).
  - Backend: NestJS 12.2.x (`@nestjs/core`, `common`, `platform-express`), `@nestjs/cqrs` 12.1.1, `@nestjs/cli` 12.0.x, TypeScript 6.0.x (OQ-4), Zod 4.6.x (OQ-5), cliente Kafka conforme OQ-20, acesso ao Postgres conforme OQ-21, driver `mongodb` 7.7.x (OQ-22).
  - Frontend: React 19.3.x, Vite 8.3.x, React Router 8.5.x, TanStack Query 5.104.x, Tailwind 4.3.x, shadcn/ui (CLI atual), Zustand 5.0.x e React Hook Form só se entrarem (OQ-28).
  - Testes/lint: Vitest 5.0.x, Playwright 1.64.x, ESLint 10.13.x + typescript-eslint 8.72.x + Prettier 3.9.x (conforme OQ-6/OQ-7).
  - Imagens: `postgres:18.6-trixie`, `mongo:8.0.34`, `apache/kafka:4.3.2`, `quay.io/debezium/connect:3.7.0.Final`, `nginx:1.30.6-alpine`, `node:24.22.1-trixie-slim` (OQ-10).
  - Por quê: PostgreSQL 18 porque Debezium 3.7 não suporta 19 (nem há GA confirmada); Kafka 4.3.2 em vez de 4.4.0 porque a 4.4 saiu há 2 dias e o Debezium 3.7 foi testado contra a linha 4.3; Mongo 8.0 por ser linha madura e certamente coberta pelo driver 7.x (9.0 é opção se o usuário quiser a mais nova); Nginx stable em vez de mainline.

### OQ-4 [técnica] TypeScript 6.0 ou 7.0? E ESM ou CommonJS?
- **Contexto:** TS 7 (Go, ~10x mais rápido) não tem API programática; typescript-eslint exige `<6.1.0` e a Nest CLI usa `~6.0.2`. NestJS 12 publica os pacotes em ESM e gera projetos novos em ESM por padrão (com Vitest); CJS continua suportado (com Jest). Vite e `libs/contracts` compartilhada funcionam melhor em ESM.
- **Opções:** A) TS 6.0.x + ESM em todos os pacotes. B) TS 6.0.x + CJS nos apps Nest, ESM no web. C) TS 7 para `tsc` + `@typescript/typescript6` para lint/Nest CLI, ESM.
- **Recomendação:** A. Uma versão de TS e um sistema de módulos para o repo inteiro é o mais simples de entender; ESM é o padrão atual do Nest 12 e do Vite, e evita dois formatos para `libs/contracts`. TS 7 traz velocidade que um repo deste tamanho não precisa, ao custo de duas versões de compilador.

### OQ-5 [técnica] Formato dos contratos em `libs/contracts` e uso de Zod no backend
- **Contexto:** `libs/contracts` é o contrato público entre write e read (`CLAUDE.md:56`) e deve evoluir por versão (ADR 0006:22). ADR 0008:38 deixou para a Fase 1 decidir Zod no backend. O NestJS idiomático valida DTOs com `class-validator`; Zod exige um pipe próprio (poucas linhas) ou lib como `nestjs-zod`.
- **Opções:**
  - A) **Schemas Zod** em `libs/contracts` (um schema por evento e versão, ex.: `PingCreatedV1`), tipos TS derivados com `z.infer`; usados no write-service (validar corpo do command e montar o evento), no projector (validar o evento consumido) e no web (validar resposta/forma).
  - B) Só **tipos TS** em `libs/contracts`; validação de entrada no Nest com `class-validator`; nenhuma validação no projector.
  - C) **JSON Schema** como fonte, com tipos gerados.
- **Recomendação:** A. Uma fonte única para tipo e validação em runtime nos dois lados. Conexão CQRS: o projector validar o evento na entrada é o que torna o contrato realmente "público" e detecta evento malformado antes de corromper um read model. Versionar por nome de schema (`V1`, `V2`) prepara o upcasting da Fase 8. O pipe de validação Zod no Nest é escrito à mão (sem lib extra), o que é curto e didático.

### OQ-6 [técnica] Framework de teste do backend
- **Contexto:** O web já usa Vitest (ADR 0008). Nest 12 gera Vitest para projetos ESM e Jest para CJS. Risco R-11 (metadata de decorators no Vitest).
- **Opções:** A) Vitest em todo o monorepo. B) Jest nos apps Nest, Vitest no web.
- **Recomendação:** A, consequência natural de ESM (OQ-4) e do padrão do Nest 12: um runner, uma sintaxe, uma config base compartilhada. A configuração de decorators segue o que a Nest CLI 12 gera.

### OQ-7 [técnica] Lint e formatação
- **Contexto:** Nest 12 gera oxlint; o ecossistema mais documentado é ESLint + typescript-eslint + Prettier. Em código assíncrono com handlers de command/evento, a regra `no-floating-promises` (lint com tipos) pega um bug clássico: esquecer `await` num insert da outbox ou num commit de offset.
- **Opções:** A) ESLint (flat config) + typescript-eslint com regras type-checked + Prettier. B) Biome (lint + format numa ferramenta). C) oxlint + Prettier (padrão do Nest 12).
- **Recomendação:** A. Lint com informação de tipo é o mais maduro aqui e cobre o bug de promessa solta, que neste projeto quebra a garantia "gravar antes de confirmar o offset". Mais lento que B/C, irrelevante neste tamanho. Exige TS 6.0 (OQ-4).

### OQ-8 [técnica] `.gitattributes` e conteúdo do `.gitignore`
- **Contexto:** `core.autocrlf=true` (system) faz checkouts novos virarem CRLF (R-5). O `.gitignore` já foi decidido; falta conteúdo. `.claude/settings.local.json` existe no disco, não está versionado e é, por convenção do Claude Code, configuração pessoal.
- **Opções:**
  - `.gitattributes`: A) `* text=auto eol=lf` + binários marcados (`*.png binary` etc.) + `git add --renormalize .`; B) só `*.sh`, `*.conf`, `*.json` com `eol=lf`.
  - `.gitignore`: incluir `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.env` (mantendo `.env.example`), `playwright-report/`, `test-results/`, `.vite/`; e **`.claude/settings.local.json`: ignorar ou versionar?**
- **Recomendação:** `.gitattributes` A (LF em tudo; o projeto roda em Linux dentro do Docker e os editores no Windows lidam bem com LF). `.gitignore` com a lista acima e ignorando `.claude/settings.local.json` (é permissão local da máquina). Sem `.editorconfig` nesta fase, a menos que o usuário queira.

### B) Docker

### OQ-9 [técnica] Um Dockerfile por app ou um Dockerfile único multi-target?
- **Contexto:** O usuário escreveu "um Dockerfile" (`CLAUDE.md:23` diz "com Dockerfile"); não está confirmado se é um por app ou um só. Em monorepo pnpm, qualquer Dockerfile precisa da raiz do repo como contexto (lockfile e `libs/contracts`).
- **Opções:**
  - A) **Um Dockerfile na raiz**, multi-stage, com estágio comum de install/build e um target por app (`--target write-service`, `read-service`, `projector`, `web`), como na doc oficial do pnpm.
  - B) **Um Dockerfile por app** (`apps/<app>/Dockerfile`), cada um repetindo install/build, contexto na raiz.
  - C) Um Dockerfile genérico para os três Nest (parametrizado por `ARG APP`) + um para o web.
- **Recomendação:** A. Instala dependências e compila `libs/contracts` uma vez, mantém a receita num lugar só e corresponde literalmente a "um Dockerfile". B é mais fácil de ler isoladamente, mas triplica a lógica de pnpm. A pergunta precisa de confirmação explícita do usuário porque a frase original é ambígua.

### OQ-10 [técnica] Imagem base dos apps Node
- **Contexto:** Variantes disponíveis: `node:24.22.1-trixie-slim` (Debian 13, glibc), `-bookworm-slim` (Debian 12), `-alpine3.24` (musl). Binários nativos (librdkafka, swc, rolldown) têm builds para glibc e musl, mas glibc é o alvo mais testado. Alternativa: `ghcr.io/pnpm/pnpm:12` com `pnpm runtime set node 24`.
- **Opções:** A) `node:<versão>-trixie-slim` em build e runtime, pnpm instalado via corepack. B) Alpine em build e runtime. C) Slim no build, distroless no runtime. D) Imagem oficial do pnpm.
- **Recomendação:** A. Menos surpresa com binários nativos e DNS (musl), tamanho razoável, shell disponível para depurar dentro do container (útil para estudo). Distroless/Alpine são otimização de produção que não é objetivo agora.

### OQ-11 [técnica] Como o workspace pnpm é tratado no build da imagem?
- **Contexto:** Cada imagem precisa só das dependências do seu app mais `libs/contracts` compilada.
- **Opções:** A) `pnpm fetch` + `pnpm install --frozen-lockfile --offline` no estágio de build, `pnpm --filter <app>... build` e `pnpm deploy --filter=<app> --prod` para gerar a pasta final (com `injectWorkspacePackages: true`). B) `turbo prune` (exige Turborepo, OQ-1). C) Copiar a raiz inteira com `node_modules` completo para cada imagem.
- **Recomendação:** A. É a receita oficial do pnpm, funciona sem ferramenta extra, aproveita cache do BuildKit e gera imagens só com o necessário. Implica `libs/contracts` ser um pacote compilado (com `build` próprio), não importado por path alias.

### OQ-12 [técnica] Fluxo de desenvolvimento dentro do Docker (hot reload, targets dev/prod) e papel do host
- **Contexto:** Com apps em containers no Windows, bind mount de código não dispara eventos de arquivo no Linux e `node_modules` do host tem binários Windows (R-6). Docker Compose tem **Compose Watch** (`develop.watch` com `sync`, `sync+restart`, `rebuild`), que copia arquivos para dentro do container, onde o watcher funciona normalmente. Também é preciso decidir se o host terá pnpm/`node_modules` (para o editor entender os tipos, rodar lint e testes unitários rápido).
- **Opções:**
  - A) **Compose Watch** + target `dev` no Dockerfile (roda `nest start --watch` / `vite`) e target `prod` (código compilado, `node dist/main.js`, web estático). Host com Node + pnpm + `node_modules` próprios para editor, lint, typecheck e testes unitários.
  - B) **Bind mount** de `apps/` e `libs/` com polling (`CHOKIDAR_USEPOLLING`, `server.watch.usePolling` no Vite) e volume anônimo para `node_modules`; targets dev/prod como em A.
  - C) Sem hot reload: rebuild da imagem a cada mudança (`docker compose up --build`); só target prod.
  - D) Como A, mas lint/testes também só dentro de containers (host sem `node_modules`).
- **Recomendação:** A. Compose Watch é o mecanismo pensado para esse problema, evita polling (CPU) e conflitos de binário. O host com `node_modules` é o que faz o VS Code funcionar com tipos e dá feedback rápido de teste; o Docker é obrigatório para **rodar o sistema** (`CLAUDE.md:23`), não para editar. Exige instalar pnpm no host (via corepack, já disponível).

### OQ-13 [técnica] Organização do compose: arquivos, perfis, portas publicadas e variáveis de ambiente
- **Contexto:** Compose fica em `infra/` (`docs/architecture/overview.md:45`). Precisa servir dev (OQ-12) e o teste E2E (OQ-29). A porta 5432 do host está ocupada por um PostgreSQL nativo (R-7). Credenciais aqui são só de desenvolvimento local.
- **Opções (arquivos):** A) Um `infra/compose.yaml` com tudo e targets dev; E2E usa o mesmo. B) `infra/compose.yaml` (base, imagens prod) + `infra/compose.dev.yaml` (override com targets dev e `develop.watch`). C) Um arquivo com `profiles` (`dev`, `e2e`, `tools`).
- **Opções (portas no host):** a) publicar só o Nginx (ex.: `8080`) e, para depuração, Postgres em `5433`, Mongo em `27017`, Kafka em `9094` (listener externo), Connect em `8083`; b) publicar só o Nginx e acessar bancos com `docker compose exec`.
- **Opções (env):** i) `infra/.env.example` versionado + `infra/.env` ignorado; ii) defaults no próprio compose (`${VAR:-valor}`) e nenhum `.env` obrigatório.
- **Recomendação:** B + a + ii. Base + override deixa claro o que é "o sistema" e o que é conveniência de dev, e permite o E2E rodar contra imagens prod (`docker compose -f compose.yaml up`). Publicar Postgres em 5433 evita o conflito e permite abrir o banco num cliente SQL para **ver a outbox**, o que tem valor didático; idem Mongo para ver o read model. Defaults no compose fazem `docker compose up` funcionar sem passo manual; `.env.example` só se surgir segredo real (não há nesta fase).

### OQ-14 [técnica] Healthchecks, ordem de subida e tarefas de inicialização (migrations, tópicos, conector, replica set)
- **Contexto:** R-9. Itens que precisam acontecer antes do pipeline funcionar: migrations do PostgreSQL (tabela do agregado + `outbox`), `wal_level=logical`, criação dos tópicos (OQ-19), `rs.initiate()` se Mongo for replica set (OQ-22), registro do conector no Kafka Connect.
- **Opções:**
  - A) **Healthchecks** em todos os serviços de infra (`pg_isready`, `mongosh --eval ping`, script de API do Kafka, `GET /connectors` no Connect) + `depends_on: condition: service_healthy` + **serviços one-shot** no compose (`db-migrate`, `kafka-init`, `connect-init` com `PUT /connectors/<nome>/config` idempotente, `mongo-init`) com `condition: service_completed_successfully`. Apps expõem `GET /health` simples (sem `@nestjs/terminus`).
  - B) Igual A, mas o próprio write-service roda migrations e registra o conector no boot.
  - C) Passos manuais documentados no README (`curl` para o conector, script de migration).
- **Recomendação:** A. `docker compose up` leva do zero ao pipeline funcionando, cada passo de bootstrap fica visível e isolado, e o write-service não ganha responsabilidade de infra. Registro via `PUT .../config` é idempotente (pode rodar a cada subida). Apps também tentam reconectar no startup, para não depender só da ordem.

### OQ-15 [técnica] Como o `apps/web` é servido no container?
- **Contexto:** O web fala com o backend só via Nginx (ADR 0008:11). Em dev precisa de HMR; o Nginx precisa fazer proxy do WebSocket do Vite.
- **Opções:** A) Dev: container com Vite dev server atrás do Nginx gateway (`/` → web, `/api` → serviços). Prod: build estático (`vite build`) servido pelo próprio Nginx gateway (arquivos copiados para a imagem do Nginx ou volume). B) Dev igual A; prod com uma imagem `web` própria (nginx interno servindo estáticos) atrás do gateway. C) Só build estático, também em dev (sem HMR).
- **Recomendação:** A. Mesma origem em dev e prod (sem CORS), um Nginx a menos, e o gateway continua sendo o único ponto de entrada. Em dev o HMR fica atrás do proxy, igual ao caminho real.

### C) Pipeline CQRS

### OQ-16 [técnica] Como é o evento fictício: agregado, commands, eventos, módulo, tópico e destino depois da Fase 2
- **Contexto:** O skeleton precisa de um agregado mínimo para exercitar "agregado + outbox na mesma transação" e "versão devolvida pelo command". Ele não pertence a nenhum dos 5 bounded contexts, e o ADR 0004:11 define um tópico por contexto. Se só existir criação, a versão é sempre 1 e o `min_version` não é exercitado de verdade.
- **Opções:**
  - Forma: A) só `CreatePing` → `PingCreated` (cada clique cria um agregado novo, versão 1). B) `CreatePing` → `PingCreated` + `IncrementPing` → `PingIncremented` (o mesmo agregado ganha versões 2, 3...; o projector trata dois tipos de evento no mesmo read model). C) Outro nome/tema proposto pelo usuário.
  - Módulo/tópico: i) módulo técnico `diagnostics` nos três apps, tópico `diagnostics.events`; ii) `skeleton.events`.
  - Destino: x) **manter** como smoke test permanente do pipeline (útil para validar cada fase); y) **remover** quando a Fase 2 trouxer o primeiro fluxo real.
- **Recomendação:** B + i + x. B exercita a coluna `version`, o `WHERE version = :expected` (regra 4, de forma trivial) e o read-your-writes com versão > 1, sem regra de negócio. `diagnostics` comunica que não é um bounded context. Manter dá um teste ponta a ponta barato que continua valendo em todas as fases; o custo é um módulo pequeno a mais.

### OQ-17 [técnica] Formato do envelope do evento
- **Contexto:** É o contrato público do lado de leitura (`CLAUDE.md:56`) e será copiado por todos os eventos futuros. Precisa suportar dedupe (`event_id`), ordem/versão (`aggregate_version`), evolução (schema version) e, a partir da Fase 5, correlação entre sagas.
- **Opções:**
  - Onde ficam os metadados: A) **tudo no value** da mensagem Kafka, como JSON: `{ eventId, eventType, schemaVersion, aggregateType, aggregateId, aggregateVersion, occurredAt, correlationId, causationId, payload }`, além de `eventId` e `eventType` também como headers. B) Metadados só em headers Kafka, value = payload puro.
  - Correlação: a) incluir `correlationId`/`causationId` já (opcionais/nulos no skeleton); b) adicionar na Fase 5.
  - IDs: uuid v7 gerado na aplicação (ordenável por tempo, conhecido antes de gravar) vs uuid v4 vs `uuidv7()` do PostgreSQL 18.
  - Nomes no JSON: camelCase (idioma TS) vs snake_case.
- **Recomendação:** A + a + uuid v7 gerado na aplicação + camelCase no JSON (snake_case só nas colunas SQL). Envelope no value torna a mensagem autocontida: o projector e um futuro replay não dependem de headers que ferramentas às vezes perdem. Incluir correlação agora evita uma versão 2 do envelope na Fase 5 (ADR 0006:22 pede desenho para evolução). ID gerado na aplicação é o que o command devolve ao cliente sem ida extra ao banco.

### OQ-18 [técnica] Schema da tabela `outbox`, configuração do Outbox Event Router e limpeza da outbox
- **Contexto:** O Router usa por padrão `aggregatetype` para escolher o tópico, mas o ADR 0004 quer tópico **por contexto**, não por tipo de agregado. A key da mensagem tem que ser o ID do agregado (regra 5). O Debezium recomenda (opcionalmente) apagar a linha da outbox na mesma transação, já que só o WAL importa.
- **Opções (roteamento):** A) Coluna própria `bounded_context` como `route.by.field` e `route.topic.replacement=${routedByValue}.events`; coluna `aggregate_type` separada. B) Reusar `aggregatetype` guardando o nome do contexto.
- **Opções (limpeza):** a) manter as linhas (sem limpeza nesta fase); b) inserir e apagar na mesma transação (`tombstones.on.delete=false`); c) manter e criar job de limpeza por idade.
- **Proposta de schema (A):** `outbox(id uuid PK, bounded_context text, aggregate_type text, aggregate_id text, aggregate_version bigint, event_type text, schema_version int, occurred_at timestamptz, payload jsonb)`, com `payload` contendo o envelope completo da OQ-17. Conector: `plugin.name=pgoutput`, `table.include.list=public.outbox`, `publication.autocreate.mode=filtered`, `table.field.event.id=id`, `table.field.event.key=aggregate_id`, `route.by.field=bounded_context`, `table.expand.json.payload=true`, `table.fields.additional.placement=event_type:header:eventType`, key `StringConverter`, value `JsonConverter` com `schemas.enable=false`.
- **Recomendação:** A + a. Nomes de coluna explícitos deixam o significado claro e separam "para onde vai" (contexto) de "de quem é" (agregado). Manter as linhas no skeleton permite abrir o banco e ver a outbox, o que ajuda a entender o padrão; a política de limpeza é decidida quando houver volume (registrar como pendência para fase futura).

### OQ-19 [técnica] Criação dos tópicos, número de partições e retenção
- **Contexto:** ADR 0004 pede retenção longa (replay). Auto-criação de tópico pelo broker usa padrões (1 partição, retenção de 7 dias), o que contradiz "retenção longa" e esconde a decisão.
- **Opções:** A) Criar explicitamente no `kafka-init` (OQ-14) com `auto.create.topics.enable=false`, `diagnostics.events` com 3 partições e `retention.ms=-1` (infinita). B) Igual A com 1 partição. C) Auto-criação.
- **Recomendação:** A. Criação explícita documenta a topologia no repositório; 3 partições tornam visível que a ordem só vale por agregado (eventos de pings diferentes caem em partições diferentes); retenção infinita é o que permite o replay da regra 6 em dev. Os tópicos internos do Kafka Connect (config/offset/status) usam fator de replicação 1 (um broker só).

### OQ-20 [técnica] Cliente Kafka no Node e como o projector consome
- **Contexto:** R-1 e R-2. O transporte Kafka do NestJS (`@nestjs/microservices`) só funciona com kafkajs, que está parado; o cliente da Confluent é mantido, tem API compatível com KafkaJS, mas é nativo. A regra 6 exige controle explícito do commit de offset.
- **Opções:** A) `@confluentinc/kafka-javascript` (API promisified/KafkaJS-like) usado diretamente num provider do projector, com `enable.auto.commit=false` e commit manual. B) kafkajs usado diretamente num provider. C) Transporte Kafka do NestJS (`Transport.KAFKA`, `@EventPattern`) com kafkajs e `autoCommit: false`.
- **Recomendação:** A. É o cliente mantido e testado contra brokers 4.x; usar direto (sem o transporte do Nest) deixa o loop de consumo, o dedupe e o commit explícitos no código, que é exatamente o mecanismo que o projeto quer aprender (o `@nestjs/cqrs` não faz isso por nós, `docs/architecture/adr/0001-stack-nestjs.md:22`). O Plan deve começar com uma etapa de prova (produce/consume dentro da imagem Node escolhida) e ter B como plano de contingência registrado.

### OQ-21 [técnica] Acesso ao PostgreSQL no write-service e migrations
- **Contexto:** O repositório do write precisa: transação explícita, `UPDATE ... WHERE id = :id AND version = :expected` (optimistic concurrency, regra 4) e insert na `outbox` na mesma transação (regra 3). Migrations versionadas no repo, executadas pelo `db-migrate` (OQ-14).
- **Opções:**
  - A) **Drizzle ORM** + drizzle-kit: schema em TS, query builder próximo do SQL, transação explícita, migrations SQL geradas e versionadas. Pré-1.0 (0.45.x).
  - B) **TypeORM** (`@nestjs/typeorm`): integração oficial do Nest, entities com decorators, `@VersionColumn`; a checagem de versão do TypeORM não é um UPDATE condicional e o SQL fica escondido.
  - C) **MikroORM**: Unit of Work + identity map, lock otimista nativo com UPDATE condicional, bom para DDD; mais conceitos para aprender.
  - D) **Prisma**: schema próprio, client gerado, migrations fortes; lock otimista manual; outra linguagem de schema.
  - E) **`pg` puro** + migrations SQL (ex.: `node-pg-migrate`): máxima transparência, mais código de mapeamento.
- **Recomendação:** A. Mantém o SQL visível (dá para ler o `WHERE version = ?` e a transação com a outbox no código), tem tipos, e não traz Unit of Work implícito que esconderia quando o evento é gravado. Conexão CQRS: o write side é "a verdade", e vale ver exatamente o que vai para o banco. Se o usuário preferir a integração mais "Nest", B; se quiser DDD com ORM completo, C.

### OQ-22 [técnica] Acesso ao MongoDB e topologia (standalone vs replica set de um nó)
- **Contexto:** Projector e read-service leem/gravam documentos moldados por tela; não há regra de domínio no Mongo. Transações multi-documento (dedupe + read model atômicos, OQ-23) e change streams (possível SSE na Fase 4, ou espera de `min_version`) exigem replica set.
- **Opções (acesso):** A) driver oficial `mongodb` 7.7. B) Mongoose (`@nestjs/mongoose`), com schemas.
- **Opções (topologia):** a) replica set de um nó (`--replSet rs0` + `rs.initiate` no `mongo-init`); b) standalone.
- **Recomendação:** A + a. O driver oficial basta para upserts condicionais; Mongoose duplicaria o schema que já vive em `libs/contracts` (OQ-5). Replica set de um nó é o requisito para fazer dedupe e atualização do read model numa transação só, e já deixa change streams disponíveis para a Fase 4.

### OQ-23 [técnica] Dedupe por `event_id`, commit de offset e falhas no projector
- **Contexto:** Regra 6 (`CLAUDE.md:46`): deduplicar por `event_id` e confirmar o offset só depois de gravar. Entrega é at-least-once (ADR 0004:21).
- **Opções (onde guardar event_ids):** A) Coleção `processed_events` (`_id = eventId`, com `consumer`/`processedAt`) gravada **na mesma transação Mongo** da atualização do read model; duplicata = erro de chave duplicada → ignora e commita. B) Lista de event_ids aplicados dentro do próprio documento do read model (sem transação, mas acoplado a cada read model). C) Dedupe só por `aggregateVersion` (`update ... where version < incoming`), sem guardar event_id.
- **Opções (commit):** a) commit por mensagem, depois da transação; b) commit por lote.
- **Opções (falha):** i) não commita, loga e encerra o processo; o container reinicia (`restart: unless-stopped`) e reprocessa a partir do último offset; ii) retry em memória com backoff e depois encerra; iii) DLQ.
- **Recomendação:** A + a + i. A segue a regra literalmente e serve para qualquer read model futuro; guardar também `version` no documento (para a OQ-24) e aplicar o evento só se `aggregateVersion = version + 1` dá uma segunda defesa contra fora de ordem. Commit por mensagem é o mais simples de raciocinar. Na falha, parar e reprocessar é seguro justamente porque o projector é idempotente; DLQ fica para quando houver eventos reais.

### OQ-24 [técnica] Read-your-writes (`min_version`) já no skeleton?
- **Contexto:** Regra 7 e `docs/architecture/overview.md:78` ("a query espera até o read model alcançar a versão"). No skeleton o command devolve `{ id, version }` e a tela precisa mostrar o resultado sem piscar dado velho.
- **Opções:** A) Implementar já: `GET /api/diagnostics/pings/:id?min_version=n` espera no servidor (polling no Mongo a cada ~50-100 ms) até `version >= n` ou até um timeout; no timeout responde com o estado atual e um indicador de que não alcançou (cliente decide refazer). B) Implementar já, mas timeout responde erro (`409`/`503` com `Retry-After`). C) Sem espera no servidor: o web refaz a query (TanStack Query) até a versão chegar. D) Adiar para a Fase 4.
- **Recomendação:** A, com timeout de 3 s (valor técnico, sujeito a confirmação). Exercita a regra 7 com o menor mecanismo possível e mostra na prática o que é consistência eventual: o teste E2E consegue medir quanto a projeção demora. Polling em vez de change stream mantém o read-service trivial; a troca pode vir com SSE na Fase 4.

### OQ-25 [técnica] `Idempotency-Key` no command do skeleton
- **Contexto:** A regra 9 (`CLAUDE.md:49`) exige `Idempotency-Key` em todo command vindo do cliente, sem exceção escrita. O roadmap coloca `Idempotency-Key` na Fase 5 (`docs/roadmap.md:16`). O command do skeleton vem do web.
- **Opções:** A) Implementar já um mecanismo genérico no write-service (header obrigatório, tabela `idempotency_keys` no PostgreSQL gravada na mesma transação, resposta repetida para a mesma chave). B) Adiar para a Fase 5 e registrar **exceção explícita e temporária** para o módulo `diagnostics`. C) Exigir o header já, mas só registrar/logar (sem efeito).
- **Recomendação:** B. O mecanismo completo tem decisões próprias (retenção das chaves, resposta quando a mesma chave chega com corpo diferente) que pertencem à fase de pagamento, onde a duplicação causa dano real; no skeleton um ping duplicado é inofensivo. Como a regra é inviolável, a exceção precisa ser aceita pelo usuário e registrada nas Decisões. Se o usuário preferir não abrir exceção, A.

### OQ-26 [técnica] Roteamento do Nginx, prefixos de rota e resposta do command
- **Contexto:** ADR 0002: `GET` → read-service, demais → write-service, exceções por prefixo. O web também passa pelo Nginx (OQ-15). Regra 2: command devolve só ack, ID e versão.
- **Opções (rotas):** A) `/api/*` com `map $request_method` (GET/HEAD → read-service; resto → write-service) e `/` → web; rotas de diagnóstico em `/api/diagnostics/...`. B) Prefixos por serviço (`/write/*`, `/read/*`).
- **Opções (resposta do command):** a) `202 Accepted` com `{ id, version }`; b) `201 Created` com `{ id, version }` e `Location`.
- **Recomendação:** A + a. A é o que o ADR 0002 descreve e mantém a URL do recurso igual para escrita e leitura (`POST /api/diagnostics/pings` e `GET /api/diagnostics/pings/:id`). `202` comunica que o estado foi aceito no write side mas a leitura ainda vai alcançar, que é o comportamento real em CQRS.

### OQ-27 [técnica] Padrão de uso do `@nestjs/cqrs` no skeleton
- **Contexto:** O pacote é in-memory (ADR 0001:22). O padrão definido aqui será repetido em todos os contextos. O `AggregateRoot` do pacote acumula eventos com `apply()` e publica no `EventBus` em memória com `commit()`; usar `commit()` criaria um segundo caminho de eventos além da outbox.
- **Opções:** A) write-service: Controller → `CommandBus` → `CommandHandler` → agregado (`AggregateRoot.apply` para acumular eventos) → repositório grava estado + `getUncommittedEvents()` na outbox na mesma transação e chama `uncommit()`; **sem** `EventBus` para eventos de domínio. read-service: Controller → `QueryBus` → `QueryHandler` → Mongo. projector: sem `@nestjs/cqrs`; um registro simples `eventType → handler`. B) Igual A, mas o projector despacha via `EventBus` em memória após ler do Kafka. C) Não usar `@nestjs/cqrs` no skeleton.
- **Recomendação:** A. Deixa claro que o **único** caminho de evento entre processos é a outbox, e usa CommandBus/QueryBus onde eles agregam (separação command/query dentro do processo). No projector, um mapa explícito mostra o despacho sem esconder o dedupe/commit; o `EventBus` em memória volta a fazer sentido nas sagas (Fase 5).

### D) Web, testes e entrega

### OQ-28 [técnica] O que do stack do ADR 0008 entra no web nesta fase e como é a tela
- **Contexto:** ADR 0008 lista React Router, TanStack Query, Zustand, Tailwind + shadcn/ui, React Hook Form + Zod, Vitest + RTL, Playwright. O skeleton precisa só de uma tela.
- **Opções:** A) Configurar já React Router, TanStack Query, Tailwind + shadcn/ui (init + 1-2 componentes), Vitest + RTL e Playwright; deixar Zustand e React Hook Form para a primeira fase que tiver estado de cliente/formulário. B) Configurar tudo do ADR 0008. C) Mínimo: React + `fetch`, sem libs.
- **Tela proposta:** página `/diagnostics` (ou `/`) com botão "Criar ping", botão "Incrementar", exibição do read model (contador, versão, hora da projeção) e a latência medida entre o command e a leitura com `min_version`.
- **Recomendação:** A. Estabelece o padrão que importa para CQRS (resultado de command → query com `min_version` via TanStack Query, sem copiar dado do servidor para store local) sem instalar libs que ficariam sem uso. Zustand e RHF entram com primeiro uso real.

### OQ-29 [técnica] Como provar automaticamente que o evento atravessou tudo (E2E)
- **Contexto:** Critério central da fase. O teste precisa rodar contra a stack real do compose.
- **Opções:**
  - Camadas: A) Dois testes: (1) **API E2E** em Vitest: `POST` via Nginx → `GET` com `min_version` → confere read model, e confere a linha na `outbox` e a mensagem no tópico com key = ID do agregado; (2) **UI E2E** em Playwright: clica, vê o valor projetado. B) Só Playwright. C) Só API.
  - Onde roda: a) no host, contra a stack subida com `docker compose up --wait` (Playwright com Chromium instalado no host); b) em container via perfil `e2e` (imagem oficial do Playwright).
  - Stack: i) contra a stack com imagens **prod** (base sem override); ii) contra a stack dev.
- **Recomendação:** A + a + i. O teste de API prova cada salto do pipeline (outbox, Kafka, Mongo) e falha apontando onde quebrou; o Playwright prova o último salto até a tela. Rodar no host é mais simples de depurar; contra imagens prod garante que os Dockerfiles funcionam. Também cobre a prova de replay da OQ-30.

### OQ-30 [técnica] Prova de replay do read model nesta fase?
- **Contexto:** Regra 6: "todo read model precisa ser reconstruível por replay". Com retenção infinita (OQ-19) e dedupe (OQ-23), o replay é: apagar read model + `processed_events`, resetar o offset do consumer group para o início, deixar o projector reprocessar.
- **Opções:** A) Incluir um script (`pnpm --filter projector replay` ou serviço one-shot) e um teste que apaga o read model, faz o replay e confere que o documento volta igual. B) Só documentar o procedimento no README. C) Adiar para a Fase 8.
- **Recomendação:** A. É a demonstração mais clara de que "o read model serve para exibir; o write model é a verdade" (`docs/architecture/overview.md:11`) e é barato com o pipeline já montado. Validar cedo evita descobrir na Fase 8 que algum read model não é reprodutível.

### OQ-31 [técnica] CI e documentação das decisões
- **Contexto:** CI (GitHub Actions) não foi decidido. Além disso, `docs/architecture/overview.md:47` e ADR 0008:38/:40 adiaram decisões para esta fase; após o Gate 1 eles ficam desatualizados.
- **Opções (CI):** A) Fora da Fase 1. B) Workflow com lint + typecheck + testes unitários em push/PR. C) B + build das imagens + E2E com compose no runner.
- **Opções (docs):** a) Novo ADR `0009` (ferramental do monorepo, Docker, cliente Kafka, ORM, contratos) + ajuste das linhas que adiavam a decisão + seção "Como rodar" no README; b) só ajustar overview/ADR 0008 e README.
- **Recomendação:** B + a. CI básico é pouco YAML e protege lint/testes a cada push; o E2E no CI (C) pode vir depois que a stack estiver estável. Um ADR registra o porquê das escolhas técnicas desta fase, como os ADRs 0001-0008 já fazem para as anteriores.

### E) OQs levantadas pelo thread principal durante o Gate 1

### OQ-32 [técnica] Ferramenta visual para ver os eventos no Kafka?
- **Contexto:** Ver tópicos, partições, keys, headers e offsets ajuda a entender partition key e lag. Sem UI, só `kafka-console-consumer` via `docker compose exec`.
- **Opções:** A) Nenhuma, só CLI. B) Kafbat UI (fork mantido do kafka-ui) só no override de dev. C) Redpanda Console só no override de dev.
- **Recomendação:** nenhuma (pergunta aberta ao gosto do usuário).

### OQ-33 [técnica] Optimistic concurrency com TypeORM (consequência da OQ-21)
- **Contexto:** `@VersionColumn` + lock `optimistic` do TypeORM checa a versão na leitura, não no UPDATE; duas transações simultâneas podem passar. A regra 4 exige checagem atômica.
- **Opções:** A) UPDATE condicional explícito via QueryBuilder (`WHERE id = :id AND version = :expected`; 0 linhas afetadas → erro de concorrência). B) `@VersionColumn` + lock optimistic.
- **Recomendação:** A.

### OQ-34 [técnica] Agregado de domínio e entity do TypeORM (consequência da OQ-21)
- **Opções:** A) Classes separadas (agregado de domínio sem decorators de ORM + entity de persistência), Data Mapper com repositório que mapeia uma na outra. B) Entity = agregado. C) Active Record.
- **Recomendação:** A.

### OQ-35 [técnica] Migrations com TypeORM (consequência da OQ-21)
- **Opções:** A) `migration:generate` a partir das entities, revisadas e versionadas, `synchronize: false`, executadas pelo one-shot `db-migrate`. B) Escritas à mão. C) SQL puro fora do TypeORM.
- **Recomendação:** A.

### OQ-36 a OQ-39 [técnica] Regras do `Idempotency-Key` (consequência da OQ-25 = implementar já)
- **OQ-36:** mesma chave com corpo diferente → A) 422; B) 409; C) devolver resposta salva sem comparar. Recomendação: A.
- **OQ-37:** duas requisições simultâneas com a mesma chave → A) a segunda espera (INSERT da chave na mesma transação bloqueia até o commit da primeira, unique violation, devolve a resposta salva); B) a segunda recebe 409 imediato. Recomendação: A.
- **OQ-38:** retenção das chaves → A) para sempre nesta fase; B) 24 h + job de limpeza; C) outro prazo. Sem recomendação (valor).
- **OQ-39:** regras do header → A) obrigatório em `CreatePing` e `IncrementPing`, ausente → 400, UUID válido senão 400, unicidade por (chave, rota), web gera uma chave por ação e reusa em retry; B) obrigatório, string livre; C) opcional. Recomendação: A.

### OQ-40 [técnica] Uso real de Zustand e React Hook Form (consequência da OQ-28 = tudo do ADR 0008)
- **Opções:** A) RHF + schema Zod de `libs/contracts` num form que cria o ping com `label` (`CreatePing { label }`); Zustand só com estado de cliente (id do ping selecionado e histórico local de latências). B) Form "incrementar por N". C) Só instalar e configurar.
- **Recomendação:** A.

### OQ-41 [técnica] Limpeza das chaves de 24 h (consequência da OQ-38)
- **Opções:** A) `@nestjs/schedule` de hora em hora + expiração checada na leitura; B) mesmo, diário; C) só o job, sem checar na leitura.
- **Recomendação:** A.

### OQ-42 [técnica] Validação do `label` do ping (consequência da OQ-40)
- **Opções:** A) obrigatório, 1-50 caracteres após trim; B) opcional, até 50; C) obrigatório, 1-100.
- **Recomendação:** nenhuma (valor).

### F) OQs levantadas pelo planner na etapa Spec + Plan

### OQ-43 [técnica] O que o projector faz com um evento que não pode ser aplicado (`aggregateVersion ≠ version + 1`)?
- **Contexto:** A OQ-23 decidiu que o documento do read model guarda `version` e que o evento "só aplica se `aggregateVersion = version + 1`", e que "em falha não commita, loga e encerra". Não ficou decidido o que acontece quando o `event_id` é novo (não está em `processed_events`), mas a condição de versão falha. Há dois casos:
  - **(a) `aggregateVersion ≤ version`**: o read model já reflete esse estado. Só acontece se `processed_events` e o read model saírem de sincronia, por exemplo com um replay parcial feito à mão.
  - **(b) `aggregateVersion > version + 1`, ou `PingIncremented` sem documento**: há uma lacuna. Com partition key = ID do agregado a ordem é garantida, então isso só acontece por bug ou por perda de evento.
  Tratar como "falha" faz o projector reiniciar em loop sobre a mesma mensagem até alguém intervir. Tratar como "ignorar" faz commit e perde o evento em silêncio. É um comportamento de erro, por isso não pode ser presumido.
- **Opções:**
  - A) (a) é tratado como já aplicado: grava o `event_id` em `processed_events`, não altera o documento e commita. (b) é falha: aborta a transação, não commita, loga e encerra (o restart tenta de novo, e o loop continua até intervenção manual).
  - B) (a) e (b) são falha: não commita, loga e encerra.
  - C) (a) e (b) são ignorados: grava o `event_id`, loga um aviso e commita.
  - D) (a) como em A; (b) loga erro, grava o `event_id` e commita (descarta o evento).
- **Recomendação:** A. O caso (a) é uma forma de duplicata e é seguro ignorar. O caso (b) significa que o read model ficaria errado para sempre se o evento fosse descartado. Parar e chamar atenção é coerente com "o read model é reconstruível por replay": a correção é investigar e fazer replay, nunca seguir com um read model corrompido. No skeleton o loop só aparece com bug.
- **Efeito no Plan:** a tarefa T-29 e o CA-24 ficam bloqueados até a decisão. O restante do projector não depende dela.

## Decisões

Registradas antes do Gate 1:
- Docker obrigatório: sistema inteiro (infra e apps) sobe com docker-compose; apps empacotados com Dockerfile (fonte: `CLAUDE.md:23`, `docs/roadmap.md:12`).
- `.gitignore` entra nesta fase (usuário, via thread principal).
- Nome da feature: `Skeleton` (usuário, via thread principal).

Gate 1 (usuário, 2026-10-24):
- OQ-1 → pnpm workspaces puro (A).
- OQ-2 → Node 24 (24.22.1) no host e nos containers (A).
- OQ-3 → versões exatas de patch nas libs (package.json + lockfile) e nas imagens, conforme a lista da recomendação (A).
- OQ-4 → TypeScript 6.0.x + ESM em todos os pacotes (A).
- OQ-5 → schemas Zod versionados em `libs/contracts`, validados no write-service, no projector e no web; pipe Zod do Nest escrito à mão (A).
- OQ-6 → Vitest em todo o monorepo (A).
- OQ-7 → ESLint (flat config) + typescript-eslint com regras type-checked + Prettier (A).
- OQ-8 → `.gitattributes` com `* text=auto eol=lf` + binários marcados + `git add --renormalize .`; `.gitignore` com a lista recomendada, incluindo `.claude/settings.local.json`; sem `.editorconfig` (A).
- OQ-9 → um Dockerfile na raiz, multi-stage, com um target por app (A).
- OQ-10 → `node:24.22.1-trixie-slim` em build e runtime, pnpm via corepack (A).
- OQ-11 → `pnpm fetch` + install offline + `pnpm deploy --filter=<app> --prod`; `libs/contracts` é pacote compilado (A).
- OQ-12 → Compose Watch + targets dev e prod no Dockerfile; host com pnpm e `node_modules` para editor, lint, typecheck e testes unitários (A).
- OQ-13 → `infra/compose.yaml` (base, imagens prod) + `infra/compose.dev.yaml` (override dev); portas publicadas: Nginx 8080, Postgres 5433, Mongo 27017, Kafka 9094 (listener externo), Connect 8083; defaults no próprio compose, sem `.env` obrigatório (B + a + ii).
- OQ-14 → healthchecks na infra + `depends_on` com `service_healthy` + one-shots `db-migrate`, `kafka-init`, `mongo-init`, `connect-init` (PUT idempotente); apps com `GET /health` simples (A).
- OQ-15 → dev: Vite atrás do Nginx gateway (com proxy do WebSocket do HMR); prod: build estático servido pelo próprio Nginx gateway (A).
- OQ-16 → `CreatePing`/`PingCreated` + `IncrementPing`/`PingIncremented`; módulo técnico `diagnostics`, tópico `diagnostics.events`; mantido como smoke test permanente (B + i + x).
- OQ-17 → envelope completo no value + `eventId`/`eventType` também em headers; `correlationId`/`causationId` já incluídos (nulos no skeleton); uuid v7 gerado na aplicação; camelCase no JSON, snake_case no SQL (A + a).
- OQ-18 → coluna `bounded_context` como `route.by.field`, tópico `${routedByValue}.events`, key = `aggregate_id`; schema proposto; linhas da outbox mantidas (sem limpeza nesta fase) (A + a).
- OQ-19 → tópicos criados explicitamente no `kafka-init`, auto-create desligado, `diagnostics.events` com 3 partições e `retention.ms=-1` (A).
- OQ-20 → `@confluentinc/kafka-javascript` direto num provider, commit manual; Plan começa com etapa de prova; kafkajs direto como contingência (A).
- OQ-21 → **TypeORM** (B), contra a recomendação. Desdobramentos nas OQ-33, 34 e 35.
- OQ-22 → driver oficial `mongodb` + replica set de um nó (A + a).
- OQ-23 → coleção `processed_events` na mesma transação Mongo do read model; documento guarda `version` e só aplica se `aggregateVersion = version + 1`; commit de offset por mensagem após a transação; em falha não commita, loga e encerra o processo (restart reprocessa) (A + a + i).
- OQ-24 → espera no servidor com polling no Mongo até `version >= min_version` ou timeout de 3 s; no timeout devolve o estado atual + indicador de que não alcançou (A).
- OQ-25 → **implementar já** (A), contra a recomendação. Sem exceção à regra 9. Desdobramentos nas OQ-36 a 39 e 41.
- OQ-26 → `/api/*` roteado por método (GET/HEAD → read-service, resto → write-service), `/` → web; command responde `202 Accepted` com `{ id, version }` (A + a).
- OQ-27 → CommandBus/QueryBus; `AggregateRoot.apply` só acumula eventos, que o repositório grava na outbox na mesma transação; sem EventBus para eventos de domínio; projector com mapa `eventType → handler` sem `@nestjs/cqrs` (A).
- OQ-28 → **tudo do ADR 0008** (B), contra a recomendação: React Router, TanStack Query, Zustand, Tailwind + shadcn/ui, React Hook Form + Zod, Vitest + RTL, Playwright. Uso real na OQ-40.
- OQ-29 → dois testes: API E2E em Vitest (outbox, tópico com key = ID, read model) + Playwright; rodam no host contra a stack com imagens prod (`compose.yaml` sem override, `up --wait`) (A + a + i).
- OQ-30 → script de replay + teste que apaga read model e `processed_events`, reseta o offset do consumer group e confere que o documento volta igual (A).
- OQ-31 → GitHub Actions com lint + typecheck + testes unitários em push/PR; ADR 0009 + ajustes em overview e ADR 0008 + seção "Como rodar" no README (B + a).
- OQ-32 → Kafbat UI só no `compose.dev.yaml` (B).
- OQ-33 → UPDATE condicional explícito via QueryBuilder; 0 linhas afetadas → erro de concorrência; `@VersionColumn` não é usado para controle (A).
- OQ-34 → agregado de domínio e entity TypeORM separados, Data Mapper; repositório mapeia um no outro (A).
- OQ-35 → migrations geradas com `migration:generate`, revisadas e versionadas; `synchronize: false`; `db-migrate` roda `migration:run`; `wal_level` e publication ficam no compose/conector (A).
- OQ-36 → hash do request (rota + corpo) guardado com a chave; mesma chave com corpo diferente → `422`, nada executa (A).
- OQ-37 → chave gravada na mesma transação do agregado (PK); requisição concorrente bloqueia no INSERT até o commit da primeira, recebe unique violation e devolve a resposta salva (A).
- OQ-38 → retenção de **24 h** + job de limpeza (B). Depois de 24 h a chave expira e a mesma chave executa de novo.
- OQ-39 → header obrigatório em `CreatePing` e `IncrementPing`; ausente → `400`; precisa ser UUID válido, senão `400`; unicidade por (chave, rota) até existir usuário (Fase 3); web gera uma chave por ação do usuário e reusa em retry (A).
- OQ-40 → RHF + schema Zod de `libs/contracts` no form de criação do ping com `label` (`CreatePing { label }`); Zustand guarda só estado de cliente (id do ping selecionado e histórico local de latências); dado do servidor só no TanStack Query (A).
- OQ-41 → `@nestjs/schedule` no write-service rodando de hora em hora, apagando chaves com mais de 24 h; expiração também checada na leitura (chave com mais de 24 h ainda não apagada é tratada como inexistente) (A).
- OQ-42 → `label` obrigatório, trim nas pontas, 1 a 50 caracteres após o trim; fora disso → `400`; mesma regra Zod no form e no write-service (A).

Levantada na etapa Spec + Plan:
- OQ-43 → (a) `aggregateVersion ≤ version`: tratado como já aplicado; grava o `event_id` em `processed_events`, não altera o documento e commita. (b) lacuna (`aggregateVersion > version + 1` ou `PingIncremented` sem documento): falha; aborta a transação, não commita, loga e encerra (restart tenta de novo até intervenção: investigar + replay) (A). Usuário, 2026-10-24.

Gate 2 (usuário, 2026-10-24):
- Interpretações da Spec (seção "Interpretações das decisões") confirmadas: conflito de versão → `409` sem retry no servidor; unicidade da `Idempotency-Key` por template da rota, com o caminho real no hash (mesma chave em outro ping → `422`); timeout do `min_version` com documento inexistente → `404` + `minVersionReached: false`; web repete mutation até 2 vezes só em erro de rede ou `5xx`, a cada 500 ms, com a mesma chave, e refaz a query a cada 250 ms enquanto `minVersionReached` for `false`; textos da UI em PT-BR; contador do ping começa em 0.
- Spec e Plan aprovados.

Após o Gate 2 (usuário, 2026-10-24):
- OQ-44 [técnica] Runtime de containers sem Docker Desktop → Docker Engine (docker-ce + compose plugin) instalado no Ubuntu 26.04 do WSL2 (systemd já ativo), `dockerd` escutando também em `tcp://127.0.0.1:2375`; o repo continua no Windows e o docker CLI do Windows fala com o engine por um contexto Docker (`wsl-engine`). O Docker Desktop continua instalado só para fornecer o CLI e nunca é iniciado. Alternativas descartadas: tudo dentro do WSL, Podman, Rancher Desktop. Risco aceito: porta TCP do Docker sem autenticação, restrita a localhost.
- OQ-45 [técnica] Manter o engine no ar: o WSL desliga a distro Ubuntu quando nenhum processo do Windows está ligado a ela, e o `dockerd` desliga junto → decidido: script manual `infra/scripts/docker-up.ps1` (Windows PowerShell 5.1) que inicia, oculto, um `wsl.exe -d Ubuntu --exec sleep infinity` só se ainda não houver um, espera até 60 s o `docker --context wsl-engine info` responder e imprime uma linha clara de sucesso ou falha. Alternativa descartada: tarefa agendada no logon. No Plan: T-46 (trilha I), ligada ao CA-6, e pré-requisito no README (T-45).
- OQ-46 [técnica] Bind mounts do compose com o engine no WSL (achado da trilha I na implementação) → symlink `/c -> /mnt/c` na distro Ubuntu, recriado de forma idempotente pelo `infra/scripts/docker-up.ps1`, e `COMPOSE_CONVERT_WINDOWS_PATHS=1` como **variável de usuário do Windows** (`setx`, feito pelo thread principal). O `docker-up.ps1` só avisa se ela faltar. Os scripts `stack:*` não mudam. Testes com `docker run -v` usam caminho `/c/...`. Usuário, 2026-10-24.
- Achado da implementação (sem decisão nova; complementa a OQ-44): o WSL precisa estar em modo de rede `mirrored` (`%USERPROFILE%\.wslconfig`, `networkingMode=mirrored`). Em modo NAT, o CLI do Windows recebia stdout vazio de `docker run` e `docker exec`. As faixas TCP 56946-57545 e 50000-50059 são excluídas pelo Windows, por isso os containers de integração usam 58017 e 58018 (Plan, "Desvios da implementação").
