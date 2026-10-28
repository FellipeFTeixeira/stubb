---
feature: Identity
fase: 3 — Identity
date: 2026-10-27
status: implemented
---

# Identity — Research

## Objetivo

Trocar o produtor seed da Fase 2 por usuários reais: cadastro com CPF e verificação de e-mail, login com JWT, papéis (cliente, produtor, admin; portaria reservada), aprovação de produtor pelo admin, autorização nos serviços e validação de posse nos commands do Catalog (`docs/roadmap.md:14`, Decisões do Gate 1).

Conceito de CQRS exercitado: **nem todo contexto precisa de CQRS**. O `docs/architecture/overview.md:57` já classifica Identity como CRUD. A fase mostra o contraste com o Catalog: escrita e leitura no mesmo modelo relacional, consistência forte, sem outbox, sem projeção e sem `min_version`. O que atravessa os contextos é o **token**: o Catalog não consulta a Identity, confia nas claims assinadas (`sub`, `roles`). A identidade do ator vira **entrada do command** (quem pede) e **filtro da query** (o que cada um enxerga), sem mudar eventos nem read models.

## Escopo

**Dentro:**
- Módulo `identity` no write-service: cadastro, verificação de e-mail (envio, confirmação, reenvio), login, refresh, logout, `GET me`.
- Pedido de produtor (nome da organização, CNPJ, motivo) e decisão do admin (aprovar ou recusar com mensagem opcional), com histórico.
- Papéis `customer`, `organizer`, `admin`; `gate_staff` só reservado no modelo.
- Admin e produtor seed criados por seeder idempotente. O produtor seed mantém o UUID da Fase 2 e entra como conta aprovada.
- SMTP de desenvolvimento (Mailpit) no compose.
- Guards de autenticação e papel no write-service e no read-service; vitrine, página do evento, diagnostics e health continuam públicos.
- Catalog: ator vindo do JWT, posse em todos os commands, leituras do produtor filtradas pelo `sub`, idempotência por usuário. Saem `SEED_ORGANIZER_ID` e `CurrentOrganizer`.
- Nginx: `/api/identity/` inteiro para o write-service.
- Web: cadastro, login, verificação, minha conta (pedido de produtor e histórico), administração de pedidos, sessão com refresh silencioso, rotas protegidas.
- `libs/contracts`: contratos HTTP da Identity, validadores de CPF e CNPJ, papéis, claims, códigos de erro.
- Ajuste de testes, E2E e `pnpm seed:catalog` para autenticar.

**Fora:**
- Fluxo da portaria (criação, vínculo, escopo por evento): Fase 6 (Decisões, OQ-2).
- Recuperação e troca de senha, edição de perfil, troca de e-mail, exclusão de conta (P-6).
- Login social, MFA, bloqueio por tentativas, rate limit (Fase 9).
- Nome do produtor ou da organização na página pública (P-4).
- Uso do CPF em regra de compra (Fase 5) e titular (Fase 6).
- E-mail avisando o solicitante da decisão do pedido (P-9).

## Mapeamento da codebase

O mapeamento detalhado da integração está na parcial `SDD/WORK/2026-10-27-IdentityResearch-Integracao.md`, que prevalece onde é mais detalhada. Resumo do que sustenta as decisões:

| Área | Estado atual | Muda para |
|---|---|---|
| Ator no write-service | `shared/actor/current-organizer.ts:4-10` devolve `config.SEED_ORGANIZER_ID` (`config.ts:7`); só `create-event.handler.ts:15,20` e `register-venue.handler.ts:15,20` usam | `actorId` no command, vindo de `@CurrentUser()` |
| Posse no write-service | `catalog/application/require.ts:8-21` carrega agregado e lança `AggregateNotFoundError`; usado por 11 handlers; `schedule-session.handler.ts:23-24` carrega `Venue` sem checar dono | `requireVenue`/`requireEvent` recebem `actorId` e tratam outro dono como inexistente (404); local de outro dono na sessão vira 422 `VENUE_NOT_FOUND` |
| Controllers do Catalog (write) | `events.controller.ts:58-252` e `venues.controller.ts:47-117`, 14 rotas, escopo de idempotência = template da rota | `@Roles('organizer')`; escopo `${actorId} ${template}` (L-1) |
| Read-service | `catalog/seed-organizer.ts:3`, `catalog.module.ts:16`, `catalog.handlers.ts:101-184` filtram pelo seed; `organizer.controller.ts:24-70` público | Queries ganham `organizerId` vindo do token; controller com `@Roles('organizer')` |
| Idempotência | `shared/idempotency/idempotency.service.ts:24-55`, PK `(key, scope)`, hash `request-hash.ts:3-4` sobre o corpo inteiro | Reusada pela Identity; hash do cadastro sem a senha |
| Gateway | `infra/nginx/nginx.{dev,prod}.conf`: GET/HEAD → read, resto → write; mesma origem para web e API | `location /api/identity/` → write |
| Bootstrap | `apps/*/src/main.ts:8` prefixo `api` exclui `health`; `apps/write-service/src/app.module.ts:11-21` | `AuthModule` com `APP_GUARD` (L-3); `IdentityModule` |
| Migrations | `database/migrations/index.ts` com `InitialSchema` e `CatalogSchema` | `IdentitySchema` escrita à mão |
| Testes | `test/integration/setup.ts:22-41` monta `AppModule` e trunca tabelas; `read-service/test/integration/catalog-setup.ts:35-44` monta `CatalogModule` sem `AppModule` | Chaves efêmeras + `authHeader`; setup do read importa `AuthModule` |
| Web | `api/http.ts:28-62` sem auth, `sendCommand` aceita só 202; `app/router.tsx:24-32` `/produtor` aberto; `test/render.tsx` sem sessão | Bearer, refresh único em 401, guards, sessão no render |
| E2E e seed | `e2e/src/support/http.ts:15-39`, `support/catalog.ts`, `seed/catalog-seed.ts` anônimos | Login como produtor seed |
| Compose | âncora `x-seed-organizer-id` (`docker-compose.yaml:15`, usos `:193`, `:219`); só o gateway publica porta de app (`8080`) | Chaves JWT, SMTP, seed; serviço `mailpit` |

## Regras de negócio identificadas

| Regra | Fonte |
|---|---|
| Admin único, criado por seed, no topo da hierarquia admin > produtor > cliente | Decisões, OQ-1 |
| Produtor solicita o papel e aguarda aprovação do admin; sem autosserviço; pendente ou recusado segue cliente | Decisões, OQ-1 |
| Pedido de produtor: nome da organização, CNPJ validado por dígitos verificadores, motivo curto | Decisões, OQ-5 |
| Recusa com mensagem opcional visível ao solicitante; recusa nunca é definitiva | Decisões, OQ-6 |
| Portaria só reservada no modelo de papéis | Decisões, OQ-2 |
| CPF obrigatório, único, imutável, com dígitos verificadores; rejeita dígitos repetidos | Decisões, OQ-3 |
| Cadastro: nome completo, e-mail, senha (8 a 128, sem composição), CPF; sem data de nascimento; e-mail de verificação | Decisões, OQ-4 |
| Produtor só gerencia o que é dele; leituras do produtor só do que é dele; vitrine pública | Catalog Research, Decisões OQ-4, OQ-6, OQ-10, OQ-69; Catalog Spec RN-2 |
| `Idempotency-Key` em commands do cliente | `CLAUDE.md`, regra 9 |

## Decisões técnicas do planner

- **D-1 Estilo do contexto: CRUD simples.** Controller → serviço de aplicação → TypeORM, sem CommandBus/QueryBus internos, sem agregado versionado, sem outbox, sem read model. *Por quê:* nenhum contexto reage à Identity nesta fase; login e `me` pedem consistência forte; volume baixo. Os tópicos têm retenção infinita (`infra/kafka/create-topics.sh:8,11`), então CPF, e-mail e hash nunca devem ir para evento. Quando a Fase 5 precisar de CPF, a Identity expõe uma query pública in-process (regra 10).
- **D-2 Onde vive:** módulo `identity` no write-service, tabelas `identity_*`. O Nginx manda `/api/identity/` inteiro ao write-service, inclusive GET. Documentado num ADR 0010 e no `overview.md`.
- **D-3 Hash de senha:** `scrypt` do `node:crypto`, N=2^14, r=8, p=5, salt de 16 bytes, chave de 64 bytes, formato `scrypt$16384$8$5$<salt base64url>$<hash base64url>`, comparação com `timingSafeEqual`. Login com e-mail inexistente compara contra um hash fixo para igualar o tempo.
- **D-4 Tokens:** access token JWT EdDSA (Ed25519) via `jose`, 900 s, claims `sub`, `roles`, `iss=stubb-identity`, `aud=stubb-api`, `iat`, `exp`, tolerância de 30 s. Refresh token opaco de 32 bytes (base64url), 7 dias deslizantes, guardado como SHA-256, rotação a cada uso, reuso revoga a família. O write-service assina; o read-service só verifica.
- **D-5 Transporte no web:** access token em memória (módulo do cliente HTTP, fora de React state persistente e do Zustand). Refresh em cookie `stubb_refresh`, `HttpOnly`, `SameSite=Strict`, `Path=/api/identity/session`, `Max-Age` 7 dias, `Secure` por config (`COOKIE_SECURE`, default `true`, compose `false` porque a stack roda em `http://127.0.0.1`). Ao carregar, o web chama o refresh (chamada única em voo, cobre o StrictMode).
- **D-6 Validação nos serviços:** guard global **default-deny** em cada serviço (`AuthModule` com `APP_GUARD`, L-3); `@Public()` libera, `@Roles(...)` exige um dos papéis, `@CurrentUser()` entrega `{ id, roles }`. O Nginx só repassa `Authorization` e `Cookie`.
- **D-7 Respostas:** 401 `UNAUTHENTICATED` sem token ou token inválido; 403 `FORBIDDEN` sem o papel; 404 para recurso de outro produtor. Corpo no formato `DomainErrorResponseSchema` (L-5).
- **D-8 Posse no Catalog:** checada em `require.ts` comparando `aggregate.organizerId` com `actorId` (o campo já existe nos agregados, `catalog-event.aggregate.ts:67`, `venue.aggregate.ts:33`); agregado alheio lança o mesmo `AggregateNotFoundError`. A posse é decidida antes da versão, então o 409 não vaza existência. Contratos de eventos não mudam.
- **D-9 Idempotência:** `Idempotency-Key` obrigatório em cadastro, pedido de produtor, aprovação e recusa. Escopo `${actorId} ${template}` em rota autenticada e template puro no cadastro (L-1). Hash do cadastro sem `password`. Isentos, com justificativa: login, refresh e logout (resposta contém segredo, não pode ficar em cache); confirmação de e-mail (o token de uso único já é a chave natural); reenvio de verificação (sem efeito além de novo token, limitado a um envio por 60 s).
- **D-10 Schema:** `identity_users`, `identity_user_roles`, `identity_email_verifications`, `identity_refresh_tokens`, `identity_organizer_requests`. DDL exato no Plan. Um pedido pendente por conta garantido por índice único parcial; decisão por `UPDATE ... WHERE status = 'pending'` condicional (concorrência sem coluna `version`).
- **D-11 CPF:** só dígitos em `char(11)`, único; entrada aceita máscara; `GET me` devolve mascarado (`***.456.789-**`); nunca vai para token ou log.
- **D-12 Endpoints:** lista completa na Spec (seção HTTP).
- **D-13 Chaves:** par Ed25519 de desenvolvimento em variáveis de ambiente com o PEM em base64 numa linha (`JWT_PRIVATE_KEY` só no write-service, `JWT_PUBLIC_KEY` nos dois). As chaves são geradas no `.env` local por `pnpm jwt:keys`; o `.env.example` deixa as duas vazias, e o compose usa `${VAR:?...}` para falhar com instrução se faltarem (ajuste do Gate 2). Variáveis opcionais no Zod; o `AuthModule` falha no bootstrap se faltarem (evita quebrar testes unitários na importação de `config.ts`, napkin linha 45). Testes geram par efêmero.
- **D-14 Seed:** `IdentitySeeder` (`OnApplicationBootstrap`, só com `IDENTITY_SEED_ENABLED=true`) cria, se ausentes, o admin (`0193a4f0-0000-7000-8000-000000000000`, papéis customer + organizer + admin) e o produtor seed (`0193a4f0-0000-7000-8000-000000000001`, papéis customer + organizer, com pedido aprovado pelo admin). Ambos verificados. `INSERT ... ON CONFLICT (<alvo>) DO NOTHING` com alvo explícito (napkin linha 43).
- **D-15 Limpeza:** job diário apaga refresh tokens e verificações vencidos ou encerrados há mais de 7 dias.
- **D-16 Web:** rotas PT-BR `/entrar`, `/cadastro`, `/verificar-email`, `/conta`, `/admin/produtores`; guards de rota; header com estado de login; `queryClient.clear()` no logout e na troca de usuário (L-6).
- **D-17 SMTP:** Mailpit no compose base (SMTP interno `mailpit:1025`, UI e API em `127.0.0.1:8025`); envio com `nodemailer`. O e-mail é enviado **depois do commit**, só quando o cadastro realmente executou (não em replay idempotente). Falha de envio fica no log e o usuário usa o reenvio. *Por quê:* e-mail é efeito colateral de notificação, não evento de domínio; uma outbox de e-mail seria complexidade sem lição nova nesta fase.
- **D-18 Verificação de e-mail:** token de 32 bytes base64url, SHA-256 no banco, validade 24 h, uso único; reenvio invalida os anteriores e respeita 60 s desde o último envio; reenvio sempre responde 202 (não revela se a conta existe). Conta não verificada **não faz login** (403 `EMAIL_NOT_VERIFIED`, só depois da senha certa). *Por quê:* é a opção mais simples entre as duas da orientação do Gate 1 e evita estado "logado, mas limitado".
- **D-19 CNPJ:** aceita o formato numérico e o alfanumérico (vigente desde julho de 2026): 12 caracteres `[0-9A-Z]` + 2 dígitos verificadores numéricos, valor de cada caractere = código ASCII − 48, pesos 5,4,3,2,9,8,7,6,5,4,3,2 e 6,5,4,3,2,9,8,7,6,5,4,3,2, resto < 2 → 0, senão 11 − resto. Rejeita 14 caracteres iguais. Guardado normalizado em maiúsculas, sem máscara, em `char(14)`.
- **D-20 Hierarquia como papéis cumulativos:** a hierarquia admin > produtor > cliente é expressa nos dados: o admin tem `admin`, `organizer` e `customer`; o produtor tem `organizer` e `customer`. O guard só checa pertinência. O admin não ignora posse no Catalog (P-8).
- **D-21 Dependências:** `jose` (write e read), `nodemailer` e `@types/nodemailer` (write), instaladas numa onda anterior por uma trilha só, para o lockfile ter dono único.
- **D-22 Diagnostics público** em write e read (L-4).
- **D-23 Erros da Identity:** classe `IdentityError(code)` e `IdentityErrorFilter` próprios do módulo, sem mexer no `DomainErrorFilter` compartilhado.

### Premissas (decididas pelo planner; o usuário pode vetar)

- **P-1** Sessão: acesso 15 min, refresh 7 dias deslizantes, logout encerra só a sessão do dispositivo.
- **P-2** Toda conta nasce com `customer`; papéis cumulativos.
- **P-3** Sem bloqueio por tentativas; erro de login genérico.
- **P-4** Nome do produtor ou da organização fora das páginas públicas.
- **P-5** E-mail único sem diferenciar caixa; cadastro repetido devolve 409 dizendo que o e-mail está em uso.
- **P-6** Sem edição de perfil, troca ou recuperação de senha, exclusão de conta.
- **P-7** Limites de campo: nome completo 3 a 120 caracteres; nome da organização 2 a 120; motivo 1 a 500 ("motivo curto"); mensagem de recusa até 500; e-mail até 254.
- **P-8** O admin não edita nem vê eventos e locais de outros produtores; no Catalog ele age como um produtor comum sobre o que é dele.
- **P-9** Sem e-mail ao solicitante quando o pedido é decidido; ele vê o resultado em "Minha conta".
- **P-10** CNPJ não é único entre pedidos ou contas; o admin julga.
- **P-11** Link de verificação vale 24 h; intervalo mínimo de 60 s entre reenvios.

## Impacto CQRS

| Tipo | Itens |
|---|---|
| Commands | Identity (CRUD, sem CommandBus): `RegisterUser`, `ConfirmEmail`, `ResendVerification`, `Login`, `RefreshSession`, `Logout`, `RequestOrganizerRole`, `ApproveOrganizerRequest`, `RejectOrganizerRequest`. Catalog: os 14 commands passam a carregar `actorId` e validar posse |
| Events | Nenhum evento novo; a Identity não usa outbox (D-1). Contratos de eventos do Catalog inalterados |
| Queries | Identity, lidas do PostgreSQL pelo write-service com consistência forte: `GetMe`, `ListMyOrganizerRequests`, `ListOrganizerRequests` (admin). Catalog read-service: as 4 queries do produtor recebem `organizerId` do token |
| Aggregates | Nenhum novo. `Venue` e `CatalogEvent` sem mudança de código; posse checada em `require.ts` |
| Read models | Nenhum novo nem alterado |
| Sagas / process managers | Não se aplica: nenhum fluxo entre contextos reage à Identity nesta fase |

## Riscos

- **R-1 Efeito cascata nos testes:** suítes do write, read, web, E2E e seed assumem acesso anônimo. Helpers de token de teste nascem na mesma trilha que registra o guard, numa onda anterior às trilhas que os consomem.
- **R-2 Exceção do Nginx:** sem o `location /api/identity/`, `GET me` cai no read-service e devolve 404.
- **R-3 Papéis defasados no token:** papel aprovado só aparece no próximo refresh; a tela "Minha conta" força o refresh ao ver o pedido aprovado.
- **R-4 Cookie `Secure` em `http://127.0.0.1`:** compose usa `COOKIE_SECURE=false`; coberto pelo Playwright.
- **R-5 Refresh concorrente entre abas:** a segunda aba que usa o token já trocado dispara a detecção de reuso e derruba a sessão. Aceito nesta fase; uma aba tem chamada única em voo.
- **R-6 Rota protegida aberta em teste:** setup sem `AuthModule` testa rota sem guard. Mitigação: teste de 401 sem token por controller protegido.
- **R-7 Handler sem posse:** command novo que carregue agregado fora de `require.ts`. Mitigação: teste de posse por command.
- **R-8 E-mail perdido:** falha de SMTP depois do commit deixa a conta sem link; mitigado pelo reenvio.
- **R-9 Lentidão no E2E:** login por teste custa scrypt; login uma vez por suíte.

## Open Questions

Todas resolvidas no Gate 1 (ver Decisões). As opções originais da OQ-1 (autosserviço) ficaram obsoletas e foram removidas; a OQ-5 e a OQ-6 surgiram na conversa com o usuário.

- OQ-1 [negócio] Como uma conta vira produtor? → resolvida.
- OQ-2 [negócio] Como uma conta vira portaria? → resolvida (adiada).
- OQ-3 [negócio] Regras do CPF → resolvida.
- OQ-4 [negócio] Dados e regras do cadastro → resolvida.
- OQ-5 [negócio] Dados do pedido de produtor → resolvida.
- OQ-6 [negócio] Regras da recusa → resolvida.

## Decisões

Preenchida pelo thread principal com as respostas do usuário.

Respostas do usuário em 2026-10-27 (Gate 1). Mudaram o escopo da fase: entram papel `admin`, fluxo de aprovação de produtor e e-mail de verificação via SMTP.

- OQ-1 → **Substituída.** Existe um `admin` geral do projeto (o próprio usuário), no topo da hierarquia. Produtores se cadastram e **solicitam** o papel; ficam aguardando o admin aceitar. Sem autosserviço. Hierarquia: admin > produtor > cliente. Enquanto o pedido está pendente ou recusado, a conta segue como cliente normal.
- OQ-5 (nova) → O pedido de produtor informa **nome da organização + CNPJ + motivo curto**. CNPJ validado pelos dígitos verificadores.
- OQ-6 (nova) → Recusa: o **motivo é opcional**, a critério do admin escrever uma mensagem (a pessoa a vê). A recusa **nunca é definitiva**: a conta pode enviar novo pedido de produtor depois.
- OQ-2 → **Adiar para a Fase 6.** Na Fase 3 só se reserva o papel `gate_staff` (portaria) no modelo de papéis; nenhum fluxo de criação ou vínculo agora.
- OQ-3 → Opção A: CPF obrigatório no cadastro, um por conta, **imutável**, validado pela semântica dos dígitos verificadores (a ser rejeitado também CPF de dígitos repetidos), conforme D-11.
- OQ-4 → Opção A (campos: nome completo, e-mail, senha, CPF; senha de 8 a 128 caracteres sem regra de composição) **com adendo**: o usuário recebe **e-mail para validar a conta**, o que exige servidor SMTP (aprendizado extra do projeto). **Sem data de nascimento.** Substitui a premissa de "sem verificação de e-mail".

**Orientação ao planner para os pontos técnicos derivados (decidir e registrar como decisão do planner, sem nova OQ):** SMTP de desenvolvimento no docker-compose (ex.: Mailpit, com UI para ver os e-mails), envio do e-mail de verificação, token de verificação com expiração e reenvio, conta não verificada não pode fazer login (ou só entra sem poder solicitar produtor: escolher o mais simples e coerente), admin criado por seeder idempotente a partir de variáveis de ambiente, endpoints e tabelas do pedido de produtor (pendente/aprovado/recusado, com histórico de pedidos), aprovar concede o papel `organizer` e o produtor seed do Catalog continua sendo conta real aprovada. Absorver as lacunas L-1 e L-3 da parcial `SDD/WORK/2026-10-27-IdentityResearch-Integracao.md`; onde a parcial for mais detalhada que o mapeamento do Research, a parcial prevalece.
