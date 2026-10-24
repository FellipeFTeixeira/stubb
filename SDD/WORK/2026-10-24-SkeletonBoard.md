---
feature: Skeleton
plan: SDD/SPEC/2026-10-24-SkeletonPlan.md
---

# Skeleton — Board

Memória compartilhada dos implementers paralelos. Cada implementer lê este arquivo antes de cada tarefa e escreve aqui ao concluir uma tarefa, ao expor ou alterar uma interface, ao descobrir algo e ao travar.
Regras de escrita: cada agente edita só a linha da sua trilha na tabela e a seção `## Trilha <letra>` dele; nas seções comuns só acrescenta entradas (nunca apaga nem reescreve entrada de outro agente). Edições pontuais, nunca reescrever o arquivo inteiro.

## Trilhas

Preenchida pelo thread principal ao disparar cada onda.

| Trilha | Onda | Agente | Status | Tarefa atual | Arquivos donos |
|---|---|---|---|---|---|
| F — Fundação | 0 | a6669165c5147f6cd | concluída | — | ver Plan, "Trilhas e ondas" |
| C — Contratos | 1 | a468a9cee287f85dd | concluída | — | `libs/contracts/src/**` |
| I — Infra | 1 | ac6b29b585cab2961 | concluída | — | `Dockerfile`, `.dockerignore`, `infra/**` |
| W — write-service | 2 | a61ba04249fad56ad | concluída | — | `apps/write-service/src/**`, `apps/write-service/test/**` |
| P — projector | 2 | ac046549299df652b | em andamento | T-27 | `apps/projector/src/**`, `apps/projector/test/**` |
| R — read-service | 2 | a6c292b9db3976338 | em andamento | T-31 | `apps/read-service/src/**`, `apps/read-service/test/**` |
| U — web | 2 | a9e5c10102e844cd8 | concluída | — | `apps/web/src/**` (exceto arquivos da F) |
| X — Integração | 3 | a73441213f03fb64d | em andamento | T-39 | ver Plan, "Trilhas e ondas" |

## Ambiente (thread principal, 2026-10-24)

- Node `v24.22.1`, pnpm `12.15.0` (corepack, shims em `%APPDATA%\npm`).
- Docker Engine 29.9.2 no Ubuntu 26.04 do WSL2, Compose v5.6.1 no WSL e v5.1.4 no CLI do Windows. CLI do Windows no contexto `wsl-engine` (`tcp://127.0.0.1:2375`). Docker Desktop nunca é iniciado.
- Portas publicadas por containers chegam ao `localhost` do Windows (testado com nginx em 18080 → 200).
- [main, após a onda 0] `networkingMode=mirrored` ativado em `%USERPROFILE%\.wslconfig`. Isso **resolveu** o stdout vazio de `docker run`/`docker exec` relatado pela F: agora a saída chega normal ao shell, e as portas continuam no `localhost` do Windows. Com mirrored, as portas dos containers disputam espaço com serviços do Windows (5432 segue ocupada pelo Postgres nativo).
- A distro Ubuntu desliga sem processo Windows ligado a ela, e o `dockerd` cai junto. Se `docker info` der "connection refused", rodar: `Start-Process -WindowStyle Hidden wsl.exe -ArgumentList '-d','Ubuntu','--exec','sleep','infinity'`.

## Interfaces publicadas

- **Cliente Kafka (T-1, trilha F):** `@confluentinc/kafka-javascript@1.11.0`. Import: `import * as mod from '@confluentinc/kafka-javascript'; const { Kafka } = mod.KafkaJS ?? mod.default.KafkaJS;` (o named export `KafkaJS` existe, namedImport=true). Config: `new Kafka({ kafkaJS: { clientId, brokers } })`; consumer `kafka.consumer({ kafkaJS: { groupId, fromBeginning: true, autoCommit: false } })`; `commitOffsets([{ topic, partition, offset: String(BigInt(message.offset) + 1n) }])`. kafkajs NÃO é necessário (T-2 dispensada).

- **`@stubb/contracts` pronto (T-9/T-10, trilha C):** exports conforme o Plan, "Interfaces entre trilhas". Consumo: compilar antes com `pnpm --filter @stubb/contracts build` (gera `dist/`), depois `import { ... } from '@stubb/contracts'`. `createEventEnvelopeSchema` é genérica (literais preservados).

## Log

- [F] T-1 concluída: prova do cliente Kafka OK.
- [F] T-3 a T-8 concluídas (E2 pronta): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm --filter @stubb/web build` com exit 0; `nest build` dos 3 apps também. **F concluída.** Todas as dependências do Plan estão instaladas; nenhuma outra trilha deve rodar `pnpm add`. Scaffolds (`main.ts`, `app.module.ts`, `health/health.controller.ts` nos 3 apps; `libs/contracts/src/index.ts` com `export {};`; `apps/web/src/main.tsx`; `e2e/src/.gitkeep`) passam para as trilhas donas.

- [C] T-9, T-10 e T-11 concluídas: `build`, `typecheck`, `test` (23 testes) e `lint` do contracts com exit 0. **C concluída.**

- [I] T-12 a T-17 e T-46 concluídas (E4 pronta). **I concluída.** Ver `## Trilha I`.
- [I] Correção pós-verificação: `infra/mongo/init-replica-set.js` ganhou `/* global rs, db, sleep, print */` (globais do mongosh); `pnpm lint` na raiz (eslint + prettier) agora com exit 0.

- [main] Portas dos containers isolados: 57017/57018 caem na faixa excluída do Windows. P usou 58017 e R usou 58018; os dois testes leem `MONGO_TEST_URL`. O default do projector continua em 57017 (quebrado neste host); a trilha X deve trocar para 58017 e alinhar o Plan e o README.
- [main] Para a trilha X: o `apps/web/src/test/setup.ts` (da F) não faz `cleanup` do Testing Library, e por isso a U pôs `afterEach(cleanup)` em cada teste de componente. Se a X mover o `cleanup` para o `setup.ts`, deve tirar as cópias dos testes.

## Bloqueios e dúvidas

- (nenhum)

## Descobertas para o napkin

- [W] O Bash tool falha com "unexpected EOF" em comandos com muitos heredocs `<<'EOF'` longos (nada roda); usar a ferramenta Write para criar vários arquivos. O shell Bash também não persiste `export` entre chamadas.
- [W] ESLint type-checked (`no-unsafe-*`) reclama de `res.body` do supertest e de `getHttpServer()` (any); use helpers tipados (`api(ctx)`, `body<T>(res)`) e `dataSource.query<T>()` em vez de `as`. Python não existe no host.

- [R] No Windows com WSL mirrored, a faixa 56946-57145 (e 50000-50059) está reservada pelo Hyper-V: containers não publicam portas nela (ex.: 57018, 57017). Conferir com `netsh int ipv4 show excludedportrange protocol=tcp` e usar 58xxx.

- [P] Portas 56946-57245 estão no excluded port range do Windows (`netsh int ipv4 show excludedportrange protocol=tcp`): docker falha com "address already in use" em 57017/57018. Usar outra porta (ex. 58017) e parametrizar a URL por env.
- [P] No Bash tool, scripts longos com muitos heredocs falharam com "unexpected EOF"; criar arquivos com a ferramenta Write.

- [F] Neste ambiente, o stdout de `docker run`/`docker exec` (sem `-d`) chega vazio ao shell das ferramentas (contexto `wsl-engine`); exit code funciona. Para ler a saída: rodar sem `--rm` e usar `docker logs <nome>`.
- [F] `pnpm install` acrescentou `minimumReleaseAgeExclude: [react-hook-form@7.91.0]` ao `pnpm-workspace.yaml` (política de idade mínima de release do pnpm 12). Não mexer.
- [F] O `shadcn@4.22.1` (preset nova) gerou `src/lib/utils.ts` como `export { cn } from "cn"` e adicionou ao web: `cn@0.5.0`, `class-variance-authority`, `lucide-react`, `radix-ui`, `tw-animate-css`, `@fontsource-variable/geist`, `shadcn` (todas exatas). `src/index.css` precisou existir com `@import "tailwindcss"` antes do `shadcn init`. Hoje `main.tsx` não importa `index.css`: a trilha U deve importá-lo.
- [F] Prettier reformata os `package.json` (arrays em várias linhas); rodar `pnpm exec prettier --write` nos arquivos que criar. ESLint 10 com `reactHooks.configs.flat.recommended` funcionou sem fallback.

- [I] Engine no WSL + compose do Windows: bind mounts relativos falham (`invalid volume specification: 'C:\Users\...'`). Solução (decidida pelo usuário): variável de usuário `COMPOSE_CONVERT_WINDOWS_PATHS=1` (path vira `/c/Users/...`) + symlink `/c -> /mnt/c` na distro (recriado de forma idempotente por `docker-up.ps1`). Sem o symlink o docker cria diretório vazio em `/c/...` e o mount vira diretório. `docker run -v` direto: usar `/mnt/c/...` ou `/c/...`, não `$(pwd -W)`. Build de imagem (context via tar) não é afetado.
- [I] No Git Bash, `wsl ... ln -s /mnt/c /c` sofre conversão de path; usar `MSYS_NO_PATHCONV=1`. Heredoc aninhado (`$(cat <<JSON`) dentro de heredoc no Bash tool quebra o parse; criar arquivos com a ferramenta Write.

## Trilha F

- T-1: `PROOF OK lib=@confluentinc/kafka-javascript namedImport=true` (node:24.22.1-trixie-slim + apache/kafka:4.3.2, exit 0). Containers, rede, imagem e diretório temporários removidos. T-2 não executada.
- T-3 a T-8 concluídas. Ver Log.

## Trilha C

- T-9, T-10, T-11 concluídas. Arquivos: `src/index.ts`, `src/diagnostics/{constants,http,events}.ts`, `src/events/envelope.ts`, `src/http/constants.ts`, `src/shared/schemas.ts` e testes `src/diagnostics/{http,events}.test.ts`.

## Trilha I

- T-12: `Dockerfile` e `.dockerignore` criados. `docker build --target deps -t stubb-check-deps .` exit 0 (pnpm fetch/install offline OK); imagem removida. Targets de app ficam para a X (T-39).
- T-13: `infra/compose.yaml`. `docker compose config --quiet` exit 0. Os init (`mongo-init`, `kafka-init`, `connect-init`) montam os scripts por bind relativo, por isso dependem de `COMPOSE_CONVERT_WINDOWS_PATHS=1` (ver Descobertas).
- T-14: scripts criados; `bash -n` e `sh -n` exit 0. Execução real fica para a X (T-39).
- T-15: `nginx -t` com `nginx.prod.conf` e `nginx.dev.conf`: `test is successful` (com `-v /mnt/c/...`). Nota para X: testes com `$(pwd -W)` precisam de caminho `/c/...`.
- T-16: `infra/compose.dev.yaml`; `config --quiet` com os dois arquivos exit 0.
- T-17: `curl` existe em `quay.io/debezium/connect:3.7.0.Final` (`/usr/bin/curl`); healthcheck do `connect` mantido com curl.
- T-46: `infra/scripts/docker-up.ps1`. Teste: `wsl --terminate Ubuntu` (0 keepalives) -> script: "keepalive iniciado", OK, exit 0 -> `docker info` exit 0 -> script de novo: "keepalive ja ativo". O keepalive aparece como 2 processos `wsl.exe` (pai + filho, mesma linha de comando): é um keepalive lógico só. O script recria `/c -> /mnt/c` e imprime WARNING se a variável de usuário `COMPOSE_CONVERT_WINDOWS_PATHS` não for 1 (não a define).
- Para X: scripts `stack:*` da raiz não precisam mudar (variável é de usuário). `prettier --check .` passa com `infra/` (YAMLs formatados pelo prettier, aspas simples).
- Nenhum container, rede ou imagem de teste deixado.

## Trilha W

- T-18 a T-26 concluídas (E5 pronta). `build`, `lint`, `typecheck`, `test` (15 unit) e `test:integration` (19, contra stubb-it-postgres-write:55432) com exit 0. Container removido. **W concluída.**
- Migration inicial: `src/database/migrations/1792869381065-InitialSchema.ts`; runner `dist/database/migrate.js` (idempotente) para o `db-migrate`.
- Desvio mínimo do Plan: `IdempotencyService` usa `manager().queryRunner.query(sql, params, true)` em vez de `manager().query(...,true)`, porque `EntityManager.query` do TypeORM 1.1.2 não aceita o 3º argumento (resultado estruturado só no QueryRunner). Comportamento idêntico.
- Para X: erros de domínio têm formato `{ statusCode, message, error }` (404 `Ping not found`, 409, 422); 400 de validação `{ message: "Validation failed", issues }`.

## Trilha P

- T-27 a T-30 concluídas. P concluída: lint, typecheck, test (14), test:integration (5, Mongo isolado) e build com exit 0. Formatos de pings e processed_events exatamente como no Plan (sem divergência para R). Import Kafka: named `import { KafkaJS } from '@confluentinc/kafka-javascript'` compila e tipa.
- Desvio de ambiente: a porta 57017 está no excluded port range do Windows (faixas 57046-57145 e 57146-57245) e o docker falha ao publicá-la. Usei 58017 só localmente; o teste de integração lê `MONGO_TEST_URL` (default do Plan: 57017). R pode ter o mesmo problema com 57018 (também no range).

## Trilha R

- T-31, T-32, T-33 concluídas. `lint`, `typecheck`, `test` (13) e `test:integration` (5) do read-service com exit 0. **R concluída.**
- Container `stubb-it-mongo-read` usou a porta **58018**, não 57018: 57018 está em faixa reservada do Windows (excludedportrange 56946-57145), `docker run` falha com 'address already in use'. Teste de integração lê `MONGO_TEST_URL` (default `mongodb://localhost:58018/?directConnection=true`, como a trilha P). Container removido.
- Formato lido de `pings`: `{ _id: string, label, count, version, createdAt: Date, updatedAt: Date }`, conforme o Plan. Nenhuma divergência com P.

## Trilha U

- T-34 a T-38 concluídas. `pnpm --filter @stubb/web lint`, `typecheck`, `test` (15 testes) e `build` com exit 0. **U concluída.**
- `data-testid` todos conforme o Plan: `create-ping-label-input`, `create-ping-submit`, `create-ping-label-error`, `ping-label`, `ping-count`, `ping-version`, `ping-sync-status`, `increment-ping`, `command-error`, `latency-history` (ul), `latency-entry` (button dentro de li, com `data-ping-id`).
- Para X: `ping-label/count/version` mostram `—` até a projeção chegar; `ping-sync-status` vale `aguardando projeção` enquanto há espera para o ping selecionado e `sincronizado` depois. O `increment-ping` fica desabilitado sem ping selecionado e durante o POST. Chamadas à API usam URL relativa (`/api/...`), então dependem do gateway na 8080.
- Arquivos novos fora do Plan: `src/test/render.tsx` (helpers de teste), `src/lib/clock.ts` (`nowMs`, contorna a regra `react-hooks/purity`), `src/features/diagnostics/mutation-retry.ts`.
- Vitest sem globals: testes de componente precisam de `afterEach(cleanup)` explícito (o `setup.ts` da F não faz).

## Trilha X

- T-39: `pnpm stack:up` exit 0; 7 serviços healthy, 4 one-shots `Exited (0)`; conector e task `RUNNING`. Portas 8080/5433/27017/9094/8083/8081 fora das faixas excluídas.
- T-40/T-41/T-42: `pnpm test:e2e` (17 testes de API + replay + Playwright) e `pnpm replay` com exit 0. CA-19/20 via consumer do host em localhost:9094.
- T-43: `stack:dev` ok. Alteração em `/health` recompilou no container (sem rebuild); HMR do Vite aplicou a mudança em `diagnostics-page.tsx`; Kafbat (8081) lista `diagnostics.events` (3 partições) e o conector `stubb-outbox`. Alterações desfeitas.
- T-44/T-45: `.github/workflows/ci.yml`, ADR 0009, overview, ADR 0008 e README. `pnpm install --frozen-lockfile`, `lint`, `typecheck` e `test` exit 0.
- R-4 (`docker stats`, prod): ~1,8 GiB nos containers (connect 830 MiB, kafka 520, mongo 227, postgres 83, write 56, projector 58, read 52, gateway 10). Dev: ~3,4 GiB (web 579, connect 585, kafbat 445, kafka 446, write 372, read 327, projector 291, mongo 278). VM do WSL: 6,9 GB.
- Stack derrubada com `down -v` ao final.
- [X] T-39 a T-45 concluídas. **X concluída.** Ver `## Trilha X`.
- [X] Correções em arquivos de outras trilhas (a pedido do thread principal): `apps/projector/test/integration/ping-projection.int.test.ts` (default 57017 -> 58017); `apps/web/src/test/setup.ts` (agora faz `afterEach(cleanup)`) e remoção das cópias em `create-ping-form.test.tsx` e `diagnostics-page.test.tsx`; `Dockerfile` (trilha I): target `dev` instala `procps`.

- [X] Descoberta: o Vitest define `BASE_URL='/'` no ambiente; o pacote e2e lê `E2E_BASE_URL` (não `BASE_URL`). O `localhost` do host resolve também para `::1`, onde a porta 9094 não responde; o cliente Kafka do e2e usa `'broker.address.family': 'v4'`. O target `dev` precisava de `ps` (procps) porque `nest start --watch` mata o processo anterior com tree-kill; sem isso, cada recompilação dava EADDRINUSE.
