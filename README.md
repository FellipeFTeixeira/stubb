# Stubb

Site de venda de ingressos, no estilo Ticketmaster ou Guichê Web, construído para estudo e sem fins lucrativos. O objetivo principal é entender **CQRS na prática**. O secundário é aprender as regras de negócio que tornam ticketing difícil.

## Por que ticketing

Venda de ingressos expõe os problemas que justificam separar escrita e leitura:

- **Carga desigual.** Milhares de pessoas navegam pela vitrine e pelo mapa de assentos, e poucas compram. A leitura precisa escalar, e a escrita precisa estar certa.
- **Consistência forte na escrita.** Um mesmo assento nunca pode ser vendido duas vezes, mesmo com várias pessoas tentando no mesmo segundo.
- **Uma leitura para cada tela.** Vitrine, mapa de assentos, "meus ingressos", painel do produtor e lista de check-in pedem formatos de dado diferentes.

A ideia central do projeto: **o read model serve para exibir, e o write model é a verdade.** O mapa pode mostrar como livre um assento que acabou de ser reservado. Nesse caso o lado de escrita rejeita a compra, e esse é o comportamento correto.

## Arquitetura

```
Cliente (React + Vite)
  └─► Nginx
        ├─ GET ──────────► read-service ──► MongoDB
        └─ POST/PUT/... ─► write-service ─► PostgreSQL (domínio + outbox)
                                               │ WAL (só a tabela outbox)
                                               ▼
                                     Debezium (Outbox Event Router)
                                               ▼
                                             Kafka
                                               ├─► projector ──► MongoDB
                                               └─► write-service (sagas)
```

- O **write-service** recebe commands, aplica as regras nos agregados e grava o estado e o evento de domínio na mesma transação, usando a tabela `outbox`.
- O **Debezium** lê do WAL do PostgreSQL apenas a tabela `outbox` e publica cada evento no Kafka, usando o ID do agregado como partition key. Assim não há dual-write nem polling.
- O **projector** consome os eventos e monta read models desnormalizados no MongoDB, um por tela. Ele é idempotente e qualquer read model pode ser reconstruído por replay.
- O **read-service** expõe as queries lendo direto do MongoDB, sem lógica de domínio.

Algumas decisões que valem como regra:

- O write-service nunca consulta o MongoDB para decidir algo.
- Um command devolve apenas ack, ID e versão, e uma query nunca altera estado.
- Concorrência é tratada com optimistic locking, e uma constraint única `(session_id, seat_id)` serve de última defesa.
- Read-your-writes: a query aceita `min_version` e espera a projeção alcançar a versão que o command devolveu.
- O vencimento de holds fica a cargo de um scheduler no write-service, porque o Kafka não tem mensagem atrasada.

O detalhamento está em [`docs/architecture/overview.md`](docs/architecture/overview.md), e o porquê de cada escolha está nos [ADRs](docs/architecture/adr/).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | TypeScript, Node.js, NestJS com `@nestjs/cqrs` |
| Frontend | React, Vite, React Router, TanStack Query, Zustand, Tailwind, shadcn/ui |
| Write store | PostgreSQL |
| Read store | MongoDB |
| Broker | Kafka (KRaft) |
| Propagação | Transactional Outbox + Debezium |
| Gateway | Nginx |

Os buses do `@nestjs/cqrs` funcionam só em memória. Outbox, retry, checkpoint e idempotência são construídos à mão, e essa construção faz parte do estudo.

## Domínio

Cinco bounded contexts, cada um com o nível de CQRS que o problema pede:

| Contexto | Responsabilidade | CQRS |
|---|---|---|
| Catalog | Eventos, locais, sessões, setores, lotes e preços | Leve |
| Inventory | Disponibilidade de assentos e pista, holds com prazo | Completo |
| Ordering | Pedido, pagamento e reembolso | Completo, com saga |
| Ticketing | Emissão, transferência e check-in | Completo |
| Identity | Usuários, CPF, papéis e autenticação | CRUD |

São vendidos ingressos de assento marcado e de pista. A linguagem do domínio está em [`docs/domain/glossary.md`](docs/domain/glossary.md).

## Estrutura

```
apps/
  write-service/   commands, agregados, outbox, sagas, scheduler
  read-service/    queries e SSE
  projector/       consumers Kafka que montam os read models
  web/             frontend
libs/
  contracts/       schemas Zod versionados (eventos, requests e responses: contrato público)
e2e/               E2E de API, replay do read model
docker-compose.yaml          stack base (imagens de produção)
docker-compose.override.yaml  sobreposição de dev, mesclada sozinha pelo `docker compose up`
infra/             Nginx, bootstrap do Kafka/MongoDB/Debezium, docker-up.ps1
docs/              arquitetura, ADRs, glossário, roadmap
SDD/               pesquisas, specs e planos de cada entrega
```

## Andamento

O projeto avança em fases, cada uma ligada a um conceito de CQRS: primeiro um walking skeleton ponta a ponta, depois catálogo, identidade, inventário com concorrência, compra com saga, emissão e check-in, pós-venda, Event Sourcing no contexto Ordering e, por fim, alta demanda. O status de cada fase está em [`docs/roadmap.md`](docs/roadmap.md).

## Como rodar

O código atual é o esqueleto da Fase 1: um módulo técnico `diagnostics`, com um agregado `Ping`, que atravessa o pipeline inteiro (command → PostgreSQL e outbox → Debezium → Kafka → projector → MongoDB → read-service → web). Ele não tem regra de negócio; serve para exercitar e testar o mecanismo. A página em `http://127.0.0.1:8080` cria pings, incrementa o contador e mostra, por ação, quanto tempo o read model levou para refletir a escrita.

### Pré-requisitos

- **Node 24.22.1** e **pnpm 12.15.0**, que o corepack instala a partir do `packageManager` (`corepack enable`). O `engineStrict` recusa versões menores de Node.
- **Docker Engine com Compose.** O ambiente de referência é Windows 11 com o engine instalado no Ubuntu do WSL2, sem Docker Desktop, e com o CLI do Windows apontando para ele pelo contexto `wsl-engine` (`tcp://127.0.0.1:2375`, só em localhost). Nesse ambiente:
  - o WSL desliga a distro quando nenhum processo do Windows está ligado a ela, e o `dockerd` cai junto. Antes de usar a stack, rode `powershell -NoProfile -ExecutionPolicy Bypass -File infra/scripts/docker-up.ps1`. O script mantém um `wsl.exe -d Ubuntu --exec sleep infinity` oculto, espera o engine responder e cria o symlink `/c -> /mnt/c` na distro, de que os bind mounts relativos do compose dependem;
  - esses bind mounts também exigem a variável de usuário `COMPOSE_CONVERT_WINDOWS_PATHS=1` (`setx COMPOSE_CONVERT_WINDOWS_PATHS 1`; terminais já abertos não a enxergam). O script avisa se ela faltar;
  - o `docker run -v` direto deve usar caminhos `/c/...`, não `$(pwd -W)`;
  - o modo de rede do WSL é `mirrored` (`networkingMode=mirrored` em `%USERPROFILE%\.wslconfig`). No modo NAT, o stdout de `docker run` e `docker exec` chegava vazio ao CLI do Windows. No mirrored, uma porta publicada que conflite com um serviço do Windows não sobe, e o Windows reserva faixas dinâmicas de porta (confira com `netsh interface ipv4 show excludedportrange protocol=tcp`).

  Num Docker convencional (Linux, macOS), o script e as duas variáveis não são necessários.
- **Portas livres no host:** 8080, 8081, 8083, 9094, 27017 e 5433. O PostgreSQL da stack usa 5433 porque a 5432 costuma estar com um Postgres instalado no sistema.

### Subir a stack

```
pnpm install
pnpm stack:up
```

`stack:up` é `docker compose -f docker-compose.yaml up -d --build --wait` (o `-f` explícito ignora o override de dev): constrói as imagens de produção e só termina quando tudo está saudável. A ordem de subida é controlada por healthchecks e por quatro serviços que rodam uma vez (`db-migrate`, `kafka-init`, `mongo-init` e `connect-init`, que registra o conector Debezium). O web fica em `http://127.0.0.1:8080`, servido pelo Nginx, que também roteia `/api/*` por método: GET e HEAD vão para o read-service e o resto para o write-service.

| Porta | Serviço |
|---|---|
| 8080 | Nginx (web e API) |
| 5433 | PostgreSQL (write store) |
| 27017 | MongoDB (read store, replica set de um nó; conecte com `directConnection=true`) |
| 9094 | Kafka (listener externo) |
| 8083 | Kafka Connect (API REST do Debezium) |
| 8081 | Kafbat UI, só no modo dev |

**Acesse por `127.0.0.1`, não por `localhost`.** No Windows com o WSL em modo `mirrored`, `localhost` resolve primeiro para `::1` (IPv6), onde as portas publicadas pelo engine não respondem: o navegador fica esperando até estourar o tempo, às vezes de forma intermitente, e parece que a stack não subiu. Com `127.0.0.1` todas as portas da tabela abrem. Vale também para clientes SQL e para o MongoDB Compass (`127.0.0.1:5433` e `127.0.0.1:27017`, este com `directConnection=true`). Os clientes do repositório que rodam no host seguem usando `localhost`, e o cliente Kafka dos testes E2E força IPv4. Se a página não abrir, confira antes se há containers com `docker ps` e se o engine está de pé com `infra/scripts/docker-up.ps1`.

`pnpm stack:down` remove os containers e os volumes anônimos que as imagens do Mongo, do Kafka e do Connect criam a cada subida, e preserva os volumes nomeados com os dados. Para apagar também os dados: `docker compose down -v`.

Com a stack de produção no ar, os containers usam cerca de 1,8 GiB de memória (Kafka Connect ~830 MiB, Kafka ~520 MiB e MongoDB ~230 MiB são os maiores; o heap das JVMs é limitado no compose).

### Desenvolvimento

```
pnpm stack:dev
```

Usa `docker-compose.yaml` mais `docker-compose.override.yaml` (o Compose mescla os dois sozinho, então `docker compose up` já sobe o dev) com `up --build --watch`: os apps rodam com `nest start --watch` e o Vite roda atrás do Nginx, com HMR pelo WebSocket. O Compose Watch copia `src/` para dentro dos containers (não há bind mount do código, porque o NTFS não propaga eventos de arquivo para o container) e refaz a imagem quando mudam manifests, lockfile ou `libs/contracts`. No modo dev os containers usam cerca de 3,4 GiB (cada app Nest em watch e o Vite passam de 300 MiB). A Kafbat UI, em `http://127.0.0.1:8081`, mostra o tópico `diagnostics.events` e o conector `stubb-outbox`.

### Testes e qualidade

| Comando | O que faz |
|---|---|
| `pnpm lint` | ESLint (type-checked) e Prettier |
| `pnpm typecheck` | `tsc` em todos os pacotes |
| `pnpm test` | testes unitários de todos os pacotes, sem Docker |
| `pnpm test:e2e` | E2E de API (Vitest), replay e Playwright, no host, contra a stack de produção (`pnpm stack:up` antes) |
| `pnpm replay` | reconstrói o read model a partir do Kafka |

O CI roda `pnpm install --frozen-lockfile`, `lint`, `typecheck` e `test` em push e pull request; os E2E ficam de fora porque precisam da stack inteira.

Os testes de integração de cada app (`pnpm --filter @stubb/<app> test:integration`) usam um banco isolado, não a stack:

```
# write-service
docker run -d --rm --name stubb-it-postgres-write -e POSTGRES_USER=stubb -e POSTGRES_PASSWORD=stubb -e POSTGRES_DB=stubb -p 55432:5432 postgres:18.6-trixie

# projector (MongoDB em replica set; MONGO_TEST_URL troca a URL)
docker run -d --rm --name stubb-it-mongo-projector -p 58017:27017 mongo:8.0.34 --replSet rs0 --bind_ip_all
docker exec stubb-it-mongo-projector mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"

# read-service
docker run -d --rm --name stubb-it-mongo-read -p 58018:27017 mongo:8.0.34
```

As portas 58017 e 58018 evitam as faixas dinâmicas reservadas pelo Windows (57017 e 57018 caíam nelas). Pare cada container com `docker stop <nome>` ao terminar.

### O que o `pnpm replay` faz

Para o projector, apaga as coleções `pings` e `processed_events` do MongoDB, reseta o offset do grupo `projector` para o início do tópico e sobe o projector de novo. Como o tópico tem retenção infinita e o documento é determinístico (`createdAt` e `updatedAt` vêm do `occurredAt` dos eventos), o read model volta idêntico. Um dos E2E prova isso comparando o documento antes e depois.

## Como o trabalho é feito

Toda implementação passa por um fluxo de Spec-Driven Development. Primeiro vem uma pesquisa que levanta as dúvidas em aberto. Essas dúvidas são respondidas antes de existir uma spec, e nenhuma regra de negócio é presumida. Depois vêm a spec e o plano, que precisam ser aprovados antes da implementação. Os artefatos de cada entrega ficam em [`SDD/`](SDD/).
