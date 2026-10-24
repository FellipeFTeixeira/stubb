# Arquitetura do Stubb

## Contexto

Stubb é um site de venda de ingressos construído para estudar CQRS na prática. Ticketing é um bom caso de estudo porque:

- **leitura e escrita são muito desiguais**: milhares navegam no catálogo e no mapa de assentos, poucos compram. A leitura precisa escalar; a escrita precisa estar certa;
- **a escrita exige consistência forte**: o mesmo assento nunca pode ser vendido duas vezes;
- **cada tela pede um formato de leitura próprio**: vitrine, mapa de assentos, "meus ingressos", dashboard do produtor, lista de check-in.

Lição central: **o read model serve para exibir; o write model é a verdade.** O mapa pode mostrar livre um assento que acabou de ser reservado. O command side rejeita a compra, e isso é o comportamento correto.

## Topologia

```
Cliente (web React + Vite)
  └─► Nginx
        ├─ GET ──────────► read-service ──► MongoDB
        └─ POST/PUT/... ─► write-service ─► PostgreSQL (tabelas de domínio + outbox)
                                               │ WAL (só a tabela outbox)
                                               ▼
                                     Debezium (Kafka Connect + Outbox Event Router)
                                               ▼
                                     Kafka (catalog.events, inventory.events, ordering.events, ticketing.events)
                                               ├─► projector ──► MongoDB
                                               └─► write-service (sagas e reações entre contextos)
```

- **Nginx**: reverse proxy. Roteia `GET` para o read-service e os demais métodos para o write-service. Separar por método é convenção, não regra: exceções (ex.: `POST /search`, que é query) são roteadas por prefixo.
- **write-service**: recebe commands, executa regras nos agregados, grava estado e evento de domínio na mesma transação.
- **Outbox + Debezium**: o Debezium lê do WAL do PostgreSQL apenas a tabela `outbox`; o Outbox Event Router publica cada evento no tópico do agregado. Sem dual-write e sem polling. Por usar outbox (e não CDC das tabelas de domínio), o Kafka recebe eventos com significado de negócio (`SeatsHeld`), não diffs de linha, e o schema interno do write fica livre para mudar.
- **Kafka**: partition key = ID do agregado, garantindo ordem por agregado. Retenção longa para permitir replay.
- **projector**: consome eventos e atualiza os read models no MongoDB.
- **read-service**: query handlers finos, sem domínio, lendo direto do MongoDB; SSE para atualizações ao vivo.

## Monorepo

| Caminho | Conteúdo |
|---|---|
| `apps/write-service` | NestJS. Módulos por bounded context; commands, handlers, agregados, repositórios, outbox, sagas, scheduler de expiração |
| `apps/read-service` | NestJS. Query handlers e endpoints de leitura; SSE |
| `apps/projector` | NestJS. Consumers Kafka que atualizam os read models |
| `apps/web` | React + Vite |
| `libs/contracts` | Schemas versionados dos eventos: contrato público entre write e read |
| `infra/` | docker-compose, config do Nginx, config do conector Debezium |

A ferramenta de monorepo (pnpm workspaces, Nest CLI monorepo, Nx etc.) é decidida na pesquisa SDD da Fase 1.

## Bounded contexts

| Contexto | Responsabilidade | Nível de CQRS |
|---|---|---|
| Catalog | Eventos, locais, sessões, setores, lotes e preços | Leve; quase CRUD |
| Inventory | Disponibilidade, holds com TTL | Completo; coração do sistema |
| Ordering | Pedido, pagamento (gateway fake + webhook), reembolso | Completo + process manager |
| Ticketing | Emissão, transferência, check-in | Completo |
| Identity | Usuário, CPF, papéis, autenticação | CRUD |

Módulos só se comunicam por commands, queries e eventos públicos; nunca acessam tabelas de outro contexto.

## Regras arquiteturais

1. O write-service nunca lê do MongoDB para decidir algo; toda validação usa o PostgreSQL.
2. Command retorna só ack, ID e versão. Query nunca altera estado.
3. Evento de domínio é gravado na `outbox` na mesma transação do agregado.
4. Concorrência: optimistic concurrency (coluna `version`) + unique `(session_id, seat_id)` como última defesa. Agregado de inventário por sessão + setor (menos disputa que a sessão inteira, ainda garante as regras do setor).
5. Partition key = ID do agregado.
6. Projector idempotente: deduplica por `event_id`, confirma o offset só depois de gravar. Todo read model é reconstruível por replay.
7. Read-your-writes: command devolve versão; query aceita `min_version`.
8. Expiração de hold por scheduler no write-service, varrendo holds vencidos no PostgreSQL (Kafka não tem mensagem atrasada).
9. `Idempotency-Key` em commands do cliente e webhooks de pagamento.

## Consistência eventual na UI

O caminho WAL → Debezium → Kafka → projector → MongoDB leva de milissegundos a segundos. Estratégias:

1. **Read-your-writes** via `min_version`: a query espera até o read model alcançar a versão devolvida pelo command.
2. **Push via SSE** quando a projeção atualiza (ex.: mapa de assentos ao vivo).
3. **UI otimista** em interações simples.

## Saga da compra

```
HoldSeats ─► SeatsHeld (expiresAt)
  ├─ PaymentConfirmed antes do prazo ─► ConfirmOrder ─► IssueTickets ─► TicketsIssued
  ├─ PaymentFailed ─► ReleaseHold ─► SeatsReleased
  └─ scheduler detecta hold vencido ─► ExpireHold ─► SeatsReleased
```

O prazo do hold e demais valores são regras de negócio a confirmar na fase correspondente.

## Read models (MongoDB)

| Read model | Uso |
|---|---|
| `event_listing` | Vitrine e busca |
| `session_seat_map` | Status de cada assento, um documento por sessão |
| `sector_availability` | Contagem por setor/lote |
| `customer_tickets` | "Meus ingressos" |
| `organizer_sales` | Vendas por lote e receita |
| `checkin_list` | Portaria |

## Regras de negócio candidatas

Viram specs SDD nas fases do roadmap. Nenhuma está confirmada ainda: valores e comportamentos serão definidos como Open Questions.

- Hold com TTL e liberação automática.
- Virada de lote por data ou por esgotamento.
- Meia-entrada (Lei 12.933/2013).
- Limite de ingressos por CPF por evento.
- Taxa de conveniência.
- Direito de arrependimento (CDC art. 49), cancelamento e reembolso.
- Transferência de titularidade.
- Check-in sem uso duplo.
- Fila virtual para picos de demanda.

## Evolução

Ver `docs/roadmap.md`. Event Sourcing entra na Fase 8, no contexto Ordering, para comparar com os agregados state-stored.

## ADRs

Ver `docs/architecture/adr/`.
