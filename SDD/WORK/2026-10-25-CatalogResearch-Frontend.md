---
feature: Catalog
fase: 2 — Catalog
area: Frontend (apps/web)
date: 2026-10-25
status: draft
---

# Catalog — Research parcial: Frontend

Pesquisa parcial da área **Frontend** (`apps/web`), para consolidação com as parciais de Domínio, Backend e ReadSide. Dúvidas numeradas como `OQ-Frontend-n`. O que pertence a outra área aparece em "Dependências com outras áreas" e não é decidido aqui.

## Objetivo

Entregar no web as três superfícies da Fase 2 (`docs/roadmap.md:13`):

1. **Vitrine**: lista de eventos lida do read model `event_listing`.
2. **Página do evento**: detalhes do evento, local, sessões, setores e lotes/preços.
3. **Área do produtor**: formulários de cadastro de evento, local, sessão, setores e lotes, sem login (produtor = usuário seed).

Conceito de CQRS exercitado no front:

- **Primeiro fluxo real command → evento → projeção visto pelo usuário.** O formulário do produtor envia um command ao write-service (via Nginx, método não-GET), recebe só `{ id, version }` e precisa ler o resultado num read model eventualmente consistente. É aqui que o padrão de read-your-writes da Fase 1 (`min_version`) sai do diagnóstico e entra num fluxo de negócio.
- **Read model desnormalizado servindo uma tela.** A vitrine e a página do evento leem documentos prontos para exibir; o front não junta evento + local + sessão + lote (isso é trabalho do projector). O cache do TanStack Query é mais um read model, ainda mais atrasado, e nunca vira fonte de verdade (ADR 0008).
- **Separação de estado do servidor e do cliente.** Filtros da vitrine, etapa de formulário e estado "aguardando projeção" são estado do cliente; dado de evento é estado do servidor.

## Escopo

**Dentro (área Frontend):**
- Rotas e layout do web para vitrine, página do evento e área do produtor, com página de erro/404.
- Vitrine: listagem de eventos com estados de carregamento, erro e vazio; busca, filtros, ordenação e paginação conforme decisão (OQ-Frontend-7).
- Página do evento: dados do evento, local, sessões, setores e lotes conforme decisão (OQ-Frontend-8); 404 de evento inexistente.
- Área do produtor: formulários com React Hook Form + schemas Zod de `libs/contracts`, `Idempotency-Key` em todo command, tratamento de `400`/`404`/`409`/`422`/rede/`5xx`, espera pela projeção com `min_version` antes de mostrar o resultado.
- Cliente HTTP e hooks compartilhados (commands, queries, read-your-writes), extraídos do código de diagnóstico (OQ-Frontend-4).
- Formatação pt-BR de datas e valores monetários.
- Acessibilidade dos formulários e das listas (labels, `aria-invalid`, mensagens de erro anunciadas, foco, `aria-live` no status de sincronização).
- Testes: Vitest + RTL para api, hooks, formulários e páginas; Playwright para vitrine, página do evento e fluxo do produtor contra a stack de produção.
- Manter a tela de diagnóstico funcionando (é o smoke test permanente do pipeline, ADR 0009, "Consequências").

**Fora (área Frontend):**
- Login, JWT, papéis, proteção de rota (Fase 3).
- Mapa de assentos, disponibilidade, hold, botão de compra funcional, SSE (Fase 4).
- Carrinho, checkout, meia-entrada, taxa de conveniência, limite por CPF (Fase 5).
- Upload de imagens (salvo decisão contrária em OQ-Frontend-5).
- Dashboard de vendas do produtor (Fase 7).
- Internacionalização além de pt-BR.

## Mapeamento da codebase

### Estrutura atual de `apps/web`

| Caminho | Papel hoje | Reaproveitamento na Fase 2 |
|---|---|---|
| `apps/web/src/main.tsx:9-15` | `StrictMode` + `QueryClientProvider` + `RouterProvider` | Mantém. |
| `apps/web/src/app/router.tsx:4` | `createBrowserRouter` (data mode do React Router 8) com **uma rota só: `/` → `DiagnosticsPage`** | Precisa de layout raiz, rotas novas e `errorElement`. A vitrine provavelmente disputa o `/` com o diagnóstico (OQ-Frontend-1). É arquivo compartilhado entre trilhas: precisa de dono único no Plan. |
| `apps/web/src/app/query-client.ts:3` | `new QueryClient()` sem `defaultOptions` (queries com retry padrão de 3; `usePing` desliga com `retry: false`) | Avaliar defaults globais (ex.: `retry` só para rede/5xx) ao criar as queries do catálogo. |
| `apps/web/src/api/diagnostics.ts:11-19` | `ApiError(status, body)` | Genérico; hoje mora no módulo de diagnóstico. |
| `apps/web/src/api/diagnostics.ts:21-42` | `readBody` e `postCommand` (POST com `Content-Type` + `Idempotency-Key`; exige `202`; valida a resposta com `CommandAcceptedSchema`) | Genérico. Os commands de catálogo podem usar o mesmo helper. Se houver commands com `PUT`/`PATCH`/`DELETE` (edição, OQ-Frontend-12), o helper precisa aceitar o método. |
| `apps/web/src/api/diagnostics.ts:58-68` | `getPing` com `?min_version=` opcional; `200` → `found`, `404` → `not-found` | O mesmo formato serve para `GET` de detalhe do evento. |
| `apps/web/src/api/diagnostics.ts:70-87` | `describeCommandError` (mensagens PT-BR por status; a de `404` diz "Ping não encontrado", linha 77) | Precisa virar genérico ou ganhar uma versão por contexto. |
| `apps/web/src/features/diagnostics/mutation-retry.ts:5-12` | Retry de mutation só em `TypeError` (rede) ou `5xx`, até 2 vezes, 500 ms; a chave vai nas variáveis da mutation, então o retry reusa a mesma chave | Genérico; reaproveitar em todas as mutations de catálogo. |
| `apps/web/src/features/diagnostics/use-ping.ts:4-21` | Query com `minVersion` na `queryKey`, `placeholderData: keepPreviousData`, `refetchInterval` de 250 ms enquanto `minVersionReached === false` ou `404`; **sem limite de tentativas** | É o padrão de read-your-writes do cliente (ADR 0009, OQ-24 da Fase 1). Base para um hook genérico. Limite de espera: OQ-Frontend-15. |
| `apps/web/src/features/diagnostics/ping-panel.tsx:24-45` | Detecta "alcançou a versão" (`minVersionReached && !isPlaceholderData`), registra latência e semeia o cache da chave sem `min_version` (`setQueryData`, linha 43) para a tela não voltar a dado antigo | Mesmo cuidado vale ao navegar do formulário para a página do item criado. |
| `apps/web/src/pages/diagnostics-page.tsx:13-15` | Estado "pendente de projeção" e erro de command ficam em `useState` local, não no Zustand | Padrão a seguir: estado transitório de UI é local. |
| `apps/web/src/features/diagnostics/create-ping-form.tsx:27-30` | `useForm<Input, unknown, Output>` com `zodResolver(CreatePingRequestSchema)` (tipos `z.input`/`z.output` do contrato) | Padrão dos formulários do produtor. |
| `apps/web/src/features/diagnostics/create-ping-form.tsx:34-36` | Uma `Idempotency-Key` nova (`crypto.randomUUID()`) **por submit** | Ver OQ-Frontend-16 (reenvio manual após falha gera chave nova). |
| `apps/web/src/features/diagnostics/create-ping-form.tsx:48,61-65` | `noValidate`; erro do campo com `role="alert"` | Base de acessibilidade; o shadcn atual recomenda `Field`/`FieldError` com `data-invalid` e `aria-invalid` (ver abaixo). |
| `apps/web/src/stores/diagnostics-store.ts:18-24` | Zustand só com `selectedPingId` e histórico de latências | Nenhum estado de catálogo precisa de Zustand, a não ser que o fluxo do produtor seja um wizard com rascunho (OQ-Frontend-11, opção B). Filtros da vitrine ficam melhor na URL. |
| `apps/web/src/test/render.tsx:5-21` | `createTestQueryClient`, `wrapperFor`, `renderWithClient`, `jsonResponse` | **Não há wrapper de router.** Páginas com `useParams`/`Link`/`useSearchParams` precisam de um helper com `createMemoryRouter`. |
| `apps/web/src/test/setup.ts:1-5` | `jest-dom` + `afterEach(cleanup)` (Vitest sem globals, napkin 2026-10-24) | Mantém. |
| `apps/web/src/pages/diagnostics-page.test.tsx:12-57` | "Servidor falso" com `vi.stubGlobal('fetch')`, projeção atrasada com `setTimeout` | Padrão de teste de consistência eventual; com vários endpoints fica verboso (OQ-Frontend-21). |
| `apps/web/e2e/diagnostics.spec.ts:4` | Playwright abre `/` esperando o diagnóstico | Quebra se a vitrine ocupar `/` (OQ-Frontend-1). |
| `apps/web/playwright.config.ts:7` | `baseURL: 'http://localhost:8080'` | O napkin (2026-10-24, `localhost` → `::1` no Windows com WSL mirrored) recomenda `127.0.0.1`. `e2e/src/support/env.ts:3` tem o mesmo default. Ver Riscos e OQ-Frontend-22. |
| `apps/web/vite.config.ts:8-9` | Alias `@` → `src`; dev server em 5173 com HMR pela porta 8080 do Nginx | Mantém. |
| `apps/web/vitest.config.ts:7-12` | jsdom, `src/**/*.test.{ts,tsx}` | Mantém. |
| `apps/web/components.json:4,16-20` | shadcn estilo `radix-nova`, aliases `@/components/ui`, `@/lib`, `@/hooks` | Componentes novos via CLI do shadcn (OQ-Frontend-20). |
| `apps/web/src/components/ui/` | `button`, `card`, `input`, `label` | Faltam os de formulário (`field`, `textarea`, `select`/`native-select`), de lista e de estados (`skeleton`, `empty`, `spinner`, `alert`, `badge`, `pagination`...). |
| `apps/web/index.html:2` | `lang="pt-BR"` | Ok para leitores de tela. |
| `apps/web/package.json:13-30` | React 19.3.1, React Router 8.5.0, TanStack Query 5.104.5, Zustand 5.0.16, RHF 7.91.0, `@hookform/resolvers` 6.0.0, Zod 4.6.7, `radix-ui` 1.8.1, `lucide-react` | Nada de data/hora, máscara de moeda ou MSW instalado hoje. |
| `eslint.config.js:15,33-38` | `components/ui/**` fora do lint; regras do React Compiler (`react-hooks`) no web | `Date.now()`/`new Date()` no render para "lote vigente"/"evento passado" cai na regra `react-hooks/purity` (napkin 2026-10-24); usar `apps/web/src/lib/clock.ts` ou calcular fora do render. |

### Contratos consumidos (`libs/contracts`)

- `libs/contracts/src/index.ts:1-6`: export plano (`export *`) de todos os módulos. Nomes do catálogo não podem colidir entre si nem com os do diagnóstico.
- `libs/contracts/src/diagnostics/http.ts:13`: `CommandAcceptedSchema` (`{ id: uuid, version: int >= 1 }`) é genérico, mas mora no módulo `diagnostics`. Os commands de catálogo vão devolver o mesmo formato (regra 2).
- `libs/contracts/src/diagnostics/http.ts:35-36`: padrão de exportar `z.output` (request) e `z.input` (form) do mesmo schema. É o que permite o form usar o schema do contrato.
- `libs/contracts/src/shared/schemas.ts:3-5`: `uuidSchema`, `idempotencyKeySchema`, `minVersionSchema`.
- `libs/contracts/src/http/constants.ts:1-2`: `IDEMPOTENCY_KEY_HEADER`, `MIN_VERSION_QUERY_PARAM`.
- `libs/contracts/src/diagnostics/constants.ts:7-11`: rotas da API como constantes/funções no contrato. O catálogo deve seguir o mesmo padrão (rotas definidas pelo Backend e pelo ReadSide).
- `libs/contracts/package.json:8-13`: o web importa o `dist/` compilado. Mudou o contrato, precisa de `pnpm --filter @stubb/contracts build` antes do `typecheck`/`test` do web (os scripts da raiz já fazem isso, `package.json:11,13,14`); no dev em Docker, o Compose Watch faz `rebuild` quando `libs/contracts/src` muda (`docker-compose.override.yaml:106-113`).

### Borda (Nginx) e respostas de erro do backend

- `infra/nginx/nginx.prod.conf:3`: `GET`/`HEAD` em `/api/*` → read-service; o resto → write-service. Uma busca via `POST /search` exigiria exceção por prefixo (`docs/architecture/overview.md:29`). Se a busca for `GET` com query string, nada muda.
- `infra/nginx/nginx.prod.conf:15-18`: `try_files $uri $uri/ /index.html` já faz o fallback de SPA. Rotas profundas do React Router (`/eventos/:id`) funcionam ao recarregar. No dev, tudo fora de `/api/` vai para o Vite (`infra/nginx/nginx.dev.conf:16-22`).
- `apps/write-service/src/shared/http/zod-validation.pipe.ts:11-17`: `400` com corpo `{ message: 'Validation failed', issues: [{ path, message }] }`. Não há schema desse corpo em `libs/contracts`. O front poderia mapear `issues[].path` para `setError` do RHF.
- `apps/write-service/src/shared/http/domain-error.filter.ts:9-22`: só três erros de domínio mapeados (`409` concorrência, `404` agregado, `422` chave de idempotência), com corpo `{ statusCode, message, error }`. **Não existe erro de "regra de negócio violada"** com código estável (ex.: fim do lote antes do início, sessão no passado). O front não tem como mostrar mensagem específica por regra.
- `apps/read-service/src/diagnostics/get-ping.handler.ts:6-7`: a espera do `min_version` no servidor é de 100 ms em 100 ms até 3 s. Somada ao polling de 250 ms do cliente, o ciclo atual é: até 3 s no servidor, depois o cliente refaz indefinidamente.

### Documentação atual das bibliotecas (consultada em 2026-10-25)

- **shadcn/ui** (ui.shadcn.com/docs/forms/react-hook-form): a forma atual com RHF + Zod é `useForm` + `zodResolver` + `<Controller />` dentro de `Field`, `FieldLabel`, `FieldError`, `FieldDescription`, `FieldGroup`, `FieldSet`, `FieldLegend` (`@/components/ui/field`). Acessibilidade: `data-invalid` no `Field`, `aria-invalid` no controle, `FieldLabel htmlFor` = `id` do controle, `FieldError` só quando `fieldState.invalid`. Listas dinâmicas (ex.: vários lotes num setor) com `useFieldArray` e `field.id` como `key`. O catálogo atual tem `Field`, `Input Group`, `Native Select`, `Select`, `Textarea`, `Empty`, `Spinner`, `Skeleton`, `Pagination`, `Badge`, `Table`, `Alert`, `Breadcrumb`, `Separator`, `Calendar`, `Date Picker` e `Toast`. O Date Picker usa `Calendar` + `Popover` (traz dependência de calendário).
- **React Router 8.5.0** (reactrouter.com/start/modes): data mode (`createBrowserRouter`, já em uso) oferece `loader`, `action`, `useNavigation`, `useFetcher`, `errorElement`. Os loaders duplicariam o papel do TanStack Query se usados sem integração (OQ-Frontend-3).
- **TanStack Query v5** (guia de paginated queries): página/cursor na `queryKey` + `placeholderData: keepPreviousData` + `isPlaceholderData` para não piscar ao trocar de página. Mesmo mecanismo já usado em `use-ping.ts:12`.

### Onde a feature encaixa (proposta de estrutura, sujeita às OQs)

```
apps/web/src/
  app/router.tsx              # rotas + layout raiz + errorElement (dono único)
  app/layout.tsx              # header/nav, <Outlet/>
  api/http.ts                 # ApiError, readBody, postCommand/sendCommand, getJson (extraídos)
  api/catalog.ts              # funções por command/query do catálogo
  lib/read-your-writes.ts     # hook/queryOptions genéricos de min_version
  lib/format.ts               # Intl pt-BR: data/hora (com timeZone explícito) e BRL
  features/catalog/listing/   # vitrine
  features/catalog/event/     # página do evento
  features/catalog/organizer/ # formulários e telas do produtor
  pages/                      # páginas finas que compõem features
  test/render.tsx             # + helper com createMemoryRouter
apps/web/e2e/catalog-*.spec.ts
```

## Regras de negócio identificadas

Nenhuma regra de negócio do catálogo está confirmada. As regras abaixo são técnicas, herdadas de decisões anteriores, e valem para o front da Fase 2:

- Dado vindo da API vive só no cache do TanStack Query; nunca copiado para o Zustand (`CLAUDE.md`, ADR 0008 "Consequências"; RN-15 da Fase 1).
- Todo command vindo do cliente leva `Idempotency-Key` UUID (regra 9; ADR 0009, OQ-25 da Fase 1). O cliente gera uma chave por ação e a reusa nos retries (ADR 0009).
- Command responde só ack, `id` e `version` (regra 2); na Fase 1 o status é `202` (`apps/web/src/api/diagnostics.ts:40`).
- Read-your-writes: após um command, a query é refeita com `min_version` até alcançar a versão devolvida; o cliente refaz a cada 250 ms enquanto `minVersionReached` for `false` (regra 7; ADR 0008; ADR 0009, OQ-24 da Fase 1).
- Mutations repetem até 2 vezes, só em erro de rede ou `5xx`, com 500 ms de intervalo e a mesma chave (Spec da Fase 1, tabela de retry; `mutation-retry.ts:5-12`).
- Formulários e respostas são validados com os schemas Zod de `libs/contracts` (RN-8 da Fase 1; ADR 0009, OQ-5).
- Nesta fase o produtor é um usuário seed e não há login (`docs/roadmap.md:13`).
- Ingressos de assento marcado e de pista existem desde a Fase 4 (ADR 0007). O cadastro de setor provavelmente precisa distinguir os tipos (glossário: Setor "pode ser de assento marcado ou de pista"), mas como isso aparece no cadastro é decisão de Domínio (OQ-Frontend-24).

## Impacto CQRS

Visto do front (quem define nomes, payloads e rotas são Domínio, Backend e ReadSide; os nomes abaixo são ilustrativos).

| Tipo | Itens |
|---|---|
| Commands | Enviados pelos formulários do produtor via `POST` (ou outro método não-GET) → Nginx → write-service, todos com `Idempotency-Key`: criar local, criar evento, adicionar sessão, adicionar setor, adicionar lote; e edição/remoção se entrarem (OQ-Frontend-12). O front consome só `{ id, version }`. |
| Events | O front não consome eventos (sem SSE nesta fase). Indiretamente, a versão devolvida pelo command é o `aggregateVersion` do evento gerado. |
| Queries | Vitrine: listar eventos (`event_listing`) com parâmetros de busca/filtro/paginação (OQ-Frontend-7). Página do evento: obter um evento por ID (com `min_version` opcional). Produtor: listar os próprios eventos, listar locais (para escolher o local no form), obter evento para gestão (OQ-Frontend-13). |
| Aggregates | Nenhum no front. A granularidade dos agregados (Domínio) define quantos commands e formulários existem (OQ-Frontend-11) e como o read-your-writes funciona num documento que junta vários agregados (OQ-Frontend-14). |
| Read models | `event_listing` (roadmap). Possíveis read models adicionais para a página do evento e para o produtor: decisão do ReadSide. No cliente, o cache do TanStack Query é o último read model da cadeia. |
| Sagas / process managers | Não se aplica: o catálogo não tem fluxo entre contextos nesta fase, e o front não participa de sagas. |

## Dependências com outras áreas

O front não decide estes pontos; precisa deles definidos (e, quando for contrato, publicados em `libs/contracts`) antes de o Plan poder fixar telas e formulários.

**Domínio**
- D-Dom-1: campos de Evento, Local, Sessão, Setor e Lote, com obrigatoriedade, tamanhos e formatos. Eles definem os campos de cada formulário e o que a vitrine/página podem mostrar.
- D-Dom-2: granularidade de agregados e commands (um command por entidade? sessão/setor/lote dentro do agregado do evento?). Define o fluxo de cadastro (OQ-Frontend-11) e o read-your-writes (OQ-Frontend-14).
- D-Dom-3: existência de estado de publicação (rascunho/publicado/cancelado). Afeta vitrine (OQ-Frontend-6) e área do produtor (botão "publicar").
- D-Dom-4: edição e remoção nesta fase (OQ-Frontend-12).
- D-Dom-5: representação de dinheiro (ex.: centavos inteiros) e de data/hora da sessão (instante UTC + fuso do local? data/hora local?). Afeta OQ-Frontend-10, 18 e 19.
- D-Dom-6: regras de validação de lote (janela de datas, preço mínimo, quantidade, sobreposição) e de sessão (no passado?). As que dependem só do payload deveriam estar no schema Zod compartilhado (inclusive regras entre campos, com `refine`), para o form validar igual ao write-service; as que dependem do banco só existem no backend e voltam como erro (OQ-Frontend-17).
- D-Dom-7: definição de setor de assento marcado no cadastro (OQ-Frontend-24).
- D-Dom-8: nomes dos tipos no contrato. Um tipo exportado como `Event` colide com o tipo global `Event` do DOM no front (TS `lib.dom`); preferir nomes como `CatalogEvent`/`EventListingView`.

**Backend (write-service)**
- D-Back-1: rotas e métodos dos commands (constantes em `libs/contracts`, como `diagnosticsRoutes`).
- D-Back-2: contrato de erro (`400` com `issues`, erro de regra de negócio com código estável). OQ-Frontend-17.
- D-Back-3: como o produtor seed é identificado (OQ-Frontend-13).
- D-Back-4: `CommandAcceptedSchema` genérico fora de `diagnostics` (hoje em `libs/contracts/src/diagnostics/http.ts:13`) e status de sucesso (`202` como na Fase 1?).
- D-Back-5: `Idempotency-Key` obrigatória em todos os commands do catálogo (a regra 9 exige; confirmar que o Backend aplica igual à Fase 1).

**ReadSide (projector + read-service)**
- D-Read-1: queries, rotas e schemas de resposta: listagem da vitrine, detalhe do evento, listas do produtor, lista de locais.
- D-Read-2: contrato de paginação/busca/filtro (offset ou cursor; parâmetros; total). OQ-Frontend-7.
- D-Read-3: semântica de `min_version` em documento desnormalizado que agrega vários agregados (OQ-Frontend-14).
- D-Read-4: onde se calcula "lote vigente" e "evento passado". Valores dependentes do relógio não podem ser gravados pelo projector sem quebrar o replay determinístico (ADR 0009, Replay); o cálculo precisa ser na query (read-service) ou no front (OQ-Frontend-8).
- D-Read-5: `404` vs documento vazio para evento inexistente/não publicado.

**Infra**
- Só se a busca for `POST` (exceção no Nginx) ou se o Playwright mudar de host. Nada além disso.

## Riscos

- **Read-your-writes em documento desnormalizado.** O `min_version` da Fase 1 compara a versão de um documento com a versão de um agregado, e os dois são a mesma coisa (`Ping`). Se o documento do `event_listing` junta evento, local e sessões, e cada um é um agregado com versão própria, a versão devolvida por "adicionar sessão" não é comparável com uma versão única do documento. Sem uma semântica definida (OQ-Frontend-14), o front ou espera para sempre, ou mostra dado velho.
- **Espera sem fim.** O polling do cliente não tem limite (`use-ping.ts:13-18`). Com o projector parado (falha barulhenta proposital, ADR 0009), o formulário do produtor ficaria "aguardando projeção" para sempre (OQ-Frontend-15).
- **Formulário de edição preenchido com read model atrasado.** Se houver edição (OQ-Frontend-12), o form é preenchido com dado do read side, que pode estar atrás do write. O command com versão esperada deve devolver `409`, e a UI precisa recarregar e avisar. Bom exemplo de CQRS, mas é UX a desenhar.
- **Reenvio manual gera duplicata.** Com uma chave por submit (`create-ping-form.tsx:36`), se o command for gravado mas a resposta se perder depois dos 2 retries, um novo clique cria um segundo evento (OQ-Frontend-16).
- **Colisão de rota com o diagnóstico.** A vitrine em `/` quebra `apps/web/e2e/diagnostics.spec.ts:4` se o diagnóstico não mudar de rota no mesmo passo (OQ-Frontend-1).
- **Datas e fuso nos testes.** `Intl.DateTimeFormat` sem `timeZone` explícito usa o fuso da máquina; testes RTL e Playwright podem passar numa máquina e falhar em outra (ou no CI). Formatar sempre com `timeZone` explícito (OQ-Frontend-10).
- **Lint do React Compiler.** Calcular "vigente/passado" com `Date.now()` no render reprova em `react-hooks/purity` (napkin 2026-10-24).
- **Contrato não compilado.** O web consome `libs/contracts/dist`. Um implementer que rode só `pnpm --filter @stubb/web test` depois de mudar o contrato vê tipos antigos. Rodar o build do contrato primeiro (scripts da raiz já fazem).
- **Playwright e `localhost`.** `playwright.config.ts:7` usa `localhost:8080`; no host Windows com WSL mirrored, `localhost` resolve primeiro para `::1` e as portas do engine podem dar timeout (napkin 2026-10-24).
- **Dados acumulados na stack.** O E2E roda contra a stack de produção sem reset. A vitrine vai ter eventos de execuções anteriores; asserções do tipo "a lista tem N itens" ficam frágeis (OQ-Frontend-22).
- **Arquivos compartilhados entre trilhas.** `app/router.tsx`, `test/render.tsx`, `api/http.ts`, `components/ui/*` e `lib/format.ts` são usados por várias telas. No Plan, precisam de dono único ou ser feitos numa onda anterior.
- **Instalação de componentes shadcn.** O CLI do shadcn 4.x pode alterar `src/index.css` e `package.json` (napkin 2026-10-24). Instalar todos os componentes de uma vez, numa trilha só, antes das trilhas de tela.

## Open Questions

### OQ-Frontend-1 [técnica] Onde ficam a vitrine e o diagnóstico nas rotas, e como é o layout global?
- **Contexto:** hoje `/` é o diagnóstico (`router.tsx:4`), e o Playwright depende disso (`e2e/diagnostics.spec.ts:4`). O diagnóstico continua sendo o smoke test do pipeline (ADR 0009). Não existe layout (header/nav) nem página 404.
- **Opções:** A) vitrine em `/`; diagnóstico em `/diagnostics` (ou `/diagnostico`), com link discreto no rodapé; layout raiz com header (logo → vitrine, link "Área do produtor") e `errorElement` com 404. B) vitrine em `/eventos`; diagnóstico continua em `/`. C) vitrine em `/` e diagnóstico fora do menu, acessível só pela URL.
- **Recomendação:** A. A raiz de um site de ingressos é a vitrine; mover o diagnóstico custa uma linha no spec do Playwright.

### OQ-Frontend-2 [técnica] Idioma das URLs e identificador do evento na URL
- **Contexto:** a convenção de código é inglês, mas a URL é texto visível ao usuário. Slug legível exige regra de unicidade e geração no domínio (D-Dom-1).
- **Opções:** A) URLs em PT-BR com UUID: `/eventos/:eventId`, `/produtor/eventos/novo`, `/produtor/locais`. B) URLs em inglês com UUID: `/events/:eventId`, `/organizer/events/new`. C) A ou B com slug (`/eventos/show-x-sao-paulo`), dependendo do Domínio.
- **Recomendação:** A. O site é pt-BR, e o UUID evita uma regra de domínio nova (unicidade de slug) só por estética. Os nomes de arquivos e componentes continuam em inglês.

### OQ-Frontend-3 [técnica] Quem carrega os dados das telas: loaders do React Router ou TanStack Query?
- **Contexto:** o router já está em data mode (`createBrowserRouter`), que oferece `loader`. A Fase 1 busca tudo com TanStack Query nos componentes. Dois mecanismos de busca seriam dois caches.
- **Opções:** A) só TanStack Query nos componentes; o router cuida de rotas, layout e `errorElement`. B) loaders que chamam `queryClient.ensureQueryData` (pré-busca na navegação) e componentes que leem com `useQuery`/`useSuspenseQuery`. C) loaders puros com `useLoaderData`, sem TanStack Query nessas telas.
- **Recomendação:** A. Um cache só, que é o "read model do cliente" do ADR 0008; o polling de `min_version` já funciona com `refetchInterval`. B pode vir depois, se a navegação piscar.

### OQ-Frontend-4 [técnica] Extrair o cliente HTTP e o read-your-writes do diagnóstico para módulos compartilhados?
- **Contexto:** `ApiError`, `readBody`, `postCommand` e `describeCommandError` (`api/diagnostics.ts:11-87`), `shouldRetryCommand` (`features/diagnostics/mutation-retry.ts`) e o padrão de polling (`use-ping.ts`) são genéricos, mas moram no módulo de diagnóstico.
- **Opções:** A) extrair para `api/http.ts` e `lib/read-your-writes.ts`; o diagnóstico passa a usá-los, com o mesmo comportamento e os testes atuais passando. B) copiar para o catálogo e deixar o diagnóstico como está. C) extrair, mas não tocar no diagnóstico.
- **Recomendação:** A. Uma implementação só do padrão de consistência eventual no cliente, testada uma vez. O diagnóstico vira o primeiro consumidor e prova que a extração não mudou nada.

### OQ-Frontend-5 [negócio] O que o card da vitrine mostra?
- **Contexto:** depende dos campos do evento (D-Dom-1) e do que o `event_listing` desnormaliza (D-Read-1).
- **Opções:** A) nome do evento, nome do local + cidade, data/hora da próxima sessão (e "+N sessões" se houver mais) e "a partir de R$ X" (menor preço vigente). B) A + imagem/banner (exige upload ou URL de imagem no cadastro). C) só nome, local e data.
- **Recomendação:** A. Mostra o valor da desnormalização (local e preço dentro do documento do evento) sem trazer upload de arquivo para a fase.

### OQ-Frontend-6 [negócio] Quais eventos aparecem na vitrine?
- **Contexto:** sem estado de publicação, um evento aparece assim que é criado, mesmo sem sessão ou preço. Eventos com todas as sessões no passado também precisam de regra. Depende de D-Dom-3 e D-Read-4; o ReadSide pode levantar a mesma dúvida (deduplicar na consolidação).
- **Opções:** A) só eventos publicados com ao menos uma sessão futura. B) todos os eventos com ao menos uma sessão futura (sem publicação). C) todos os eventos cadastrados.
- **Recomendação:** A, se o Domínio adotar publicação; senão, B. Um evento sem sessão ou já encerrado na vitrine é um anúncio quebrado.

### OQ-Frontend-7 [negócio] Busca, filtros, ordenação e paginação da vitrine
- **Contexto:** o roadmap fala em "vitrine e busca" para o `event_listing` (`docs/architecture/overview.md:97`), mas não define o quê. Cada filtro vira índice e parâmetro de query no ReadSide (D-Read-2). O tamanho de página é um valor e precisa vir do usuário.
- **Opções:**
  - Busca: a) texto no nome do evento; b) nome + local/cidade; c) nenhuma nesta fase.
  - Filtros: i) cidade; ii) intervalo de datas; iii) categoria (exige campo no domínio); iv) nenhum.
  - Ordenação: data da próxima sessão crescente (única) ou escolha do usuário.
  - Paginação: 1) páginas numeradas (offset/limit, com total); 2) "carregar mais" (cursor); 3) sem paginação nesta fase. Tamanho de página: valor a definir.
- **Recomendação:** busca a) + filtro i) + ordenação fixa por próxima sessão + paginação 2 ("carregar mais" com cursor, `useInfiniteQuery`), com o tamanho de página definido pelo usuário. O estado de busca/filtro fica na URL (`useSearchParams`), não no Zustand: é compartilhável e sobrevive ao recarregar. A busca por nome também ajuda o E2E a achar o evento criado.

### OQ-Frontend-8 [negócio] Página do evento: quais lotes mostrar e quem decide qual está vigente?
- **Contexto:** lote é "faixa de preço de um setor válida por período ou até esgotar" (glossário). Esgotamento depende de vendas (Fases 4 e 5), então nesta fase só a data pode definir a vigência, se o Domínio adotar janela de datas (D-Dom-6). O "vigente" depende do relógio e não pode ser gravado pelo projector sem quebrar o replay (D-Read-4).
- **Opções (exibição):** A) por sessão → setor, só o lote vigente (nome, preço, "válido até"). B) por setor, todos os lotes com selo (encerrado / vigente / em breve). C) só o menor preço por setor.
- **Opções (cálculo):** a) o read-service calcula na query e devolve o lote vigente/status; b) o documento traz as janelas, e o front calcula com o relógio do navegador; c) o projector grava (descartada: não é determinística no replay).
- **Recomendação:** B + a. Mostrar a sequência de lotes ensina a "virada de lote", e calcular no read-service mantém o front sem regra de negócio e com uma fonte de "agora" (o servidor), não o relógio de cada navegador.

### OQ-Frontend-9 [negócio] A página do evento tem botão de compra nesta fase?
- **Contexto:** compra só existe a partir das Fases 4 e 5.
- **Opções:** A) sem botão. B) botão desabilitado "Vendas em breve". C) botão que leva a uma página "em construção".
- **Recomendação:** A. Não mostrar funcionalidade que não existe; o botão entra junto com o `HoldSeats` na Fase 4.

### OQ-Frontend-10 [negócio] Em que fuso as datas de sessão são exibidas?
- **Contexto:** o Brasil tem mais de um fuso. Depende de como o Domínio guarda a data/hora da sessão (D-Dom-5). Exibir sem `timeZone` explícito usa o fuso de quem abre a página, e o mesmo show mostraria horários diferentes para pessoas diferentes.
- **Opções:** A) sempre `America/Sao_Paulo`. B) fuso do local (o Local teria um campo de fuso). C) fuso do navegador.
- **Recomendação:** B, se o Domínio guardar o fuso no local; senão, A. Ingresso mostra o horário do lugar do evento. C é o comportamento padrão a evitar.

### OQ-Frontend-11 [negócio] Como é o fluxo de cadastro do produtor?
- **Contexto:** são cinco entidades (local, evento, sessão, setor, lote). A forma da UI depende da granularidade dos commands (D-Dom-2). Cada submit gera um command, uma versão e uma espera por projeção.
- **Opções:** A) telas separadas seguindo as entidades: "Locais" (lista + novo); "Meus eventos" (lista + novo); página de gestão do evento onde se adicionam sessões; em cada sessão, setores; em cada setor, lotes. Um submit = um command, com espera pela projeção antes de mostrar o item. B) wizard de várias etapas com rascunho no cliente (Zustand) e todos os commands enviados no final. C) um formulário único que envia um command só com tudo aninhado.
- **Recomendação:** A. Cada formulário corresponde a um command e mostra o ciclo command → `{ id, version }` → projeção → tela, que é o aprendizado da fase. B espalha uma operação de negócio em vários commands sem atomicidade (falha no meio deixa metade criada) e põe dado de negócio no Zustand. C depende de um agregado gigante.

### OQ-Frontend-12 [negócio] A área do produtor só cria ou também edita e remove?
- **Contexto:** o roadmap diz "cadastro". Edição traz o caso didático do formulário preenchido com read model atrasado + `409` (ver Riscos). Remoção traz a pergunta do que acontece com sessões e lotes. Depende de D-Dom-4.
- **Opções:** A) só criação nesta fase. B) criação + edição. C) criação + edição + remoção.
- **Recomendação:** B, se o Domínio aceitar. Edição exercita concorrência otimista vista pelo usuário (versão esperada no command, `409` → recarregar), o que prepara a Fase 4. Remoção pode esperar o cancelamento (Fase 7).

### OQ-Frontend-13 [técnica] Como o front identifica o produtor seed e quais queries a área do produtor usa?
- **Contexto:** sem login, alguém precisa dizer "quem é o produtor" (D-Back-3). A área do produtor precisa de listas (meus eventos, locais) e do detalhe para gestão, que podem não estar no `event_listing` (rascunhos, por exemplo) (D-Read-1).
- **Opções (identidade):** A) o front não envia nada; o write-service atribui tudo ao produtor seed. B) o front envia um `organizerId` fixo (constante de `libs/contracts`) no corpo. C) header `X-Organizer-Id` fixo.
- **Opções (leitura):** a) read models próprios do produtor (ex.: `organizer_events`, `venue_list`); b) `event_listing` com filtro por produtor, incluindo não publicados.
- **Recomendação:** A + a. Em A, a Fase 3 troca a origem da identidade (JWT) sem mudar o corpo dos commands. Em a, aplica-se "um read model por tela", e a vitrine pública nunca carrega dado de rascunho. A decisão final da leitura é do ReadSide.

### OQ-Frontend-14 [técnica] Como o front espera a projeção quando o documento junta vários agregados?
- **Contexto:** ver Riscos. Depois de "adicionar sessão", o command devolve a versão do agregado da sessão (ou do evento, conforme D-Dom-2). O documento lido pode ter versão própria ou guardar a versão de cada agregado de origem (D-Read-3).
- **Opções:** A) a query aceita `min_version` com o agregado de referência (ex.: `?min_version=3&aggregate_id=...`), e o documento guarda a versão de cada agregado de origem; o hook do front recebe `(aggregateId, version)`. B) cada agregado tem um endpoint de detalhe próprio com `min_version`; o front espera nele e só depois invalida/abre a tela composta. C) o front refaz a query até o item aparecer (ex.: sessão com o ID devolvido), sem versão. D) invalida e refaz sem garantia.
- **Recomendação:** A, se o ReadSide aceitar; senão, B. As duas mantêm a regra 7 (versão devolvida → `min_version`). C só funciona para criação, não para edição. D é o problema que o read-your-writes resolve.

### OQ-Frontend-15 [técnica] O que a UI faz quando a projeção demora?
- **Contexto:** o cliente refaz a query a cada 250 ms sem limite (`use-ping.ts:13-18`); o servidor espera até 3 s por requisição (`get-ping.handler.ts:7`). Com o projector parado, a tela fica presa em "aguardando projeção". O limite é um valor a definir pelo usuário.
- **Opções:** A) manter sem limite, com o status "aguardando projeção" visível (`aria-live`). B) limite no cliente (valor a definir, ex.: 10 s ou 30 s); depois, a tela mostra "Salvo. Os dados podem demorar a aparecer." com botão "Atualizar", e o polling para. C) navegar na hora para a tela do item e mostrar um aviso enquanto a versão não chega.
- **Recomendação:** B, com o valor definido pelo usuário. Deixa visível que o command foi aceito (a verdade está no write) mesmo quando a leitura atrasa, que é a lição central do `overview.md:11`.

### OQ-Frontend-16 [técnica] Ciclo de vida da `Idempotency-Key` nos formulários
- **Contexto:** a Fase 1 gera uma chave por submit (`create-ping-form.tsx:36`). Se os 2 retries automáticos esgotarem num erro de rede depois de o servidor ter gravado, o próximo clique manda chave nova e cria um segundo evento. Reusar a chave com payload diferente dá `422` (RN-11 da Fase 1).
- **Opções:** A) manter uma chave por submit. B) uma chave por intenção: gerada quando o formulário abre, reusada em todo reenvio com o mesmo payload, trocada depois de sucesso ou quando o payload enviado muda. C) uma chave por formulário aberto, nunca trocada até sair da tela.
- **Recomendação:** B. Fecha o buraco do reenvio manual (o servidor devolve a resposta salva) e evita o `422` quando o usuário corrige um campo. É a regra 9 aplicada do lado do cliente. C dá `422` quando o usuário edita e reenvia.

### OQ-Frontend-17 [técnica] Contrato de erro dos commands e como o form mostra os erros
- **Contexto:** o `400` atual tem `issues[{ path, message }]` sem schema em `libs/contracts` (`zod-validation.pipe.ts:11-17`); violação de regra de domínio não tem erro próprio (`domain-error.filter.ts:9`). Depende de D-Back-2.
- **Opções:** A) schemas de erro em `libs/contracts` (`ValidationErrorResponse` com `issues`; erro de regra com `code` estável, ex.: `BATCH_WINDOW_INVALID`); o front mapeia `issues[].path` para `setError` do campo e `code` para mensagem PT-BR, e o resto vira alerta no topo do form. B) o front mostra a `message` do servidor como veio. C) mensagem genérica por status, como na Fase 1.
- **Recomendação:** A. Erro no campo certo é acessibilidade e usabilidade; código estável evita depender de texto do servidor. O status para regra de domínio (`409`? `422`?) é decisão do Backend.

### OQ-Frontend-18 [técnica] Entrada de preço no formulário de lote
- **Contexto:** a representação no contrato é do Domínio (D-Dom-5; centavos inteiros é o comum). O usuário digita no formato brasileiro (`1.234,56`).
- **Opções:** A) `Input` de texto com `inputMode="decimal"` e prefixo "R$" (`Input Group`), convertido para centavos num schema de formulário que termina no schema do contrato (`.pipe`). B) máscara de moeda com biblioteca nova (ex.: `react-number-format`). C) campo em centavos.
- **Recomendação:** A. Sem dependência nova; a conversão fica num ponto testável, e o schema do contrato continua sendo a validação final.

### OQ-Frontend-19 [técnica] Entrada de data/hora (sessão e janela do lote)
- **Contexto:** o Date Picker do shadcn usa `Calendar` + `Popover` e traz dependência de calendário; não há biblioteca de datas instalada (`package.json:13-30`). Depende de OQ-Frontend-10 (fuso).
- **Opções:** A) `<input type="datetime-local">` nativo, interpretado no fuso decidido na OQ-Frontend-10 e convertido para o formato do contrato. B) Date Picker do shadcn + campo de hora. C) campos separados de data e hora nativos.
- **Recomendação:** A. Acessível por padrão, sem dependência, fácil de preencher no Playwright. Um seletor visual pode vir depois.

### OQ-Frontend-20 [técnica] Componentes shadcn a adicionar e feedback de sucesso
- **Contexto:** hoje só há `button`, `card`, `input` e `label`. O CLI do shadcn pode mexer em `index.css`/`package.json` (napkin).
- **Opções (componentes):** A) `field`, `input-group`, `textarea`, `native-select`, `badge`, `skeleton`, `empty`, `spinner`, `alert`, `separator`, `breadcrumb` e, conforme OQ-Frontend-7, `pagination`. B) A + `select` (Radix) no lugar de `native-select`. C) A + `table` para as listas do produtor.
- **Opções (sucesso):** a) status inline na própria tela (`aria-live`), sem toast. b) toast (`Toast` do shadcn).
- **Recomendação:** A + a. `native-select` funciona com `register` e com teclado sem esforço; toast some antes de o leitor de tela anunciar e não acrescenta nada à lição de CQRS. Todos os componentes instalados de uma vez, numa trilha só, antes das trilhas de tela.

### OQ-Frontend-21 [técnica] Como simular a API nos testes de componente
- **Contexto:** a Fase 1 usa `vi.stubGlobal('fetch')` com um servidor falso por teste (`diagnostics-page.test.tsx:12-57`). O catálogo terá vários endpoints por tela.
- **Opções:** A) manter `vi.stubGlobal('fetch')`, com um helper `createFakeApi` em `src/test/` que roteia por método + caminho e simula projeção atrasada. B) adotar MSW (dependência nova). C) mockar os módulos de `api/` com `vi.mock`.
- **Recomendação:** A. Sem dependência nova, mesmo estilo da Fase 1, e o atraso de projeção continua explícito no teste. C esconderia o contrato HTTP, que é o que mais importa testar.

### OQ-Frontend-22 [técnica] Dados e host dos testes Playwright
- **Contexto:** a stack de produção não é resetada entre execuções; a vitrine acumula eventos. `playwright.config.ts:7` usa `localhost`, que no host Windows com WSL mirrored resolve para `::1` primeiro (napkin).
- **Opções (dados):** A) o spec do produtor cria tudo pela UI com nomes únicos (sufixo aleatório), e os specs de vitrine/página semeiam via API (`request` do Playwright, com `Idempotency-Key`) e acham o evento pela busca ou pela URL direta. B) tudo pela UI. C) resetar os bancos antes da suíte.
- **Opções (host):** a) trocar o default para `http://127.0.0.1:8080`, com override por variável (`E2E_BASE_URL`, como no pacote `e2e`). b) manter `localhost`.
- **Recomendação:** A + a. Asserções procuram o item criado, nunca a contagem total. Reset da stack apagaria o histórico do tópico e do read model, o que conflita com o replay.

### OQ-Frontend-23 [técnica] Seletores de teste e verificação de acessibilidade
- **Contexto:** a Fase 1 usa `data-testid` em quase tudo. Consultas por papel e label (Testing Library) testam também a acessibilidade.
- **Opções:** A) priorizar `getByRole`/`getByLabelText` no RTL e no Playwright, com `data-testid` só onde não há papel (ex.: status de sincronização); acessibilidade verificada por essas consultas + checklist no Plan (labels, `aria-invalid`, `FieldError` anunciado, foco no primeiro campo inválido, `aria-live` no status, um `h1` por página). B) A + `@axe-core/playwright` nos specs E2E (dependência nova). C) manter `data-testid` em tudo.
- **Recomendação:** A. Melhora a acessibilidade sem dependência nova. B é boa evolução se o usuário quiser checagem automática.

### OQ-Frontend-24 [negócio] Como o produtor cadastra um setor de assento marcado nesta fase?
- **Contexto:** o mapa de assentos é da Fase 4, mas o setor é cadastrado agora, e o glossário distingue assento marcado de pista. Depende de D-Dom-7; o Domínio provavelmente levanta a mesma dúvida (deduplicar na consolidação). O impacto no front vai de um campo numérico a um editor de fileiras.
- **Opções:** A) nesta fase, só tipo (assento marcado/pista) + capacidade; os assentos são definidos na Fase 4. B) tipo + fileiras e assentos por fileira (gerados automaticamente). C) editor de assentos individual.
- **Recomendação:** A. Mantém a Fase 2 no catálogo; a estrutura de assentos nasce junto com o inventário que a usa.

## Decisões

Preenchida pelo thread principal com as respostas do usuário (após consolidação e renumeração).

- OQ-Frontend-1 → ...
