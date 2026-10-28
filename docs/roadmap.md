# Roadmap do Stubb

Cada fase é entregue por uma ou mais execuções do `/sdd-pipeline`. Status: `pendente` / `em andamento` / `concluída`.
Detalhes de implementação de cada fase não são decididos aqui: viram Open Questions na pesquisa SDD da fase.
A ordem das fases 2 e 3 pode ser trocada.

**Fase atual:** 4 — Inventory (as fases 2 e 3 estão concluídas)

| Fase | Nome | Status | Entregas | Aprendizado CQRS |
|---|---|---|---|---|
| 0 | Fundação | concluída | CLAUDE.md, README, napkin, skill e subagentes SDD, roadmap, docs de arquitetura, ADRs, glossário | — |
| 1 | Esqueleto | concluída | Monorepo (`apps/write-service`, `apps/read-service`, `apps/projector`, `apps/web` React + Vite, `libs/contracts`); Dockerfile dos apps; docker-compose subindo infra (Nginx, PostgreSQL, Kafka KRaft, Debezium/Kafka Connect, MongoDB) e apps; lint e testes; **walking skeleton**: um evento fictício atravessa write → outbox → Debezium → Kafka → projector → MongoDB → read-service → web | Pipeline CQRS ponta a ponta funcionando antes de qualquer regra de negócio |
| 2 | Catalog | concluída | Cadastro de evento, local, sessão, setores e lotes (produtor via usuário seed); read model `event_listing`; vitrine e página do evento no web | Primeiro fluxo real command → evento → projeção; read model desnormalizado |
| 3 | Identity | concluída | Cadastro com CPF e verificação de e-mail (SMTP/Mailpit), login, JWT (EdDSA) com refresh em cookie, papéis (cliente, produtor, admin; portaria só reservado para a Fase 6), pedido de produtor com aprovação do admin (nome da organização + CNPJ), Catalog com posse por produtor; validação nos serviços (guard global default-deny) | Contexto CRUD: nem tudo precisa de CQRS |
| 4 | Inventory | pendente | Mapa de assentos + pista, `HoldSeats`, hold com TTL, expiração por scheduler, `session_seat_map` e `sector_availability`, SSE ao vivo, read-your-writes | Concorrência, optimistic locking, consistência eventual na UI |
| 5 | Ordering e pagamento | pendente | Pedido, gateway fake + webhook, `Idempotency-Key`, saga da compra, lotes, meia-entrada, taxa de conveniência, limite por CPF | Process manager/saga, idempotência, reação entre contextos |
| 6 | Ticketing | pendente | Emissão com QR, "meus ingressos", transferência, check-in sem uso duplo, `checkin_list` | Projeções por consumidor; consistência no check-in |
| 7 | Pós-venda | pendente | Cancelamento, arrependimento (CDC art. 49), reembolso, dashboard `organizer_sales` | Eventos compensatórios; read model analítico |
| 8 | Event Sourcing | pendente | Ordering migrado para event-sourced, event store, snapshots, replay de projeções, comparação com state-stored | ES vs state-stored na prática |
| 9 | Alta demanda | pendente | Fila virtual, rate limit no Nginx, Redis para o mapa se medido, testes de carga, medição de lag write → read | Escala do read side, gargalos reais |

## Arquivos SDD por fase

### Fase 0 — Fundação
Fase de setup, feita fora do pipeline (o pipeline ainda não existia).

### Fase 1 — Esqueleto
- Research: [`SDD/RESEARCH/2026-10-24-SkeletonResearch.md`](../SDD/RESEARCH/2026-10-24-SkeletonResearch.md)
- Spec: [`SDD/SPEC/2026-10-24-SkeletonSpec.md`](../SDD/SPEC/2026-10-24-SkeletonSpec.md)
- Plan: [`SDD/SPEC/2026-10-24-SkeletonPlan.md`](../SDD/SPEC/2026-10-24-SkeletonPlan.md)
- Board da implementação paralela: [`SDD/WORK/2026-10-24-SkeletonBoard.md`](../SDD/WORK/2026-10-24-SkeletonBoard.md)

### Fase 2 — Catalog
- Research: [`SDD/RESEARCH/2026-10-25-CatalogResearch.md`](../SDD/RESEARCH/2026-10-25-CatalogResearch.md)
- Spec: [`SDD/SPEC/2026-10-26-CatalogSpec.md`](../SDD/SPEC/2026-10-26-CatalogSpec.md)
- Plan: [`SDD/SPEC/2026-10-26-CatalogPlan.md`](../SDD/SPEC/2026-10-26-CatalogPlan.md)
- Board da implementação paralela: [`SDD/WORK/2026-10-26-CatalogBoard.md`](../SDD/WORK/2026-10-26-CatalogBoard.md)

### Fase 3 — Identity
- Research: [`SDD/RESEARCH/2026-10-27-IdentityResearch.md`](../SDD/RESEARCH/2026-10-27-IdentityResearch.md)
- Spec: [`SDD/SPEC/2026-10-27-IdentitySpec.md`](../SDD/SPEC/2026-10-27-IdentitySpec.md)
- Plan: [`SDD/SPEC/2026-10-27-IdentityPlan.md`](../SDD/SPEC/2026-10-27-IdentityPlan.md)
- Board da implementação paralela: [`SDD/WORK/2026-10-27-IdentityBoard.md`](../SDD/WORK/2026-10-27-IdentityBoard.md)
- Decisão de arquitetura: [ADR 0010](architecture/adr/0010-identity-contexto-crud.md)
