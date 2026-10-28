---
feature: Identity
fase: 3 — Identity
date: 2026-10-27
status: implemented
research: SDD/RESEARCH/2026-10-27-IdentityResearch.md
spec: SDD/SPEC/2026-10-27-IdentitySpec.md
---

# Identity — Plan

COMO a Spec será implementada. Executável por quem não participou da conversa. Decisões técnicas referenciadas como D-n e P-n estão no Research; regras RN-n e critérios CA-n, na Spec.

## Roadmap

| # | Etapa | Objetivo | Entregável | Depende de |
|---|---|---|---|---|
| E1 | Contratos | Fixar papéis, claims, schemas HTTP, validadores de CPF/CNPJ e códigos de erro que todas as trilhas consomem | `libs/contracts/src/identity/*`, códigos novos em `http/errors.ts`, exports | — |
| E2 | Infra | Mailpit, variáveis de ambiente, chaves JWT de dev, roteamento do gateway e dependências npm | compose, nginx, `package.json` dos serviços, lockfile | — |
| E3 | Docs | Registrar Identity como contexto CRUD e a exceção do gateway | ADR 0010, `overview.md`, `glossary.md`, nota no ADR 0002 | — |
| E4 | Write-service: autenticação, schema e posse | Guard global, emissão/verificação de JWT, migration da Identity, Catalog com ator do token e posse, helpers de token de teste | `src/auth/**`, migration, Catalog adaptado, testes verdes | E1, E2 |
| E5 | Read-service: autenticação | Guard global e leituras do produtor filtradas pelo token | `src/auth/**`, Catalog read adaptado, testes verdes | E1, E2 |
| E6 | Web: sessão | Token em memória, refresh único, Bearer no cliente HTTP, provider de sessão, guards de rota, header, fakes de teste | `api/*`, `features/session/**`, `root-layout.tsx`, `test/*` | E1 |
| E7 | E2E: suporte e testes de API | Login, Mailpit, seed autenticado, testes E2E da Identity e do Catalog autenticado (escritos, rodados em E10) | `e2e/src/**` | E1 |
| E8 | Write-service: módulo Identity | Cadastro, verificação, sessão, `me`, pedidos de produtor, admin, seeder, limpeza, e-mail | `src/identity/**`, testes | E4 |
| E9 | Web: telas da Identity | Cadastro, login, verificação, minha conta, admin, rotas | `pages/identity/**`, `features/identity/**`, `router.tsx` | E6 |
| E10 | Integração | Subir a stack completa, rodar E2E de API e Playwright, seed, replay, corrigir o que faltar | Stack verde, specs Playwright | E1 a E9 |

### Trilhas e ondas

| Trilha | Onda | Etapas | Depende de | Arquivos donos (exclusivos) |
|---|---|---|---|---|
| A Contratos | 1 | E1 | — | `libs/contracts/src/identity/**` (novo), `libs/contracts/src/http/errors.ts`, `libs/contracts/src/http/errors.test.ts`, `libs/contracts/src/index.ts` |
| B Infra | 1 | E2 | — | `docker-compose.yaml`, `docker-compose.override.yaml`, `.env.example`, `.env` (local, ignorado pelo git), `infra/scripts/generate-jwt-keys.mjs` (novo), `package.json` (raiz, só o script `jwt:keys`), `infra/nginx/nginx.dev.conf`, `infra/nginx/nginx.prod.conf`, `apps/write-service/package.json`, `apps/read-service/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` |
| C Docs | 1 | E3 | — | `docs/architecture/adr/0010-identity-contexto-crud.md` (novo), `docs/architecture/adr/0002-gateway-nginx.md`, `docs/architecture/overview.md`, `docs/domain/glossary.md` |
| D Write auth + Catalog | 2 | E4 | A, B | `apps/write-service/src/config.ts`, `src/auth/**` (novo), `src/app.module.ts`, `src/shared/shared.module.ts`, `src/shared/actor/**` (remover), `src/shared/idempotency/scope.ts` (novo) e `scope.spec.ts` (novo), `src/health/health.controller.ts`, `src/diagnostics/http/pings.controller.ts`, `src/database/migrations/1793145600000-IdentitySchema.ts` (novo), `src/database/migrations/index.ts`, `src/catalog/application/**`, `src/catalog/http/**`, `test/support/auth.ts` (novo), `test/integration/setup.ts`, `test/integration/auth.int.test.ts` (novo), `test/integration/catalog/**`, `test/integration/shared-infra.int.test.ts`, `test/unit/catalog/**` |
| E Read auth + Catalog | 2 | E5 | A, B | `apps/read-service/src/config.ts`, `src/auth/**` (novo), `src/app.module.ts`, `src/catalog/seed-organizer.ts` (remover), `src/catalog/catalog.module.ts`, `src/catalog/catalog.queries.ts`, `src/catalog/catalog.handlers.ts`, `src/catalog/organizer.controller.ts`, `src/catalog/public-events.controller.ts`, `src/health/health.controller.ts`, controllers em `src/diagnostics/**`, `test/support/auth.ts` (novo), `test/integration/**` |
| F Web sessão | 2 | E6 | A | `apps/web/src/api/http.ts`, `api/http.test.ts`, `api/auth-session.ts` (novo) e teste, `api/identity.ts` (novo) e teste, `api/query-keys.ts`, `src/features/session/**` (novo), `src/app/root-layout.tsx`, `src/app/root-layout.test.tsx` (novo), `src/main.tsx`, `src/test/fake-api.ts`, `src/test/fake-api.test.ts`, `src/test/render.tsx` |
| J E2E suporte | 2 | E7 | A | `e2e/src/support/http.ts`, `e2e/src/support/env.ts`, `e2e/src/support/identity.ts` (novo), `e2e/src/support/mailpit.ts` (novo), `e2e/src/support/catalog.ts`, `e2e/src/seed/catalog-seed.ts`, `e2e/src/api/identity.e2e.test.ts` (novo), `e2e/src/api/catalog.e2e.test.ts` |
| H Identity write | 3 | E8 | D | `apps/write-service/src/identity/**` (novo), `src/app.module.ts` (só acrescenta `IdentityModule`; dono na onda 3), `test/support/fake-mailer.ts` (novo), `test/integration/identity/**` (novo), `test/unit/identity/**` (novo) |
| I Web telas | 3 | E9 | F | `apps/web/src/pages/identity/**` (novo), `src/features/identity/**` (novo), `src/app/router.tsx`, `src/app/router.test.tsx`, arquivos novos em `src/components/ui/` |
| K Integração | 4 | E10 | todas | `apps/web/e2e/**`. Única trilha da onda: pode corrigir qualquer arquivo, registrando no Board |

Regras de posse:
- `src/app.module.ts` do write-service: D na onda 2, H na onda 3 (arquivo concluído na onda anterior).
- `test/integration/setup.ts` do write-service já trunca as tabelas da Identity em D; H não mexe nele.
- O lockfile só muda em B. Nenhuma outra trilha roda `pnpm add`. Se precisar de pacote novo, para e pergunta no Board.
- Só K sobe a stack Docker completa. B valida o compose com `docker compose config`. D, E e H usam os bancos de teste das suítes de integração, como hoje.

### Interfaces entre trilhas

#### I-1 `libs/contracts` (A → D, E, F, H, I, J)

`libs/contracts/src/identity/constants.ts`:
- `USER_ROLES = ['customer', 'organizer', 'admin', 'gate_staff'] as const`; `type UserRole`.
- `ORGANIZER_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const`; `type OrganizerRequestStatus`.
- `JWT_ISSUER = 'stubb-identity'`, `JWT_AUDIENCE = 'stubb-api'`, `JWT_ALGORITHM = 'EdDSA'`, `JWT_CLOCK_TOLERANCE_SECONDS = 30`.
- `ACCESS_TOKEN_TTL_SECONDS = 900`, `REFRESH_TOKEN_TTL_SECONDS = 604800`.
- `REFRESH_COOKIE_NAME = 'stubb_refresh'`, `REFRESH_COOKIE_PATH = '/api/identity/session'`.
- `EMAIL_VERIFICATION_TTL_SECONDS = 86400`, `EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS = 60`.
- `identityRoutes`: funções de caminho completo para o web e o E2E, no padrão de `catalogRoutes` (`catalog/constants.ts:107-153`): `users()`, `confirmEmail()`, `emailVerifications()`, `session()`, `sessionRefresh()`, `me()`, `myOrganizerRequests()`, `organizerRequests()`, `adminOrganizerRequests()`, `approveOrganizerRequest(id)`, `rejectOrganizerRequest(id)`. Caminhos exatamente os da Spec, seção HTTP.
- `IDENTITY_ROUTE_TEMPLATES` no mesmo formato de `CATALOG_ROUTE_TEMPLATES`, para `registerUser`, `requestOrganizerRole`, `approveOrganizerRequest`, `rejectOrganizerRequest`.

`libs/contracts/src/identity/documents.ts`:
- `normalizeCpf(input: string): string`: remove tudo que não é dígito.
- `cpfCheckDigits(base9: string): string`: os 2 dígitos (mod 11; resto < 2 → 0, senão 11 − resto; pesos 10..2 e 11..2).
- `isValidCpf(digits: string): boolean`: 11 dígitos, não todos iguais, dígitos verificadores corretos.
- `maskCpf(digits: string): string` → `***.456.789-**` (mantém as posições 4 a 9).
- `normalizeCnpj(input: string): string`: remove `.`, `/`, `-` e espaços, converte para maiúsculas.
- `cnpjCheckDigits(base12: string): string` e `isValidCnpj(value: string): boolean` conforme D-19 (`[0-9A-Z]{12}[0-9]{2}`, valor = código ASCII − 48, não todos iguais).
- Casos de teste obrigatórios: `12345678909` e `98765432100` válidos; `12345678900` e `11111111111` inválidos; `11222333000181` e `12ABC34501DE35` válidos; `11222333000180`, `00000000000000` e `12abc34501de35` antes de normalizar (deve validar depois de `normalizeCnpj`).

`libs/contracts/src/identity/http.ts` (Zod 4; strings com `.trim()` antes dos limites):
- `RegisterUserRequestSchema`: `fullName` (3 a 120), `email` (`z.email()`, até 254, transformado para minúsculas), `password` (8 a 128, contados em code points com `[...s].length`, sem trim), `cpf` (transformado com `normalizeCpf`, refinado com `isValidCpf`, mensagem `CPF inválido`).
- `ConfirmEmailRequestSchema`: `token` (1 a 200).
- `ResendVerificationRequestSchema`: `email`.
- `LoginRequestSchema`: `email` (minúsculas), `password` (1 a 128).
- `SessionResponseSchema`: `{ accessToken: string, expiresIn: number }`.
- `IdentityCommandAcceptedSchema`: `{ id: uuidSchema }`.
- `MeResponseSchema`: `{ id, email, fullName, cpf: string, roles: UserRole[] }`.
- `RequestOrganizerRoleRequestSchema`: `organizationName` (2 a 120), `cnpj` (transformado com `normalizeCnpj`, refinado com `isValidCnpj`, mensagem `CNPJ inválido`), `reason` (1 a 500).
- `OrganizerRequestViewSchema` e `AdminOrganizerRequestViewSchema` (Spec, seção Queries).
- `ListMyOrganizerRequestsResponseSchema`: `{ items }`.
- `ListAdminOrganizerRequestsQuerySchema`: `status` (default `pending`), `page` (coerce, ≥1, default 1), `pageSize` (coerce, 1 a 50, default 20).
- `ListAdminOrganizerRequestsResponseSchema`: `{ items, page, pageSize, total }`.
- `RejectOrganizerRequestRequestSchema`: `message` opcional (até 500; string vazia depois do trim vira `undefined`).
- `AccessTokenClaimsSchema`: `{ sub: uuidSchema, roles: z.array(z.enum(USER_ROLES)).min(1), iss: z.literal(JWT_ISSUER), aud: z.literal(JWT_AUDIENCE), iat: int, exp: int }`.

`libs/contracts/src/http/errors.ts`: acrescentar ao fim de `COMMAND_ERROR_CODES`, nesta ordem: `UNAUTHENTICATED`, `FORBIDDEN`, `EMAIL_ALREADY_REGISTERED`, `CPF_ALREADY_REGISTERED`, `VERIFICATION_TOKEN_INVALID`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `SESSION_INVALID`, `ALREADY_ORGANIZER`, `ORGANIZER_REQUEST_PENDING`, `ORGANIZER_REQUEST_NOT_FOUND`, `ORGANIZER_REQUEST_NOT_PENDING`.

`libs/contracts/src/index.ts`: `export * from './identity/constants.js'`, `'./identity/documents.js'`, `'./identity/http.js'`.

#### I-2 Variáveis de ambiente (B → D, E, H; nomes usados pelo `config.ts` de cada serviço)

Fluxo, no padrão que o projeto já usa: `.env.example` (versionado) documenta cada variável com o mesmo default embutido no compose. `.env` (local, ignorado pelo git) é lido pelo docker compose. O compose interpola `${VAR:-default}` no `environment:` de cada serviço. Os apps só recebem o que o compose repassa. Segredo sem default válido usa `${VAR:?mensagem}`, que faz o compose falhar com a instrução em vez de subir sem a chave.

| Variável | Serviço | Default no código (`config.ts`) | No compose | No `.env.example` |
|---|---|---|---|---|
| `JWT_PRIVATE_KEY` | write | nenhum (opcional no Zod; `AuthModule` falha no bootstrap se faltar) | `${JWT_PRIVATE_KEY:?Gere as chaves com: pnpm jwt:keys}` | vazio, com comentário mandando rodar `pnpm jwt:keys` |
| `JWT_PUBLIC_KEY` | write, read | nenhum (idem) | `${JWT_PUBLIC_KEY:?Gere as chaves com: pnpm jwt:keys}` | vazio, idem |
| `COOKIE_SECURE` | write | `true` | `${COOKIE_SECURE:-false}` | `COOKIE_SECURE=false` |
| `SMTP_URL` | write | `smtp://localhost:1025` | `${SMTP_URL:-smtp://mailpit:1025}` | `SMTP_URL=smtp://mailpit:1025` |
| `MAIL_FROM` | write | `Stubb <nao-responda@stubb.local>` | `'${MAIL_FROM:-Stubb <nao-responda@stubb.local>}'` (entre aspas no YAML) | `MAIL_FROM="Stubb <nao-responda@stubb.local>"` |
| `PUBLIC_WEB_URL` | write | `http://127.0.0.1:8080` | `${PUBLIC_WEB_URL:-http://127.0.0.1:8080}` | `PUBLIC_WEB_URL=http://127.0.0.1:8080`, com a nota de que precisa acompanhar `GATEWAY_HOST_PORT` |
| `IDENTITY_SEED_ENABLED` | write | `false` | `${IDENTITY_SEED_ENABLED:-true}` | `IDENTITY_SEED_ENABLED=true` |
| `IDENTITY_ADMIN_ID` / `_EMAIL` / `_PASSWORD` / `_NAME` / `_CPF` | write | `0193a4f0-0000-7000-8000-000000000000` / `admin@stubb.local` / `stubb-admin-dev` / `Administrador Stubb` / `12345678909` | `${VAR:-<mesmo default>}` cada uma | as cinco, com os defaults e a nota "o admin é você: troque e-mail e senha no `.env`" |
| `IDENTITY_SEED_ORGANIZER_ID` / `_EMAIL` / `_PASSWORD` / `_NAME` / `_CPF` | write | `0193a4f0-0000-7000-8000-000000000001` / `produtor@stubb.local` / `stubb-produtor-dev` / `Produtor Demo` / `98765432100` | `${VAR:-<mesmo default>}` cada uma | as cinco, com os defaults e a nota "o ID não deve mudar: os dados de demonstração do Catalog pertencem a ele" |
| `IDENTITY_SEED_ORGANIZER_ORGANIZATION` / `_CNPJ` | write | `Produtora Demo` / `11222333000181` | `${VAR:-<mesmo default>}` | as duas, com os defaults |
| `MAILPIT_HOST_PORT` | (compose) | — | `ports: ['${MAILPIT_HOST_PORT:-8025}:8025']` | `MAILPIT_HOST_PORT=8025`, no bloco de portas publicadas |
| `SEED_ORGANIZER_ID` | write, read | **removida** | **removida** (âncora `x-seed-organizer-id` e os dois usos saem) | **removida** (substituída por `IDENTITY_SEED_ORGANIZER_ID`); remover também do `.env` local |

Senhas do seed e `POSTGRES_PASSWORD` seguem o mesmo critério: são de desenvolvimento e têm default. As chaves JWT são o único segredo sem default: um par fixo versionado seria reutilizado por qualquer clone.

Chaves JWT de dev: `infra/scripts/generate-jwt-keys.mjs`, exposto como `pnpm jwt:keys` no `package.json` da raiz. O script cria `.env` a partir de `.env.example` se ele não existir, gera um par Ed25519 com `node:crypto` e grava ou substitui as linhas `JWT_PRIVATE_KEY=` e `JWT_PUBLIC_KEY=` (PEM em base64, numa linha). As demais linhas ficam intactas. Com `--force` regera; sem `--force`, não sobrescreve chaves já preenchidas e avisa.

Variáveis do E2E (`E2E_MAILPIT_URL`, `E2E_ADMIN_*`, `E2E_ORGANIZER_*`, I-5) não são lidas do `.env`: têm defaults iguais aos do `.env.example`. O `.env.example` ganha um comentário dizendo que, se as credenciais do seed ou `MAILPIT_HOST_PORT` mudarem, as `E2E_*` correspondentes precisam ser exportadas no shell antes do `pnpm test:e2e`.

Serviço novo no compose: `mailpit`. SMTP em `mailpit:1025` só na rede interna; UI e API em `127.0.0.1:${MAILPIT_HOST_PORT:-8025}`. `write-service.depends_on.mailpit: service_started`.

#### I-3 Autenticação no write-service (D → H)

- `src/auth/auth.module.ts`: `@Global() AuthModule`, registra `APP_GUARD` com `AuthGuard` e exporta `AccessTokenIssuer` e `AccessTokenVerifier`.
- `src/auth/decorators.ts`: `Public()`, `Roles(...roles: UserRole[])`, `CurrentUser()` (param decorator que devolve `AuthenticatedUser`).
- `src/auth/authenticated-user.ts`: `interface AuthenticatedUser { id: string; roles: UserRole[] }`.
- `AccessTokenIssuer.issue(user: AuthenticatedUser): Promise<{ accessToken: string; expiresIn: number }>`. Usa o `Clock` do `SharedModule` para o `iat`.
- `AccessTokenVerifier.verify(token: string): Promise<AuthenticatedUser>`: lança erro em token inválido ou vencido.
- Semântica do guard: sem `@Public()`, exige `Authorization: Bearer <jwt>` válido, senão 401 `UNAUTHENTICATED`. Com `@Roles(...)`, exige ao menos um dos papéis, senão 403 `FORBIDDEN`. Em rota `@Public()` o token é ignorado. Corpo: `{ statusCode, error: 'Unauthorized' | 'Forbidden', message, code }`.
- `src/shared/idempotency/scope.ts`: `idempotencyScope(template: string, actorId?: string): string` → `${actorId} ${template}` com ator, `template` sem ator.
- `test/support/auth.ts`: importado no topo de `test/integration/setup.ts`, então as variáveis já existem antes do `import()` do `AppModule`. Gera um par Ed25519 efêmero com `node:crypto` (`generateKeyPairSync('ed25519')`) e grava `JWT_PRIVATE_KEY` e `JWT_PUBLIC_KEY` (PEM em base64) em `process.env`. Também grava `COOKIE_SECURE=false` e `IDENTITY_SEED_ENABLED=false`.
  - `signTestToken({ sub, roles, expiresInSeconds = 900, issuedAt? }): Promise<string>`.
  - `authHeader(sub: string, roles: UserRole[] = ['customer', 'organizer']): Promise<{ Authorization: string }>`.
  - Constantes `TEST_ORGANIZER_ID = '0193a4f0-0000-7000-8000-000000000001'` e `OTHER_ORGANIZER_ID = '0193a4f0-0000-7000-8000-0000000000aa'`.
- Tabelas `identity_*` criadas pela migration de D (DDL abaixo) e incluídas no `truncateAll`.

#### I-4 Web (F → I)

- `src/api/auth-session.ts`:
  - `getAccessToken(): string | null`.
  - `getSessionUser(): { id: string; roles: UserRole[] } | null` (claims decodificadas do payload do JWT, sem verificar assinatura).
  - `setAccessToken(token: string | null)`.
  - `subscribe(listener): () => void`.
  - `refreshSession(): Promise<boolean>`: chamada única em voo; `true` se renovou; `false` e limpa o token se recebeu 401.
- `src/api/identity.ts`:
  - `registerUser(input, idempotencyKey)`, `confirmEmail(token)`, `resendVerification(email)`.
  - `login(input)`: grava o token.
  - `logout()`.
  - `getMe()`, `requestOrganizerRole(input, idempotencyKey)`, `listMyOrganizerRequests()`.
  - `listAdminOrganizerRequests(params)`, `approveOrganizerRequest(id, idempotencyKey)`, `rejectOrganizerRequest(id, message, idempotencyKey)`.
  - Todas validam a resposta com os schemas de I-1 e lançam o `ApiError` existente.
- `src/api/query-keys.ts`: `identity.me`, `identity.myOrganizerRequests`, `identity.adminOrganizerRequests(params)`.
- `src/features/session/session-provider.tsx`: `SessionProvider` e `useSession()`, que devolve:
  - `status: 'loading' | 'authenticated' | 'anonymous'` e `user: { id, roles } | null`;
  - `hasRole(role)`;
  - `signIn({ email, password }): Promise<void>`: chama `login`; se o `sub` mudou, roda `queryClient.clear()`;
  - `signOut(): Promise<void>`: chama `logout`, limpa o token e roda `queryClient.clear()`;
  - `refresh(): Promise<void>`.
  - No mount, chama `refreshSession()` uma vez e fica em `loading` até a resposta.
- `src/features/session/route-guards.tsx`:
  - `RequireAuth`: em `loading` mostra um spinner; sem sessão faz `<Navigate to="/entrar?redirect=<path+search>" replace />`.
  - `RequireRole({ role, children })`: aplica `RequireAuth` e, sem o papel, renderiza `AccessDenied`.
  - `AccessDenied`: título "Acesso negado" e link para a vitrine.
  - `safeRedirect(value: string | null): string`: aceita só caminhos que começam com `/` e não com `//`; caso contrário devolve `/`.
- `src/test/render.tsx`: `renderRoutes`/`renderWithClient` aceitam `session?: { id; roles } | null`. O default é `{ id: '0193a4f0-0000-7000-8000-000000000001', roles: ['customer', 'organizer'] }`, para os testes existentes da área do produtor continuarem passando. `null` renderiza anônimo.
- `src/test/fake-api.ts`: rotas da Identity com estado em memória (usuários, pedidos, sessão), no padrão do arquivo, e um helper para semear usuários e pedidos.

#### I-5 E2E (J → K)

- `e2e/src/support/env.ts`:
  - `E2E_MAILPIT_URL` (default `http://127.0.0.1:8025`);
  - credenciais do seed: `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (defaults `admin@stubb.local`/`stubb-admin-dev`) e `E2E_ORGANIZER_EMAIL`/`E2E_ORGANIZER_PASSWORD` (defaults `produtor@stubb.local`/`stubb-produtor-dev`).
- `e2e/src/support/http.ts`: `api()` ganha a opção `token?: string`, que gera `Authorization: Bearer`, e devolve os headers da resposta (para `Set-Cookie`).
- `e2e/src/support/mailpit.ts`: `waitForVerificationToken(email, { after?: Date }): Promise<string>`. Faz polling de `GET {E2E_MAILPIT_URL}/api/v1/messages`, filtra por `To[].Address`, abre `GET /api/v1/message/{ID}` e extrai `token` do link em `Text`. Timeout de 15 s.
- `e2e/src/support/identity.ts`:
  - `login(email, password): Promise<{ accessToken: string; refreshCookie: string }>`.
  - `registerVerifiedUser(): Promise<{ id, email, password, accessToken }>`: usa e-mail `e2e-<uuid v7>@stubb.local` e CPF de 9 dígitos aleatórios + `cpfCheckDigits`.
  - `organizerToken()` e `adminToken()`: cacheados por processo (R-9).
- O web Playwright (K) reaproveita só a API do Mailpit, chamada com o `request` do Playwright.

## Arquivos

| Ação | Caminho | Propósito |
|---|---|---|
| criar | `libs/contracts/src/identity/constants.ts`, `documents.ts`, `http.ts` + testes `*.test.ts` | I-1 |
| alterar | `libs/contracts/src/http/errors.ts`, `errors.test.ts`, `src/index.ts` | Códigos e exports |
| alterar | `docker-compose.yaml` | `mailpit`, variáveis interpoladas `${VAR:-default}` / `${VAR:?...}`; remover `x-seed-organizer-id` |
| alterar | `.env.example` (versionado), `.env` (local, ignorado) | Variáveis da Identity, SMTP, seed, `MAILPIT_HOST_PORT`; remover `SEED_ORGANIZER_ID` |
| criar | `infra/scripts/generate-jwt-keys.mjs` | Gera o par Ed25519 de dev no `.env` |
| alterar | `package.json` (raiz) | Script `jwt:keys` |
| alterar | `docker-compose.override.yaml` | Só se o dev precisar sobrescrever algo da Identity; não sobrescrever `environment` (o base vale) |
| alterar | `infra/nginx/nginx.dev.conf`, `infra/nginx/nginx.prod.conf` | `location /api/identity/` → `write_service` |
| alterar | `apps/write-service/package.json`, `apps/read-service/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (se o pnpm gravar algo) | `jose`, `nodemailer`, `@types/nodemailer` |
| criar | `docs/architecture/adr/0010-identity-contexto-crud.md` | ADR |
| alterar | `docs/architecture/overview.md`, `docs/architecture/adr/0002-gateway-nginx.md`, `docs/domain/glossary.md` | Docs |
| criar | `apps/write-service/src/auth/{auth.module,auth.guard,decorators,authenticated-user,jwt-keys,access-token.issuer,access-token.verifier}.ts` + specs | I-3 |
| criar | `apps/write-service/src/database/migrations/1793145600000-IdentitySchema.ts` | DDL |
| alterar | `apps/write-service/src/database/migrations/index.ts` | Registrar a migration |
| alterar | `apps/write-service/src/config.ts` | I-2 |
| alterar | `apps/write-service/src/app.module.ts` | `AuthModule` (D), `IdentityModule` (H) |
| alterar | `apps/write-service/src/shared/shared.module.ts` | Remover `CurrentOrganizer` |
| remover | `apps/write-service/src/shared/actor/current-organizer.ts`, `current-organizer.spec.ts` | Seed sai |
| criar | `apps/write-service/src/shared/idempotency/scope.ts` + `scope.spec.ts` | L-1 |
| alterar | `apps/write-service/src/health/health.controller.ts`, `src/diagnostics/http/pings.controller.ts` | `@Public()` |
| alterar | `apps/write-service/src/catalog/application/*.command.ts` (14), `*.handler.ts` (14), `require.ts` | `actorId` e posse |
| alterar | `apps/write-service/src/catalog/http/events.controller.ts`, `venues.controller.ts` | `@Roles`, `@CurrentUser`, escopo |
| criar | `apps/write-service/test/support/auth.ts`, `test/integration/auth.int.test.ts`, `test/integration/catalog/ownership.int.test.ts` | Helpers e testes |
| alterar | `apps/write-service/test/integration/setup.ts`, `test/integration/catalog/*`, `test/integration/shared-infra.int.test.ts`, `test/unit/catalog/*` | Auth nos testes |
| criar | `apps/write-service/src/identity/**` (estrutura em T-30) | Módulo Identity |
| criar | `apps/write-service/test/support/fake-mailer.ts`, `test/integration/identity/*.int.test.ts`, `test/unit/identity/*.spec.ts` | Testes da Identity |
| criar | `apps/read-service/src/auth/{auth.module,auth.guard,decorators,authenticated-user,access-token.verifier}.ts` + specs, `test/support/auth.ts` | Auth no read |
| alterar | `apps/read-service/src/config.ts`, `src/app.module.ts`, `src/catalog/{catalog.module,catalog.queries,catalog.handlers,organizer.controller,public-events.controller}.ts`, `src/health/health.controller.ts`, controllers de `src/diagnostics/**`, `test/integration/*` | Leituras pelo token |
| remover | `apps/read-service/src/catalog/seed-organizer.ts` | Seed sai |
| criar | `apps/web/src/api/auth-session.ts`, `api/identity.ts`, `src/features/session/{session-provider,route-guards}.tsx` + testes, `src/app/root-layout.test.tsx` | I-4 |
| alterar | `apps/web/src/api/http.ts`, `http.test.ts`, `query-keys.ts`, `src/app/root-layout.tsx`, `src/main.tsx`, `src/test/{fake-api,fake-api.test,render}.ts(x)` | Sessão |
| criar | `apps/web/src/pages/identity/{register-page,login-page,verify-email-page,account-page,admin-organizer-requests-page}.tsx` + testes; `src/features/identity/**` | Telas |
| alterar | `apps/web/src/app/router.tsx`, `router.test.tsx` | Rotas e guards |
| criar | `e2e/src/support/identity.ts`, `mailpit.ts`, `e2e/src/api/identity.e2e.test.ts` | E2E |
| alterar | `e2e/src/support/http.ts`, `env.ts`, `catalog.ts`, `e2e/src/seed/catalog-seed.ts`, `e2e/src/api/catalog.e2e.test.ts` | Login |
| criar | `apps/web/e2e/identity.spec.ts` | Playwright |
| alterar | `apps/web/e2e/catalog-organizer.spec.ts` (e `catalog-public.spec.ts` se preciso) | Login antes |

## Tarefas

### E1 — Contratos (trilha A)

- [ ] T-1 Criar `identity/constants.ts` conforme I-1. (cobre CA-8, CA-9, CA-11)
  - Teste: `constants.test.ts` confere os valores e os caminhos de `identityRoutes`.
- [ ] T-2 Criar `identity/documents.ts` conforme I-1 e D-19. (cobre CA-2, CA-13)
  - Teste: `documents.test.ts` com todos os casos obrigatórios de I-1, mais `maskCpf('12345678909') === '***.456.789-**'` e `cpfCheckDigits('123456789') === '09'`.
- [ ] T-3 Criar `identity/http.ts` conforme I-1. (cobre CA-2, CA-12, CA-13, CA-15)
  - Teste: `http.test.ts` com os limites de cada campo (3/120, 8/128 com emoji contado como 1, 254, 2/120, 1/500, 500); e-mail em minúsculas; CPF e CNPJ com máscara normalizados; mensagem de recusa vazia vira `undefined`; claims rejeitando `iss` errado.
- [ ] T-4 Acrescentar os 12 códigos em `errors.ts` e os exports em `index.ts`. (cobre CA-7 a CA-21)
  - Teste: `errors.test.ts` aceita `DomainErrorResponseSchema` com `UNAUTHENTICATED` e `ORGANIZER_REQUEST_NOT_PENDING`.

### E2 — Infra (trilha B)

- [ ] T-5 Instalar dependências: `pnpm --filter @stubb/write-service add jose nodemailer`, `pnpm --filter @stubb/write-service add -D @types/nodemailer` e `pnpm --filter @stubb/read-service add jose`. Manter as entradas que o pnpm grava em `pnpm-workspace.yaml` (napkin linha 32). (cobre CA-8)
  - Teste: `pnpm install --frozen-lockfile` passa.
- [ ] T-6 Criar `infra/scripts/generate-jwt-keys.mjs` conforme I-2 (Node puro, ESM, só `node:crypto`, `node:fs` e `node:path`; caminho do `.env` resolvido a partir da raiz do repo) e o script `"jwt:keys": "node infra/scripts/generate-jwt-keys.mjs"` no `package.json` da raiz. Rodar uma vez para preencher o `.env` local. (cobre CA-8)
  - Teste: rodar sem `.env` cria o arquivo a partir do `.env.example`, com as duas chaves preenchidas; rodar de novo sem `--force` não muda as chaves; com `--force`, muda; as outras linhas do `.env` ficam iguais (comparar antes e depois). Conferir que `git status` não lista o `.env`.
- [ ] T-7 Variáveis e compose (cobre CA-25, CA-27). **Ler o texto atual** de `docker-compose.yaml`, `docker-compose.override.yaml`, `.env.example` e `.env` antes de editar: eles já interpolam `${VAR:-default}` e mudaram depois da pesquisa.
  - `.env.example`: acrescentar, em blocos comentados em PT-BR no estilo do arquivo, todas as variáveis de I-2 (Identity, SMTP, seed e `MAILPIT_HOST_PORT` no bloco de portas), com as notas da tabela; remover `SEED_ORGANIZER_ID` e o comentário dele;
  - `.env`: mesmas variáveis com os mesmos valores (as chaves já vêm do T-6) e remover `SEED_ORGANIZER_ID`. Se o usuário tiver mudado algum valor existente, manter o dele;
  - `docker-compose.yaml`:
    - remover a âncora `x-seed-organizer-id` e seus dois usos;
    - em `write-service.environment`, acrescentar as variáveis de I-2, exatamente na forma da coluna "No compose";
    - em `read-service.environment`, acrescentar `JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY:?Gere as chaves com: pnpm jwt:keys}`;
    - criar o serviço `mailpit` com `image: axllent/mailpit:<versão fixada>`, `mem_limit: 128m`, `restart: unless-stopped` e `ports: ['${MAILPIT_HOST_PORT:-8025}:8025']`;
    - em `write-service.depends_on`, acrescentar `mailpit: { condition: service_started }`.

  Para fixar a versão: rodar `docker --context wsl-engine pull axllent/mailpit:latest` e depois `docker --context wsl-engine run --rm axllent/mailpit:latest version`, e usar a tag `v<versão impressa>`. Antes, conferir que a 8025 está fora das faixas de `netsh interface ipv4 show excludedportrange protocol=tcp` (napkin linha 25). O `docker-compose.override.yaml` tem alterações locais do usuário ainda não commitadas: não reverter nada nele; só editar se for indispensável (o `environment` do base vale no dev).
  - Teste: `docker --context wsl-engine compose config` sem erro, com as variáveis da Identity resolvidas e sem `SEED_ORGANIZER_ID`. Com `JWT_PUBLIC_KEY` vazia no shell e fora do `.env`, o mesmo comando falha com a mensagem `Gere as chaves com: pnpm jwt:keys`.
- [ ] T-8 Nos dois `nginx.*.conf`, acrescentar antes de `location /api/` um bloco `location /api/identity/ { proxy_pass http://write_service; ... }` com os mesmos `proxy_http_version`, `proxy_set_header` e `proxy_read_timeout` do `location /api/` do arquivo. (cobre CA-12)
  - Teste: `docker --context wsl-engine run --rm -v /c/Stubb/stubb/infra/nginx/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro nginx:<tag usada no Dockerfile> nginx -t` falha só por upstream não resolvido, nunca por sintaxe; a validação definitiva fica com K.

### E3 — Docs (trilha C)

- [ ] T-9 Criar o ADR `0010-identity-contexto-crud.md` no formato dos ADRs existentes. Contexto: Identity sem CQRS. Decisão: D-1, D-2, D-4, D-6, D-17. Consequências: exceção do gateway, sem `min_version`, e um evento futuro exige tópico (`create-topics.sh`) e nunca leva PII. (cobre CA-32)
- [ ] T-10 Em `overview.md`, linha da Identity (`:57`) e diagrama/roteamento: `/api/identity/*` → write-service; Mailpit; papéis. Em `0002-gateway-nginx.md`, nota da exceção apontando para o ADR 0010. Em `glossary.md`, atualizar a linha 26 (Produtor: conta aprovada pelo admin; o seed vira conta real) e acrescentar Admin (`Admin`), Pedido de produtor (`OrganizerRequest`), Verificação de e-mail (`EmailVerification`) e uma nota de que Portaria está só reservada até a Fase 6.
  - Teste: `pnpm prettier --check docs` passa.

### E4 — Write-service: autenticação, schema e posse (trilha D)

- [ ] T-11 `config.ts`: remover `SEED_ORGANIZER_ID` e acrescentar as variáveis de I-2 com os defaults da tabela. `JWT_*` ficam `z.string().min(1).optional()`; booleanos são `z.enum(['true', 'false'])` transformados; `PUBLIC_WEB_URL` é `z.url()`. (cobre CA-25)
- [ ] T-12 `src/auth/jwt-keys.ts`: provider que decodifica o base64 das variáveis e importa as chaves com `importPKCS8(pem, 'EdDSA')` e `importSPKI(pem, 'EdDSA')` do `jose`. Lança `Error('JWT_PRIVATE_KEY/JWT_PUBLIC_KEY ausente')` no bootstrap se faltar. (cobre CA-8)
- [ ] T-13 `AccessTokenIssuer` (`SignJWT` com `alg: 'EdDSA'`, `sub`, `roles`, `iss`, `aud`, `iat` do `Clock` em segundos, `exp = iat + 900`) e `AccessTokenVerifier` (`jwtVerify` com `issuer`, `audience`, `algorithms: ['EdDSA']`, `clockTolerance: 30`, payload validado com `AccessTokenClaimsSchema`). (cobre CA-8, CA-12)
  - Teste: specs de ida e volta; token vencido, assinado com outra chave, com `aud` errado ou com `alg` diferente é recusado.
- [ ] T-14 `AuthGuard`, `decorators.ts`, `authenticated-user.ts` e `AuthModule` com `APP_GUARD`, conforme I-3. (cobre CA-12, CA-20)
  - Teste: spec do guard com `Reflector` real: rota pública, sem header, header malformado, papel ausente (403) e papel presente.
- [ ] T-15 `AppModule` importa `AuthModule`. `HealthController` e `PingsController` recebem `@Public()` na classe. `SharedModule` deixa de prover e exportar `CurrentOrganizer`; a pasta `shared/actor/` é removida. (cobre CA-24)
- [ ] T-16 Migration `1793145600000-IdentitySchema.ts` (classe `IdentitySchema1793145600000`) com o DDL abaixo e `down` na ordem inversa; registrar em `migrations/index.ts`. (cobre CA-1, CA-14, CA-26)
  ```sql
  CREATE TABLE "identity_users" (
    "id" uuid NOT NULL,
    "email" text NOT NULL,
    "password_hash" text NOT NULL,
    "full_name" text NOT NULL,
    "cpf" character(11) NOT NULL,
    "email_verified_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "pk_identity_users" PRIMARY KEY ("id"),
    CONSTRAINT "uq_identity_users_email" UNIQUE ("email"),
    CONSTRAINT "uq_identity_users_cpf" UNIQUE ("cpf"),
    CONSTRAINT "ck_identity_users_email_lower" CHECK ("email" = lower("email"))
  );
  CREATE TABLE "identity_user_roles" (
    "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
    "role" text NOT NULL,
    "granted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "pk_identity_user_roles" PRIMARY KEY ("user_id", "role"),
    CONSTRAINT "ck_identity_user_roles_role" CHECK ("role" IN ('customer', 'organizer', 'admin', 'gate_staff'))
  );
  CREATE TABLE "identity_email_verifications" (
    "id" uuid NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
    "token_hash" character(64) NOT NULL,
    "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "used_at" TIMESTAMP WITH TIME ZONE,
    "invalidated_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "pk_identity_email_verifications" PRIMARY KEY ("id"),
    CONSTRAINT "uq_identity_email_verifications_token_hash" UNIQUE ("token_hash")
  );
  CREATE INDEX "idx_identity_email_verifications_user_created" ON "identity_email_verifications" ("user_id", "created_at");
  CREATE TABLE "identity_refresh_tokens" (
    "id" uuid NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
    "family_id" uuid NOT NULL,
    "token_hash" character(64) NOT NULL,
    "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "revoked_at" TIMESTAMP WITH TIME ZONE,
    "replaced_by" uuid,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "pk_identity_refresh_tokens" PRIMARY KEY ("id"),
    CONSTRAINT "uq_identity_refresh_tokens_token_hash" UNIQUE ("token_hash")
  );
  CREATE INDEX "idx_identity_refresh_tokens_family" ON "identity_refresh_tokens" ("family_id");
  CREATE TABLE "identity_organizer_requests" (
    "id" uuid NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
    "organization_name" text NOT NULL,
    "cnpj" character(14) NOT NULL,
    "reason" text NOT NULL,
    "status" text NOT NULL,
    "rejection_message" text,
    "decided_by" uuid REFERENCES "identity_users"("id"),
    "decided_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "pk_identity_organizer_requests" PRIMARY KEY ("id"),
    CONSTRAINT "ck_identity_organizer_requests_status" CHECK ("status" IN ('pending', 'approved', 'rejected'))
  );
  CREATE UNIQUE INDEX "uq_identity_organizer_requests_pending" ON "identity_organizer_requests" ("user_id") WHERE "status" = 'pending';
  CREATE INDEX "idx_identity_organizer_requests_status_created" ON "identity_organizer_requests" ("status", "created_at");
  ```
  - Teste: `setup.ts` roda as migrations; um teste em `auth.int.test.ts` confere que as cinco tabelas existem e que a migration não toca `outbox`.
- [ ] T-17 `test/support/auth.ts` conforme I-3. `setup.ts` passa a importá-lo na primeira linha de import, e `truncateAll` inclui `identity_refresh_tokens, identity_email_verifications, identity_organizer_requests, identity_user_roles, identity_users`. (cobre R-1)
- [ ] T-18 `shared/idempotency/scope.ts` conforme I-3. (cobre CA-22)
  - Teste: `scope.spec.ts`.
- [ ] T-19 Catalog (cobre CA-20, CA-21, CA-22):
  - os 14 `*.command.ts` ganham `actorId: string` como primeiro campo do construtor;
  - `create-event` e `register-venue` usam `command.actorId` como `organizerId`;
  - `requireVenue(repository, id, actorId)` e `requireEvent(repository, id, actorId)` lançam `AggregateNotFoundError` também quando `aggregate.organizerId !== actorId`;
  - os 11 handlers restantes passam `command.actorId`;
  - `schedule-session.handler.ts` trata local com `organizerId !== actorId` exatamente como local inexistente (422 `VENUE_NOT_FOUND`).
- [ ] T-20 `events.controller.ts` e `venues.controller.ts`: `@Roles('organizer')` na classe; cada rota recebe `@CurrentUser() user: AuthenticatedUser`, passa `user.id` ao command e usa `idempotencyScope(<template atual>, user.id)` como `scope`. (cobre CA-20, CA-22)
- [ ] T-21 Testes do Catalog:
  - `test/integration/catalog/helpers.ts`: `send()` envia o Bearer de `TEST_ORGANIZER_ID` por padrão e aceita outro `sub`;
  - os testes existentes passam sem mudar o que verificam;
  - `test/unit/catalog/*` passam `actorId` nos commands;
  - `shared-infra.int.test.ts` deixa de usar o seed.

  (cobre CA-32)
- [ ] T-22 `test/integration/auth.int.test.ts` e `test/integration/catalog/ownership.int.test.ts` (cobre CA-20, CA-21, CA-22, CA-24):
  - 401 sem token e 403 com só `customer` em uma rota de cada controller, sem linha nova em `idempotency_keys`;
  - B recebe 404 em pelo menos um command de local e um de evento, inclusive com `expectedVersion` errada;
  - 422 `VENUE_NOT_FOUND` ao agendar sessão com local de A;
  - mesma chave e mesmo corpo por A e B geram dois locais;
  - `GET /health` e os pings respondem sem token.

### E5 — Read-service: autenticação (trilha E)

- [ ] T-23 `config.ts`: remover `seedOrganizerId` e acrescentar `jwtPublicKey?: string` (de `JWT_PUBLIC_KEY`). (cobre CA-23)
- [ ] T-24 `src/auth/`: `AccessTokenVerifier` (mesma verificação de T-13, só chave pública), `AuthGuard`, `decorators.ts` (`Public`, `Roles`, `CurrentUser`) e `AuthModule.forRoot(options?: { publicKeyPem?: string })` com `APP_GUARD`. O default vem de `loadConfig()`, e a falta da chave lança no bootstrap. `AppModule` importa `AuthModule.forRoot()`. (cobre CA-23)
  - Teste: specs do verifier e do guard (mesmos casos de T-13 e T-14).
- [ ] T-25 Catalog read (cobre CA-23):
  - as 4 queries do produtor ganham `organizerId` como primeiro campo e os handlers filtram por ele;
  - remover `seed-organizer.ts` e o provider em `catalog.module.ts`;
  - `organizer.controller.ts` com `@Roles('organizer')` e `@CurrentUser()`;
  - `public-events.controller.ts`, `HealthController` e os controllers de diagnostics com `@Public()`.
- [ ] T-26 Testes (cobre CA-23, CA-24, R-6):
  - `test/support/auth.ts` gera o par efêmero e expõe `signTestToken` e `authHeader`, com a mesma assinatura de I-3;
  - `catalog-setup.ts` troca o `overrideProvider(SEED_ORGANIZER_ID)` por `AuthModule.forRoot({ publicKeyPem })`;
  - `catalog-organizer.int.test.ts` usa Bearer de `OWNER` e `OTHER_OWNER` e acrescenta 401 sem token e 403 sem papel nas 4 rotas;
  - os testes da vitrine e da página continuam sem token.

### E6 — Web: sessão (trilha F)

- [ ] T-27 `auth-session.ts` e `http.ts` (cobre CA-12, CA-28):
  - `sendCommand` e `getJson` enviam `Authorization: Bearer` quando há token;
  - em 401, chamam `refreshSession()` uma vez e repetem a requisição; se o refresh falhar, lançam o `ApiError` 401;
  - nova função `sendJson<T>(method, url, body, schema, { idempotencyKey?, expectedStatus })` para as respostas 200/202/204 da Identity;
  - o refresh usa `fetch(identityRoutes.sessionRefresh(), { method: 'POST', credentials: 'same-origin' })`;
  - nada vai para `localStorage` nem `sessionStorage`.
  - Teste: `http.test.ts` e `auth-session.test.ts`: Bearer anexado; 401 → refresh → repetição; duas chamadas simultâneas de `refreshSession()` fazem um único `fetch`; refresh 401 limpa o token.
- [ ] T-28 `api/identity.ts`, `query-keys.ts`, `features/session/session-provider.tsx` e `route-guards.tsx` conforme I-4. `main.tsx` envolve o app com `SessionProvider` dentro do `QueryClientProvider`. (cobre CA-28, CA-29)
  - Teste: `identity.test.ts` (uma chamada por função contra o fake-api); `session-provider.test.tsx` (loading → authenticated/anonymous, signOut limpa o cache); `route-guards.test.tsx` (redireciona com `redirect`; `AccessDenied` sem papel; `safeRedirect` recusa `//evil.com` e `https://...`).
- [ ] T-29 `root-layout.tsx` (cobre CA-27, CA-28, CA-29):
  - anônimo: links "Entrar" (`/entrar`) e "Criar conta" (`/cadastro`);
  - autenticado: nome vindo de `getMe` no TanStack Query, "Minha conta" (`/conta`), "Área do produtor" só com `organizer`, "Administração" (`/admin/produtores`) só com `admin`, e botão "Sair", que chama `signOut()` e navega para `/`;
  - remover o link fixo para `/produtor/eventos` quando anônimo.

  `render.tsx` e `fake-api.ts` conforme I-4.
  - Teste: `root-layout.test.tsx` cobre os três estados (anônimo, customer, admin); a suíte web existente continua passando sem editar os testes das páginas do produtor.

### E7 — E2E: suporte e testes de API (trilha J)

- [ ] T-30 `env.ts`, `http.ts`, `mailpit.ts` e `identity.ts` conforme I-5. (cobre CA-25, CA-27)
- [ ] T-31 `support/catalog.ts` e `seed/catalog-seed.ts` fazem login como produtor seed antes de qualquer chamada do produtor (token cacheado). `catalog.e2e.test.ts` passa a usar o token. (cobre CA-25, CA-32)
- [ ] T-32 `identity.e2e.test.ts`, contra a stack pelo gateway `127.0.0.1:8080`, cobrindo CA-1, CA-3, CA-5, CA-6 (só o caso do link invalidado, esperando 60 s com `vi.setConfig({ testTimeout: 90_000 })`), CA-7, CA-8, CA-9, CA-11, CA-12 (inclusive que o GET passa pelo gateway), CA-13, CA-14, CA-15, CA-16 (aprovar → refresh → criar local), CA-17, CA-18, CA-19, CA-21 e CA-23 com dois produtores reais, e CA-25 (login do admin e do produtor seed).
  - Teste: `pnpm --filter @stubb/e2e typecheck` passa; a execução fica com K.

### E8 — Write-service: módulo Identity (trilha H)

- [ ] T-33 Estrutura em `apps/write-service/src/identity/`. (cobre todos os CA de API)
  ```
  identity.module.ts
  identity.errors.ts                      IdentityError(code, status, message)
  application/registration.service.ts     register, issueVerification, confirmEmail, resendVerification
  application/session.service.ts          login, refresh, logout
  application/profile.service.ts          getMe, listMyOrganizerRequests
  application/organizer-requests.service.ts  request, listForAdmin, approve, reject
  application/identity-seeder.ts          OnApplicationBootstrap
  application/identity-cleanup.job.ts     @Cron diário
  infrastructure/entities/*.entity.ts     5 entities TypeORM (mesmos nomes de coluna do DDL)
  infrastructure/password-hasher.ts       scrypt (D-3)
  infrastructure/secure-token.ts          generate() 32 bytes base64url; sha256Hex()
  infrastructure/mailer.ts                class Mailer (nodemailer, createTransport(config.SMTP_URL))
  infrastructure/verification-email.ts    assunto, texto e HTML em PT-BR
  http/users.controller.ts                POST users, GET me, GET me/organizer-requests
  http/email-verifications.controller.ts  POST email-verifications, POST email-verifications/confirm
  http/session.controller.ts              POST session, POST session/refresh, DELETE session
  http/organizer-requests.controller.ts   POST organizer-requests
  http/admin-organizer-requests.controller.ts  GET, POST :requestId/approve, POST :requestId/reject
  http/refresh-cookie.ts                  readRefreshCookie(req), setRefreshCookie(res, token), clearRefreshCookie(res)
  http/identity-error.filter.ts
  ```
  Controllers sob `@Controller('identity/...')`, validação com o `ZodValidationPipe` existente e os schemas de I-1. Acesso exatamente como na coluna "Acesso" da Spec (seção HTTP): `@Public()` em `POST users`, nas duas rotas de `email-verifications` e nas três de `session`; `GET me`, `GET me/organizer-requests` e `POST organizer-requests` só autenticados (sem `@Roles`); o controller admin com `@Roles('admin')`. Todo horário vem do `Clock` (nunca `now()` no SQL), para os testes controlarem 24 h e 60 s. Transações com o `TransactionContext` compartilhado.
- [ ] T-34 `PasswordHasher` (cobre CA-1, CA-26):
  - `hash(password)` → `scrypt$16384$8$5$<salt>$<hash>`, com `maxmem` de 64 MiB;
  - `verify(password, stored)` compara com `timingSafeEqual`;
  - `verifyAgainstDummy()` roda contra um hash fixo gerado na inicialização do provider.
  - Teste: spec de ida e volta; senha errada; formato.
- [ ] T-35 Cadastro (cobre CA-1 a CA-4, CA-26):
  - o controller usa `IdempotencyService.execute` com `scope = idempotencyScope(IDENTITY_ROUTE_TEMPLATES.registerUser)` (sem ator) e `requestHash = hashRequest('POST', <template>, { fullName, email, cpf })`, sem a senha;
  - dentro da operação: checa e-mail e depois CPF (409 com o código certo); insere usuário (`id` uuid v7, `email_verified_at` null) e papel `customer`; converte violação 23505 de `uq_identity_users_email`/`uq_identity_users_cpf` nos mesmos 409; marca `executed = true` numa variável do closure e devolve `{ id }`;
  - depois do `execute`, só se `executed`, chama `registration.issueVerification(id)`: em transação própria, invalida tokens abertos (`invalidated_at`), cria token novo (TTL 24 h, só o hash no banco) e, depois do commit, envia o e-mail. Falha de envio vai para `Logger.warn` sem CPF nem token e não muda a resposta;
  - responde 202.
  - Teste: `test/integration/identity/registration.int.test.ts` com `FakeMailer` (`test/support/fake-mailer.ts`: guarda `{ to, subject, text, html }`, com `extractToken(email)`) e `Clock` sobrescrito.
- [ ] T-36 Confirmação e reenvio (cobre CA-5, CA-6):
  - `confirmEmail(token)`: busca pelo hash; inexistente, `invalidated_at` preenchido ou `expires_at <= agora` → 422 `VERIFICATION_TOKEN_INVALID`; `used_at` preenchido → 202 sem mudança; senão marca `used_at` e `email_verified_at` na mesma transação e responde 202 `{ id: userId }`;
  - `resendVerification(email)`: sempre 202 `{}`. Só emite se a conta existe, não está verificada e o último token tem 60 s ou mais (pelo `created_at`).
  - Teste: `email-verification.int.test.ts` avançando o `Clock`.
- [ ] T-37 Sessão (cobre CA-7 a CA-11):
  - **login:**
    - usuário inexistente → `verifyAgainstDummy` e 401 `INVALID_CREDENTIALS`;
    - senha errada → 401 com a mesma mensagem (`E-mail ou senha inválidos`);
    - não verificado → 403 `EMAIL_NOT_VERIFIED`;
    - sucesso: lê os papéis, cria uma família (`family_id` uuid v7) e um refresh (hash, `expires_at = agora + 7 dias`), emite o access token e grava o cookie com `res.cookie(REFRESH_COOKIE_NAME, token, { httpOnly: true, sameSite: 'strict', path: REFRESH_COOKIE_PATH, maxAge: 604800 * 1000, secure: config.COOKIE_SECURE })`. No Express o `maxAge` é em milissegundos;
  - **refresh:**
    - `UPDATE identity_refresh_tokens SET replaced_by = $novo WHERE token_hash = $1 AND revoked_at IS NULL AND replaced_by IS NULL AND expires_at > $agora RETURNING user_id, family_id`;
    - 0 linhas: se o hash existe, revoga a família inteira (`revoked_at = agora` onde `revoked_at IS NULL`); limpa o cookie e responde 401 `SESSION_INVALID`;
    - 1 linha: insere o novo token na mesma família, relê os papéis e emite access token e cookie;
  - **logout:** revoga a família do cookie, se houver, limpa o cookie com `res.clearCookie(name, { path })` e responde 204.

  O cookie é lido de `req.headers.cookie` por `readRefreshCookie`, sem dependência nova. Usar `@Res({ passthrough: true })`.
  - Teste: `session.int.test.ts` com supertest lendo `set-cookie` (flags exatas de CA-8), reuso revogando a família e refresh relendo os papéis (CA-10).
- [ ] T-38 `GET me` e histórico (cobre CA-12, CA-19): `getMe` devolve `cpf: maskCpf(...)`; o histórico vem ordenado por `created_at DESC`.
  - Teste: `profile.int.test.ts`.
- [ ] T-39 Pedidos de produtor (cobre CA-13 a CA-18):
  - **request** (`@CurrentUser`, escopo `idempotencyScope(template, user.id)`): papel `organizer` no banco → 409 `ALREADY_ORGANIZER`; pendente existente → 409 `ORGANIZER_REQUEST_PENDING`; insere `pending`; 23505 em `uq_identity_organizer_requests_pending` vira o mesmo 409;
  - **listForAdmin:** filtro por status; ordem `created_at ASC` para `pending` e `decided_at DESC` para os demais; `total` por `count`; join com o usuário para `requester`;
  - **approve:** numa transação, `UPDATE ... SET status = 'approved', decided_by, decided_at WHERE id = $1 AND status = 'pending' RETURNING user_id`; 0 linhas → 404 se o id não existe, 409 `ORGANIZER_REQUEST_NOT_PENDING` se existe; depois `INSERT INTO identity_user_roles (...) VALUES (...) ON CONFLICT ("user_id", "role") DO NOTHING`, com alvo explícito (napkin linha 43);
  - **reject:** mesmo `UPDATE` condicional com `status = 'rejected'` e `rejection_message`;
  - admin controller com `@Roles('admin')`; approve e reject com `Idempotency-Key` e escopo por ator.
  - Teste: `organizer-requests.int.test.ts`, com concorrência por `Promise.all` de duas aprovações e de dois pedidos.
- [ ] T-40 `IdentitySeeder` (cobre CA-25):
  - só roda com `config.IDENTITY_SEED_ENABLED`;
  - admin: `INSERT ... ON CONFLICT ("email") DO NOTHING` com `email_verified_at` preenchido e papéis `customer`, `organizer`, `admin` (`ON CONFLICT ("user_id", "role") DO NOTHING`);
  - produtor seed: mesmo padrão com o id fixo, papéis `customer` e `organizer`, e um pedido `approved` (organização e CNPJ de I-2, motivo `Conta de demonstração do Catalog`, `decided_by` = id do admin) inserido só se o usuário não tiver nenhum pedido;
  - registra no log só os e-mails.
  - Teste: `seeder.int.test.ts` roda o seeder duas vezes e confere as contagens.
- [ ] T-41 `IdentityCleanupJob` (`@Cron('0 4 * * *')`): apaga refresh tokens com `expires_at` ou `revoked_at` mais antigos que 7 dias, e verificações com `expires_at` mais antigo que 7 dias. (cobre CA-26)
  - Teste: `cleanup.int.test.ts` chamando o método direto.
- [ ] T-42 `IdentityErrorFilter`: `IdentityError` vira o corpo `DomainErrorResponseSchema` com o status definido no erro (401, 403, 404, 409, 422). `IdentityModule` registrado no `AppModule`. (cobre CA-7 a CA-18)
  - Teste: `test/unit/identity/identity-error.filter.spec.ts`.
- [ ] T-43 Teste de segredos (cobre CA-26): depois de cadastro, login, refresh e pedido, nenhuma coluna de `identity_*` nem `idempotency_keys.response_body` contém a senha, o token de verificação ou o refresh em claro.

### E9 — Web: telas da Identity (trilha I)

- [ ] T-44 `RegisterPage` em `/cadastro` (cobre CA-2, CA-27):
  - React Hook Form + `zodResolver(RegisterUserRequestSchema)`, com campos Nome completo, E-mail, Senha e CPF (máscara visual opcional);
  - `Idempotency-Key` gerada uma vez por formulário;
  - em 202, tela "Enviamos um link para <e-mail>. Abra o e-mail para ativar a conta.", com botão "Reenviar link";
  - erros 409 mostrados no campo certo (`EMAIL_ALREADY_REGISTERED` no e-mail, `CPF_ALREADY_REGISTERED` no CPF).
- [ ] T-45 `VerifyEmailPage` em `/verificar-email` (cobre CA-5, CA-27): lê `token` da URL e chama `confirmEmail` uma vez (ref para o StrictMode). Sucesso: "E-mail confirmado" + link "Entrar". 422: "Link inválido ou vencido" + formulário de reenvio por e-mail.
- [ ] T-46 `LoginPage` em `/entrar` (cobre CA-7, CA-27, CA-29): `signIn`; sucesso navega para `safeRedirect(searchParams.get('redirect'))`. 401: "E-mail ou senha inválidos". 403 `EMAIL_NOT_VERIFIED`: "Confirme seu e-mail antes de entrar" + botão "Reenviar link", que chama `resendVerification` e mostra "Se a conta existir e não estiver confirmada, enviamos um novo link." Link para `/cadastro`.
- [ ] T-47 `AccountPage` em `/conta` (cobre CA-12, CA-19, CA-30, CA-31):
  - dados de `getMe` (nome, e-mail, CPF mascarado, papéis em PT-BR: Cliente, Produtor, Admin);
  - seção "Quero vender ingressos": sem `organizer` e sem pedido pendente, formulário (Nome da organização, CNPJ, Motivo) com `RequestOrganizerRoleRequestSchema`;
  - histórico de `listMyOrganizerRequests` com selo Pendente/Aprovado/Recusado, datas em pt-BR e mensagem de recusa;
  - com pedido pendente, sem formulário e com `refetchInterval: 10_000`;
  - se o pedido mais novo está `approved` e o usuário da sessão não tem `organizer`, chama `refresh()` da sessão uma vez e invalida `identity.me`;
  - com `organizer`, link "Área do produtor".
- [ ] T-48 `AdminOrganizerRequestsPage` em `/admin/produtores` (cobre CA-15, CA-16, CA-17, CA-30, CA-31):
  - abas Pendentes, Aprovados e Recusados (parâmetro `status`), com paginação simples (anterior/próxima);
  - cada item mostra nome, e-mail, organização, CNPJ formatado, motivo e data;
  - "Aprovar" e "Recusar" (diálogo com mensagem opcional de até 500 caracteres), com `Idempotency-Key` por ação;
  - depois de decidir, invalida a lista;
  - 409 `ORGANIZER_REQUEST_NOT_PENDING` mostra "Este pedido já foi decidido" e recarrega.

  Componentes shadcn que faltarem (`dialog`, `tabs`): `pnpm dlx shadcn@latest add dialog tabs --overwrite </dev/null` dentro de `apps/web` (napkin linha 42). Instalar componente que crie dependência npm nova é proibido sem perguntar no Board.
- [ ] T-49 `router.tsx`:
  - rotas novas `/entrar`, `/cadastro`, `/verificar-email`, `/conta` (`RequireAuth`) e `/admin/produtores` (`RequireRole role="admin"`);
  - `produtor` envolvido por `RequireRole role="organizer"`;
  - `router.test.tsx` atualizado.

  (cobre CA-29)
  - Teste: testes de página com o fake-api para cada tela (sucesso e cada erro listado acima); `router.test.tsx` com sessão `null`, `customer` e `admin`.

### E10 — Integração (trilha K)

- [ ] T-50 Conferir que o `.env` tem as chaves JWT (senão, `pnpm jwt:keys`). Subir a stack do zero: `$env:COMPOSE_CONVERT_WINDOWS_PATHS='1'; pnpm stack:down; pnpm stack:up`. Conferir `docker --context wsl-engine compose ps`: todos `healthy`/`running`, Mailpit em `http://127.0.0.1:<MAILPIT_HOST_PORT>` e o log do write-service com o seed. (cobre CA-25)
- [ ] T-51 `pnpm seed:catalog`, depois `pnpm --filter @stubb/e2e test:e2e`; corrigir o que falhar, registrando no Board. (cobre CA-1 a CA-25, CA-32)
- [ ] T-52 `apps/web/e2e/identity.spec.ts` (Playwright, `E2E_BASE_URL`, links via API do Mailpit com `request`):
  - cadastro → verificação → login → header;
  - login antes de verificar mostra o reenvio;
  - reload mantém a sessão e o storage não tem token;
  - logout;
  - guards em `/produtor/eventos`, `/conta` e `/admin/produtores`;
  - pedido → admin aprova (segundo `browser.newContext()`) → "Área do produtor" aparece;
  - recusa com mensagem.

  `catalog-organizer.spec.ts` faz login como produtor seed antes de navegar. (cobre CA-27 a CA-31)
- [ ] T-53 `pnpm --filter @stubb/web test:e2e`, `pnpm replay` e, de novo, `pnpm --filter @stubb/e2e test:e2e`. (cobre CA-32)

## Verificação

Ao fim de cada onda, o thread principal roda os itens 1 a 4 (napkin linha 33). Ao fim da onda 4, todos.

```
# 1. Contratos e tipos
pnpm --filter @stubb/contracts build
pnpm typecheck                         # esperado: sem erros

# 2. Lint completo (raiz)
pnpm lint                              # esperado: eslint e prettier sem erros

# 3. Testes unitários de todos os pacotes
pnpm test                              # esperado: tudo verde

# 4. Integração (bancos de teste das suítes, como hoje)
pnpm --filter @stubb/write-service test:integration   # esperado: verde, inclusive identity/* e catalog/ownership
pnpm --filter @stubb/read-service test:integration    # esperado: verde, com 401/403 nas rotas do produtor

# 5. Stack completa (só na onda 4, PowerShell)
$env:COMPOSE_CONVERT_WINDOWS_PATHS='1'
pnpm jwt:keys                          # esperado: chaves presentes no .env (sem --force não sobrescreve)
pnpm stack:down
pnpm stack:up                          # esperado: --wait termina com todos saudáveis
docker --context wsl-engine compose ps

# 6. Seed, E2E e replay
pnpm seed:catalog                      # esperado: cria ou reconhece os dados, logado como produtor seed
pnpm test:e2e                          # esperado: e2e de API e Playwright verdes
pnpm replay                            # esperado: read models reconstruídos; e2e de query continua verde

# 7. Conferência manual rápida
# http://127.0.0.1:8080/cadastro -> cadastro; http://127.0.0.1:8025 -> e-mail chegou; link abre /verificar-email
```

## Notas para o implementador

- **Por que Identity é CRUD:** o módulo não usa CommandBus, outbox nem MongoDB. Não crie evento de domínio nem projeção da Identity. Se achar que precisa, pare e pergunte no Board.
- **Ordem de checagem no Catalog:** posse (404) antes de versão (409). Por isso a checagem fica em `require.ts`, que roda antes do `update` com versão esperada.
- **Guard default-deny:** todo controller novo sem `@Public()` exige token. Health e diagnostics precisam de `@Public()`, senão o healthcheck do compose e quatro suítes E2E quebram.
- **Teste sem guard:** o setup de teste do read-service não usa `AppModule`. Sem `AuthModule.forRoot(...)` no setup, as rotas ficam abertas sem ninguém notar (R-6).
- **`config.ts` do write-service lê o env na importação** (napkin linha 45). O `test/support/auth.ts` precisa ser importado antes do `import()` do `AppModule`, e as chaves JWT são opcionais no Zod justamente para não quebrar specs unitárias.
- **`ON CONFLICT` sempre com alvo explícito;** nunca `.orIgnore()` do TypeORM (napkin linha 43).
- **Zod 4:** `z.uuid()` exige versão e variante válidas; use os ids das tabelas acima (napkin linha 44).
- **Lint tipado:** use os helpers `body<T>(res)` e o cast de `Server` existentes (napkin linha 27).
- **Testes web:** `asyncUtilTimeout` já está em 5 s (napkin linha 41). O `refreshSession` no mount roda duas vezes no StrictMode; a chamada única em voo resolve.
- **Endereços:** use sempre `127.0.0.1`, nunca `localhost` (napkin linha 29), inclusive em `PUBLIC_WEB_URL` e `E2E_MAILPIT_URL`.
- **Escopo do Debezium:** o conector captura só a tabela `outbox`. As tabelas `identity_*` nunca chegam ao Kafka, e é isso que se quer.
- **`.env` e `.env.example`:** só a trilha B mexe neles. Os apps não leem `.env`; recebem tudo pelo `environment:` do compose. Testes de integração e unitários não dependem do `.env`: as chaves vêm de `test/support/auth.ts`. Nunca commitar o `.env` nem colar chaves no `.env.example`.
- **Alterações locais do usuário:** `docker-compose.yaml`, `docker-compose.override.yaml`, `docs/roadmap.md` e `.claude/napkin.md` têm mudanças ainda não commitadas. Edite por trechos (Edit), nunca sobrescreva o arquivo inteiro. O roadmap é atualizado pelo thread principal, não pelas trilhas.
- **Formatação:** cada trilha roda `prettier --check` nos próprios arquivos (napkin linha 40). O lint completo é do thread principal.
- **API do Mailpit:** se a resposta de `/api/v1/messages` ou `/api/v1/message/{ID}` não tiver os campos `To[].Address` e `Text`, consulte a documentação atual do Mailpit (context7) antes de adaptar e registre no Board.
- **CNPJ alfanumérico:** a regra foi conferida pelo exemplo `12ABC34501DE35` (DV1 = 3, DV2 = 5). O teste desse caso é obrigatório.
- **Dúvida de regra de negócio:** não decida. Pare e pergunte (regra de ouro do `CLAUDE.md`).
