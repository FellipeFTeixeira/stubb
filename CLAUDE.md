# Stubb

Site de venda de ingressos (estilo Ticketmaster / Guichê Web) construído **para estudo**, sem fins lucrativos. Dois objetivos:

1. Aprender as regras de negócio críticas de ticketing.
2. **Principal:** entender CQRS na prática. A arquitetura é o kernel do aprendizado; ao explicar decisões, conecte-as aos conceitos de CQRS.

## Antes de qualquer trabalho

1. Ler `.claude/napkin.md` no início de toda sessão e antes de cada etapa do pipeline SDD.
2. Consultar `docs/roadmap.md` para saber em qual fase o projeto está.
3. Para detalhes de arquitetura: `docs/architecture/overview.md` e os ADRs em `docs/architecture/adr/`. Vocabulário do domínio: `docs/domain/glossary.md`.

## Regra de ouro

**Nunca implementar nada com dúvida.** Toda dúvida vira Open Question para o usuário, principalmente as de regra de negócio. Nunca assumir regra de negócio, valor, limite, prazo ou comportamento que o usuário não tenha confirmado. Na dúvida, pergunte.

## Stack e topologia

- Backend: TypeScript + Node.js + NestJS, usando `@nestjs/cqrs` (CommandBus, QueryBus, EventBus, Sagas). Os buses do pacote são in-memory: outbox, retry, checkpoint e idempotência são construídos por nós.
- Frontend (`apps/web`): React + Vite + TypeScript, React Router, TanStack Query (estado do servidor), Zustand (estado do cliente), Tailwind + shadcn/ui, React Hook Form + Zod, Vitest + React Testing Library, Playwright. Dado vindo da API vive só no TanStack Query; nunca copiar para o Zustand. Detalhes no ADR 0008.
- Write store: PostgreSQL. Read store: MongoDB. Broker: Kafka (KRaft). Propagação: Outbox + Debezium Outbox Event Router. Gateway: Nginx.

```
Cliente (web) ─► Nginx
                  ├─ GET ─► read-service ─► MongoDB
                  └─ outros ─► write-service ─► PostgreSQL (domínio + outbox)
                                                  │ WAL (só tabela outbox)
                                                  ▼
                                    Debezium (Outbox Event Router) ─► Kafka
                                                  ├─► projector ─► MongoDB
                                                  └─► write-service (sagas)
```

Monorepo alvo: `apps/write-service`, `apps/read-service`, `apps/projector`, `apps/web`, `libs/contracts`, `infra/`.
Bounded contexts: Catalog, Inventory, Ordering, Ticketing, Identity. Ingressos: assento marcado + pista.

## Regras arquiteturais invioláveis

1. O write-service **nunca** lê do MongoDB para decidir algo; toda validação usa o PostgreSQL.
2. Command retorna só ack, ID e versão. Query nunca altera estado.
3. Evento de domínio é gravado na tabela `outbox` na mesma transação do agregado. Nunca publicar direto no Kafka a partir do handler (dual-write).
4. Concorrência: optimistic concurrency (coluna `version`) + unique `(session_id, seat_id)` como última defesa. Agregado de inventário por sessão + setor.
5. Partition key do Kafka = ID do agregado (ordem por agregado).
6. Projector idempotente: deduplica por `event_id` e só confirma o offset depois de gravar no MongoDB. Todo read model precisa ser reconstruível por replay.
7. Read-your-writes: command devolve versão; query aceita `min_version`.
8. Expiração de hold: scheduler no write-service varre holds vencidos no PostgreSQL e emite `ExpireHold` (Kafka não tem mensagem atrasada).
9. `Idempotency-Key` em commands vindos do cliente e em webhooks de pagamento.
10. Módulos só se comunicam por commands, queries e eventos públicos; nunca acessam tabelas de outro contexto.

## Convenções

- Código, identificadores, nomes de arquivos de código: **inglês**. Documentação (docs, SDD, napkin, este arquivo): **PT-BR**.
- Commands no imperativo (`HoldSeats`), eventos no passado (`SeatsHeld`), queries `Get*` / `List*`.
- Contratos de eventos versionados em `libs/contracts`; são contrato público entre write e read.
- Commits: prefixo Conventional Commits em inglês + escopo do contexto + descrição e corpo em PT-BR. Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Exemplo: `feat(inventory): adiciona reserva de assentos`.

## SDD (Spec-Driven Development)

Todo trabalho de implementação passa pelo pipeline, iniciado pelo usuário com `/sdd-pipeline <feature>`. "Fase" = fase do roadmap; "Etapa" = passo do pipeline.

1. **Pesquisa**: subagente `sdd-planner` mapeia o que será feito e gera `SDD/RESEARCH/AAAA-MM-DD-{Nome}Research.md` com Open Questions.
2. **Gate 1, Open Questions**: perguntas levadas ao usuário até zerar. Sem OQ aberta não existe Spec.
3. **Spec + Plan**: `sdd-planner` gera `SDD/SPEC/AAAA-MM-DD-{Nome}Spec.md` e `SDD/SPEC/AAAA-MM-DD-{Nome}Plan.md`. Todo Plan começa com um Roadmap da implementação.
4. **Gate 2, Aprovação**: o usuário aprova Spec e Plan.
5. **Implementação**: subagente `sdd-implementer` executa o Plan; com dúvida, para e pergunta.
6. **Verificação**: thread principal confere critérios de aceite, atualiza roadmap e napkin.

Naming: `AAAA-MM-DD-{NomePascalCase}{Research|Spec|Plan}.md`, o mesmo `{Nome}` nos três arquivos. Modelos: `sdd-planner` = Opus 5.5 High; `sdd-implementer` = Sonnet 5.5 Medium. Detalhes na skill `.claude/skills/sdd-pipeline/SKILL.md`.

## Napkin (`.claude/napkin.md`)

Caderno de aprendizados do projeto. Escrever uma entrada quando:
- o usuário corrigiu um erro seu (o que errou, por quê, como evitar);
- descobriu algo não óbvio sobre o projeto, o ambiente ou uma ferramenta;
- caiu numa armadilha que vale evitar no futuro.

Formato: `- [AAAA-MM-DD] <fato>. **Como aplicar:** <ação>`. Antes de adicionar, verificar se já existe entrada equivalente e atualizá-la em vez de duplicar.

## Git

- Remoto: https://github.com/FellipeFTeixeira/stubb. Claude faz os commits e pushes (git + `gh` CLI, já autenticado).
- Commit só quando o usuário pedir.
- Branch principal: `main`.
- Mensagens de commit: o mais intuitivas possível, sem boilerplate. O título diz o que mudou de um jeito que se entende sem abrir o diff; o corpo só existe quando agrega (o porquê, não a lista de arquivos). Commits separados por assunto.
