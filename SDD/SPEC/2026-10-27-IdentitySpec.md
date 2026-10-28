---
feature: Identity
fase: 3 — Identity
date: 2026-10-27
status: implemented
research: SDD/RESEARCH/2026-10-27-IdentityResearch.md
plan: SDD/SPEC/2026-10-27-IdentityPlan.md
---

# Identity — Spec

O QUÊ será entregue. Sem detalhes de implementação.

## Resumo

Contas reais com cadastro, CPF, verificação de e-mail e login por JWT; papéis cliente, produtor e admin (portaria reservada); o produtor passa por pedido e aprovação do admin; o Catalog passa a usar o usuário autenticado e a validar posse. Identity é um contexto CRUD, sem outbox e sem read model, em contraste com o Catalog.

## Requisitos

- R-1 Qualquer pessoa cria conta com nome completo, e-mail, senha e CPF e recebe um e-mail com link de verificação.
- R-2 A pessoa confirma o e-mail pelo link e pode pedir reenvio do link.
- R-3 Conta verificada entra com e-mail e senha; a sessão se renova sozinha enquanto o refresh for válido e termina no logout.
- R-4 A pessoa logada vê os próprios dados (CPF mascarado) e papéis.
- R-5 A pessoa logada que não é produtora pede o papel de produtor informando organização, CNPJ e motivo, e acompanha o histórico dos pedidos.
- R-6 O admin lista pedidos por status, aprova ou recusa (com mensagem opcional).
- R-7 Commands e leituras do produtor no Catalog exigem papel produtor e só alcançam o que pertence ao usuário autenticado.
- R-8 Vitrine, página do evento, diagnostics e health continuam públicos.
- R-9 A stack sobe com um admin e o produtor seed da Fase 2 já existentes, verificados; os dados de demonstração continuam com dono.
- R-10 O web oferece cadastro, login, verificação, minha conta, administração de pedidos e protege as áreas restritas.
- R-11 E-mails de desenvolvimento são entregues num SMTP local com interface para leitura (Mailpit).

## Regras de negócio

- RN-1 Cadastro exige nome completo, e-mail, senha e CPF; não pede data de nascimento. (fonte: Decisões OQ-4)
- RN-2 Senha tem de 8 a 128 caracteres, sem regra de composição. (fonte: Decisões OQ-4)
- RN-3 E-mail é único por conta, sem diferenciar maiúsculas de minúsculas, e é guardado em minúsculas. (fonte: Research P-5)
- RN-4 CPF é obrigatório, único por conta e imutável; é válido só com os dois dígitos verificadores corretos e não pode ter os 11 dígitos iguais. A entrada aceita com ou sem máscara. (fonte: Decisões OQ-3)
- RN-5 Conta nasce não verificada e com o papel cliente; o cadastro dispara um e-mail com link de verificação. (fonte: Decisões OQ-4, OQ-1; Research P-2)
- RN-6 Conta não verificada não faz login. (fonte: orientação do Gate 1, Research D-18)
- RN-7 Link de verificação vale 24 h e é de uso único; pedir reenvio invalida os links anteriores; só sai novo e-mail se o último envio tiver 60 s ou mais. (fonte: Research P-11, D-18)
- RN-8 Papéis existentes: cliente (`customer`), produtor (`organizer`), admin (`admin`) e portaria (`gate_staff`, reservado, sem fluxo nesta fase). (fonte: Decisões OQ-1, OQ-2)
- RN-9 Hierarquia admin > produtor > cliente: o admin tem também os papéis produtor e cliente; o produtor tem também o papel cliente. (fonte: Decisões OQ-1, Research D-20)
- RN-10 O admin é criado por seed; não existe cadastro nem promoção a admin pela aplicação. (fonte: Decisões OQ-1 e orientação do Gate 1)
- RN-11 O pedido de produtor informa nome da organização, CNPJ e motivo curto. CNPJ é válido nos formatos numérico e alfanumérico, com os dois dígitos verificadores corretos, e não pode ter os 14 caracteres iguais. (fonte: Decisões OQ-5, Research D-19)
- RN-12 Só pede o papel quem ainda não é produtor e não tem pedido pendente; cada conta tem no máximo um pedido pendente. (fonte: Decisões OQ-1, OQ-6)
- RN-13 Só o admin decide pedidos, e só pedidos pendentes. Aprovar concede o papel produtor. (fonte: Decisões OQ-1)
- RN-14 Recusar aceita uma mensagem opcional, que o solicitante vê. A recusa não é definitiva: a conta pode enviar novo pedido logo depois. (fonte: Decisões OQ-6)
- RN-15 Enquanto o pedido está pendente ou foi recusado, a conta segue como cliente. (fonte: Decisões OQ-1)
- RN-16 Todos os pedidos ficam no histórico, com status, mensagem de recusa e datas. (fonte: orientação do Gate 1)
- RN-17 Limites de campo: nome completo 3 a 120 caracteres; e-mail até 254; nome da organização 2 a 120; motivo 1 a 500; mensagem de recusa até 500. Espaços nas pontas são descartados. (fonte: Research P-7)
- RN-18 CNPJ não precisa ser único entre pedidos ou contas. (fonte: Research P-10)
- RN-19 O produtor só gerencia os próprios locais e eventos. Local ou evento de outro produtor é tratado como inexistente; agendar sessão com local de outro produtor falha como local inexistente. (fonte: Catalog Research Decisões OQ-6, OQ-10; Catalog Spec RN-2)
- RN-20 As leituras da área do produtor mostram só o que pertence ao usuário autenticado. (fonte: Catalog Research Decisões OQ-4, OQ-69)
- RN-21 O admin não ignora posse: no Catalog ele age só sobre o que é dele. (fonte: Research P-8)
- RN-22 Vitrine e página do evento são públicas. (fonte: Catalog Research Decisões OQ-4)
- RN-23 O produtor seed da Fase 2 é uma conta real, verificada e aprovada, com o mesmo ID; os dados de demonstração continuam dele. (fonte: orientação do Gate 1, Research D-14)
- RN-24 Sessão: acesso de 15 min, renovação por refresh de 7 dias contados do último uso; logout encerra só a sessão daquele dispositivo. (fonte: Research P-1)
- RN-25 Erro de login não diz se o e-mail existe nem se a senha está errada; não há bloqueio por tentativas. A exceção é a conta não verificada, informada só depois da senha certa. (fonte: Research P-3, D-18)
- RN-26 O solicitante não recebe e-mail com a decisão; vê o resultado em "Minha conta". (fonte: Research P-9)
- RN-27 CPF nunca aparece completo fora do banco: respostas mostram `***.456.789-**`; token e logs não o contêm. (fonte: Research D-11)

## Contratos

Todo corpo de erro segue `DomainErrorResponseSchema` (`statusCode`, `error`, `message`, `code`), exceto validação, que segue `ValidationErrorResponseSchema` (400 `VALIDATION_FAILED` com `issues`). Códigos novos em `COMMAND_ERROR_CODES`: `UNAUTHENTICATED`, `FORBIDDEN`, `EMAIL_ALREADY_REGISTERED`, `CPF_ALREADY_REGISTERED`, `VERIFICATION_TOKEN_INVALID`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `SESSION_INVALID`, `ALREADY_ORGANIZER`, `ORGANIZER_REQUEST_PENDING`, `ORGANIZER_REQUEST_NOT_FOUND`, `ORGANIZER_REQUEST_NOT_PENDING`.

### Commands

Identity é CRUD (sem CommandBus); "command" aqui é a operação que muda estado.

| Command | Payload | Retorno | Erros |
|---|---|---|---|
| `RegisterUser` | `fullName`, `email`, `password`, `cpf` | 202 `{ id }` | 400 `VALIDATION_FAILED`; 409 `EMAIL_ALREADY_REGISTERED`; 409 `CPF_ALREADY_REGISTERED`; erros de `Idempotency-Key` existentes |
| `ConfirmEmail` | `token` | 202 `{ id }` (id da conta) | 400; 422 `VERIFICATION_TOKEN_INVALID` |
| `ResendVerification` | `email` | 202 `{}` (sempre) | 400 |
| `Login` | `email`, `password` | 200 `{ accessToken, expiresIn }` + cookie de refresh | 400; 401 `INVALID_CREDENTIALS`; 403 `EMAIL_NOT_VERIFIED` |
| `RefreshSession` | cookie `stubb_refresh` | 200 `{ accessToken, expiresIn }` + cookie novo | 401 `SESSION_INVALID` (limpa o cookie) |
| `Logout` | cookie `stubb_refresh` (opcional) | 204, cookie limpo | — |
| `RequestOrganizerRole` | `organizationName`, `cnpj`, `reason` | 202 `{ id }` (id do pedido) | 400; 401; 409 `ALREADY_ORGANIZER`; 409 `ORGANIZER_REQUEST_PENDING` |
| `ApproveOrganizerRequest` | `requestId` (rota) | 202 `{ id }` | 401; 403; 404 `ORGANIZER_REQUEST_NOT_FOUND`; 409 `ORGANIZER_REQUEST_NOT_PENDING` |
| `RejectOrganizerRequest` | `requestId` (rota), `message?` | 202 `{ id }` | 400; 401; 403; 404 `ORGANIZER_REQUEST_NOT_FOUND`; 409 `ORGANIZER_REQUEST_NOT_PENDING` |
| Catalog (14 commands existentes) | payload atual; o ator vem do token | inalterado | + 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`; recurso alheio = 404 `AGGREGATE_NOT_FOUND`; local alheio em `ScheduleSession` = 422 `VENUE_NOT_FOUND` |

### Events

Nenhum evento novo. A Identity não grava na outbox nesta fase. Os eventos do Catalog não mudam (já carregam `organizerId`).

### Queries

| Query | Parâmetros | Retorno | Read model |
|---|---|---|---|
| `GetMe` | usuário do token | `{ id, email, fullName, cpf (mascarado), roles }` | Nenhum: PostgreSQL (`identity_users`, `identity_user_roles`), consistência forte |
| `ListMyOrganizerRequests` | usuário do token | `{ items: OrganizerRequestView[] }`, do mais novo para o mais antigo | Nenhum: PostgreSQL |
| `ListOrganizerRequests` (admin) | `status` (`pending` default, `approved`, `rejected`), `page` (≥1, default 1), `pageSize` (1 a 50, default 20) | `{ items: AdminOrganizerRequestView[], page, pageSize, total }`; `pending` do mais antigo para o mais novo, os demais pela decisão mais recente | Nenhum: PostgreSQL |
| Catalog `ListOrganizerEvents`, `GetOrganizerEvent`, `ListVenues`, `GetVenue` | parâmetros atuais + `organizerId` do token | inalterado | `organizer_events`, `event_detail`, `venues` (inalterados) |

`OrganizerRequestView`: `id`, `organizationName`, `cnpj` (normalizado), `reason`, `status`, `rejectionMessage` (string ou null), `createdAt`, `decidedAt` (ISO 8601 ou null). `AdminOrganizerRequestView` acrescenta `requester: { id, fullName, email }`.

### HTTP

Todas as rotas `/api/identity/*` são servidas pelo write-service, inclusive GET.

| Método | Rota | Serviço | Command/Query | Acesso | `Idempotency-Key` |
|---|---|---|---|---|---|
| POST | `/api/identity/users` | write | `RegisterUser` | público | obrigatório |
| POST | `/api/identity/email-verifications/confirm` | write | `ConfirmEmail` | público | não |
| POST | `/api/identity/email-verifications` | write | `ResendVerification` | público | não |
| POST | `/api/identity/session` | write | `Login` | público | não |
| POST | `/api/identity/session/refresh` | write | `RefreshSession` | público (cookie) | não |
| DELETE | `/api/identity/session` | write | `Logout` | público (cookie) | não |
| GET | `/api/identity/me` | write | `GetMe` | autenticado | — |
| GET | `/api/identity/me/organizer-requests` | write | `ListMyOrganizerRequests` | autenticado | — |
| POST | `/api/identity/organizer-requests` | write | `RequestOrganizerRole` | autenticado | obrigatório |
| GET | `/api/identity/admin/organizer-requests` | write | `ListOrganizerRequests` | `admin` | — |
| POST | `/api/identity/admin/organizer-requests/:requestId/approve` | write | `ApproveOrganizerRequest` | `admin` | obrigatório |
| POST | `/api/identity/admin/organizer-requests/:requestId/reject` | write | `RejectOrganizerRequest` | `admin` | obrigatório |
| POST/PATCH/DELETE | `/api/catalog/venues*`, `/api/catalog/events*` (14 rotas atuais) | write | commands do Catalog | `organizer` + posse | obrigatório, escopo por usuário |
| GET | `/api/catalog/organizer/*` (4 rotas atuais) | read | queries do produtor | `organizer`, filtro pelo token | — |
| GET | `/api/catalog/events`, `/api/catalog/events/:eventId` | read | vitrine e página | público | — |
| GET/POST | `/api/diagnostics/*`, `/health` | write e read | inalterado | público | inalterado |

Cookie de refresh: nome `stubb_refresh`, `HttpOnly`, `SameSite=Strict`, `Path=/api/identity/session`, `Max-Age=604800`, `Secure` conforme configuração (desligado na stack local em `http://127.0.0.1`).

Access token (header `Authorization: Bearer <token>`): JWT EdDSA com `sub` (id da conta), `roles`, `iss=stubb-identity`, `aud=stubb-api`, `iat`, `exp = iat + 900`.

## Critérios de aceite

### CA-1 Cadastro válido
- **Given** nenhum usuário com o e-mail `Ana@Exemplo.com` nem com o CPF `123.456.789-09`
- **When** `POST /api/identity/users` com nome, esse e-mail, senha de 8+ caracteres, esse CPF e uma `Idempotency-Key`
- **Then** responde 202 `{ id }`; a conta existe com e-mail `ana@exemplo.com`, CPF `12345678909`, não verificada, papel só `customer`; a senha está guardada só como hash `scrypt$...`; o Mailpit recebe um e-mail para `ana@exemplo.com` com link `{PUBLIC_WEB_URL}/verificar-email?token=...`.

### CA-2 Validação do cadastro
- **Given** qualquer estado
- **When** o cadastro chega com CPF de dígito verificador errado, CPF `111.111.111-11`, senha de 7 ou de 129 caracteres, e-mail inválido, nome com menos de 3 ou mais de 120 caracteres, ou campo ausente
- **Then** responde 400 `VALIDATION_FAILED` com um item em `issues` apontando o campo, e nenhuma conta é criada.

### CA-3 Unicidade de e-mail e CPF
- **Given** uma conta com `ana@exemplo.com` e CPF `12345678909`
- **When** outro cadastro usa `ANA@exemplo.com` (CPF diferente) ou usa o mesmo CPF (e-mail diferente)
- **Then** responde 409 `EMAIL_ALREADY_REGISTERED` no primeiro caso e 409 `CPF_ALREADY_REGISTERED` no segundo; nenhuma conta nova; nenhum e-mail enviado.

### CA-4 Idempotência do cadastro
- **Given** um cadastro aceito com a chave K
- **When** a mesma requisição é repetida com K
- **Then** responde 202 com o mesmo `{ id }`, existe uma conta só e só um e-mail de verificação foi enviado; a coluna `request_hash` não depende da senha (repetir com K e outra senha devolve a mesma resposta); a mesma K com outro e-mail devolve o erro `IDEMPOTENCY_KEY_MISMATCH` já existente.

### CA-5 Confirmação do e-mail
- **Given** uma conta não verificada com um link recebido há menos de 24 h
- **When** `POST /api/identity/email-verifications/confirm` com o token do link
- **Then** responde 202 `{ id }` e a conta fica verificada; repetir com o mesmo token responde 202 sem mudar nada; token inexistente, vencido (mais de 24 h) ou invalidado por reenvio responde 422 `VERIFICATION_TOKEN_INVALID`.

### CA-6 Reenvio do link
- **Given** uma conta não verificada cujo último link saiu há 60 s ou mais
- **When** `POST /api/identity/email-verifications` com o e-mail dela
- **Then** responde 202, sai um e-mail novo e o link anterior passa a responder 422 `VERIFICATION_TOKEN_INVALID`. Se o último envio tiver menos de 60 s, ou o e-mail não existir, ou a conta já estiver verificada, responde 202 e nenhum e-mail sai.

### CA-7 Login recusado
- **Given** uma conta verificada A e uma conta não verificada B
- **When** login em A com senha errada, login com e-mail inexistente, login em B com senha errada e login em B com senha certa
- **Then** os três primeiros respondem 401 `INVALID_CREDENTIALS` com a mesma mensagem; o último responde 403 `EMAIL_NOT_VERIFIED`; nenhum cookie é emitido.

### CA-8 Login aceito
- **Given** uma conta verificada com papéis `customer`
- **When** login com e-mail (qualquer caixa) e senha certos
- **Then** responde 200 `{ accessToken, expiresIn: 900 }` e `Set-Cookie: stubb_refresh=...; HttpOnly; SameSite=Strict; Path=/api/identity/session; Max-Age=604800`; o token verifica com a chave pública, tem `alg` `EdDSA`, `sub` = id da conta, `roles` = `["customer"]`, `iss` `stubb-identity`, `aud` `stubb-api`, `exp - iat = 900`, e não contém CPF nem e-mail.

### CA-9 Refresh com rotação e detecção de reuso
- **Given** uma sessão com o refresh R1
- **When** `POST /api/identity/session/refresh` com R1
- **Then** responde 200 com novo access token e cookie com R2; usar R1 de novo responde 401 `SESSION_INVALID`, limpa o cookie e revoga a família: R2 também passa a responder 401. Sem cookie, ou com refresh vencido, responde 401 `SESSION_INVALID`.

### CA-10 Refresh relê os papéis
- **Given** uma sessão iniciada quando a conta era só `customer`
- **When** a conta ganha `organizer` e a sessão faz refresh
- **Then** o novo access token tem `roles` com `customer` e `organizer`.

### CA-11 Logout
- **Given** uma sessão ativa
- **When** `DELETE /api/identity/session`
- **Then** responde 204, o cookie é limpo (`Max-Age=0`) e o refresh daquela família responde 401 depois; sem cookie, também responde 204.

### CA-12 Dados da conta
- **Given** uma conta logada
- **When** `GET /api/identity/me` com o Bearer
- **Then** responde 200 `{ id, email, fullName, cpf: "***.456.789-**", roles }`; sem token, com assinatura inválida ou com token vencido responde 401 `UNAUTHENTICATED`; a requisição passa pelo gateway em GET e é atendida pelo write-service.

### CA-13 Pedido de produtor
- **Given** uma conta verificada, só `customer`, sem pedido pendente
- **When** `POST /api/identity/organizer-requests` com organização, CNPJ `11.222.333/0001-81` (ou o alfanumérico `12.ABC.345/01DE-35`), motivo e `Idempotency-Key`
- **Then** responde 202 `{ id }`; o pedido fica `pending` com CNPJ normalizado (`11222333000181` ou `12ABC34501DE35`); a conta continua só `customer`. CNPJ com dígito errado ou com 14 caracteres iguais responde 400 `VALIDATION_FAILED`.

### CA-14 Pedido bloqueado
- **Given** uma conta com pedido pendente, e outra conta que já é `organizer`
- **When** cada uma envia um novo pedido (inclusive duas requisições simultâneas da primeira com chaves diferentes)
- **Then** a primeira recebe 409 `ORGANIZER_REQUEST_PENDING` e continua com um único pendente; a segunda recebe 409 `ALREADY_ORGANIZER`.

### CA-15 Lista do admin
- **Given** pedidos pendentes, aprovados e recusados
- **When** o admin chama `GET /api/identity/admin/organizer-requests` sem `status`, e depois com `status=rejected`
- **Then** a primeira lista só os pendentes, do mais antigo para o mais novo, com `requester` (`id`, `fullName`, `email`), `page`, `pageSize` e `total`; a segunda só os recusados, pela decisão mais recente. Uma conta sem `admin` recebe 403 `FORBIDDEN`; sem token, 401.

### CA-16 Aprovação
- **Given** um pedido pendente da conta C
- **When** o admin aprova com `Idempotency-Key`
- **Then** responde 202; o pedido fica `approved` com `decidedAt`; C ganha `organizer`; depois de um refresh, C cria um local no Catalog (202) e o local tem `organizerId` = id de C.

### CA-17 Recusa e novo pedido
- **Given** um pedido pendente da conta C
- **When** o admin recusa com a mensagem "CNPJ não confere" (ou sem mensagem)
- **Then** responde 202; o pedido fica `rejected` com `rejectionMessage` igual à mensagem (ou null); C continua só `customer`; C vê o pedido recusado e a mensagem em `GET /api/identity/me/organizer-requests`; C envia um novo pedido e recebe 202.

### CA-18 Decisão inválida
- **Given** um pedido já decidido e um id de pedido inexistente
- **When** o admin tenta aprovar ou recusar cada um; e, para um pedido pendente, duas aprovações simultâneas com chaves diferentes
- **Then** o decidido responde 409 `ORGANIZER_REQUEST_NOT_PENDING`; o inexistente, 404 `ORGANIZER_REQUEST_NOT_FOUND`; das simultâneas, exatamente uma responde 202 e a outra 409.

### CA-19 Histórico
- **Given** uma conta com um pedido recusado e um novo pendente
- **When** `GET /api/identity/me/organizer-requests`
- **Then** responde os dois pedidos, o mais novo primeiro, cada um com status, mensagem de recusa (ou null) e datas.

### CA-20 Catalog: autenticação e papel
- **Given** a stack com o guard ativo
- **When** um command do Catalog chega sem token, e depois com token de conta só `customer`
- **Then** responde 401 `UNAUTHENTICATED` e 403 `FORBIDDEN`, sem reservar a `Idempotency-Key` e sem gravar nada.

### CA-21 Catalog: posse
- **Given** o produtor A dono do local LA e do evento EA, e o produtor B
- **When** B envia qualquer command sobre LA ou EA (inclusive com `expectedVersion` errada), e agenda uma sessão no próprio evento usando LA
- **Then** os commands sobre LA e EA respondem 404 `AGGREGATE_NOT_FOUND` (nunca 409) sem alterar nada; o agendamento responde 422 `VENUE_NOT_FOUND`; quando A cria local ou evento, `organizerId` é o `sub` do token de A.

### CA-22 Catalog: idempotência por usuário
- **Given** os produtores A e B
- **When** os dois enviam `POST /api/catalog/venues` com a mesma `Idempotency-Key` e o mesmo corpo
- **Then** os dois recebem 202 com ids diferentes e existem dois locais, um de cada.

### CA-23 Leituras do produtor
- **Given** eventos e locais de A e de B projetados
- **When** A chama as 4 rotas `/api/catalog/organizer/*`; e as mesmas rotas são chamadas sem token e com conta só `customer`
- **Then** A vê só o que é dele e recebe 404 para o evento ou local de B; sem token, 401; sem papel, 403. `GET /api/catalog/events` e `GET /api/catalog/events/:eventId` respondem sem token.

### CA-24 Rotas públicas preservadas
- **Given** a stack com o guard ativo
- **When** as suítes de diagnostics (commands, queries, idempotência, stack) e o healthcheck rodam sem token
- **Then** passam como antes.

### CA-25 Seed
- **Given** a stack subindo do zero, e depois reiniciada
- **When** o write-service termina o bootstrap
- **Then** existem o admin (e-mail de `IDENTITY_ADMIN_EMAIL`, default `admin@stubb.local`, papéis `customer`, `organizer`, `admin`) e o produtor seed (e-mail de `IDENTITY_SEED_ORGANIZER_EMAIL`, default `produtor@stubb.local`, id `0193a4f0-0000-7000-8000-000000000001`, papéis `customer`, `organizer`, com um pedido `approved`), ambos verificados e capazes de logar com as senhas configuradas no `.env`; o reinício não duplica nada; `pnpm seed:catalog` roda logado como o produtor seed e os eventos de demonstração aparecem na área desse produtor.

### CA-26 Segredos no banco
- **Given** contas com sessões e links de verificação
- **When** as tabelas `identity_*` e `idempotency_keys` são inspecionadas
- **Then** senha só aparece como hash `scrypt$...`; refresh e token de verificação só como SHA-256 hexadecimal; nenhum JSON guardado em `idempotency_keys` contém senha ou token.

### CA-27 Web: cadastro, verificação e login
- **Given** o navegador na stack
- **When** a pessoa se cadastra em `/cadastro`, abre o link recebido no Mailpit (`/verificar-email?token=...`) e entra em `/entrar`
- **Then** vê a confirmação de envio do e-mail, depois a confirmação da verificação, e depois o header mostra o nome dela, "Minha conta" e "Sair". Tentar entrar antes de verificar mostra a mensagem de e-mail não verificado e o botão de reenviar o link.

### CA-28 Web: sessão
- **Given** uma pessoa logada
- **When** ela recarrega a página, e depois clica em "Sair"
- **Then** continua logada depois do reload sem digitar a senha (refresh pelo cookie), e nenhum token aparece em `localStorage` ou `sessionStorage`; depois de sair, o header volta a mostrar "Entrar" e "Criar conta", a página vai para a vitrine e os dados em cache da área do produtor somem.

### CA-29 Web: áreas protegidas
- **Given** o navegador sem sessão, e depois logado como conta só `customer`
- **When** abre `/produtor/eventos`, `/conta` e `/admin/produtores`
- **Then** sem sessão, cada rota redireciona para `/entrar` e, depois do login, volta para a rota pedida; como `customer`, `/conta` abre, e `/produtor/eventos` e `/admin/produtores` mostram "Acesso negado" sem chamar as APIs restritas.

### CA-30 Web: pedido e aprovação de produtor
- **Given** uma conta `customer` logada e o admin logado em outro contexto do navegador
- **When** a conta envia o pedido em `/conta`; o admin aprova em `/admin/produtores`; a conta volta para `/conta` (ou a tela é reaberta)
- **Then** a conta vê o pedido "Pendente" e não vê o formulário enquanto ele estiver pendente; o admin vê o pedido na lista de pendentes com nome, e-mail, organização, CNPJ e motivo; depois da aprovação, a conta vê "Aprovado" e o link "Área do produtor" sem novo login, e abre `/produtor/eventos`.

### CA-31 Web: recusa
- **Given** um pedido pendente
- **When** o admin recusa escrevendo uma mensagem opcional
- **Then** o pedido sai da lista de pendentes; a conta vê "Recusado" com a mensagem e o formulário para enviar novo pedido.

### CA-32 Regressão
- **Given** a fase implementada
- **When** rodam `pnpm lint`, `pnpm typecheck`, `pnpm test`, as integrações de write e read, `pnpm test:e2e` e `pnpm replay`
- **Then** tudo passa; as suítes existentes do Catalog passam autenticadas como produtor.

## Fora de escopo

- Fluxo da portaria (criação, vínculo com produtor, escopo por evento, check-in): Fase 6.
- Recuperação e troca de senha, edição de perfil, troca de e-mail, exclusão de conta.
- Login social, MFA, bloqueio por tentativas, rate limit (Fase 9).
- E-mail ao solicitante sobre a decisão do pedido.
- Nome do produtor ou da organização nas páginas públicas.
- Admin agindo sobre recursos de outros produtores.
- Eventos de domínio da Identity e qualquer read model da Identity no MongoDB.
- Uso do CPF em compra (limite por CPF, Fase 5) e titular (Fase 6).
- Unicidade de CNPJ.
