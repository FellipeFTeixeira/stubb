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
| `infra/` | docker-compose (infra e apps), config do Nginx, config do conector Debezium |

Ferramenta de monorepo: pnpm workspaces ([ADR 0009](adr/0009-ferramental-e-pipeline-da-fase-1.md)).

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
10. Módulos só se comunicam por commands, queries e eventos públicos; nunca acessam tabelas de outro contexto.

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

Implementados (Fases 1 e 2):

| Read model | Uso | Contexto |
|---|---|---|
| `pings` | Painel de diagnóstico | Diagnostics |
| `event_listing` | Vitrine e busca: um documento por evento com ao menos uma sessão publicada, só com as sessões publicadas e os lotes que formam o preço do card | Catalog |
| `event_detail` | Página pública do evento e base das duas telas do produtor: a árvore completa (sessões, setores, lotes), com rascunhos. Evento descartado vira uma lápide `{ _id, version, status: 'discarded' }` | Catalog |
| `organizer_events` | Lista "Meus eventos": título, categoria, status e contagem de sessões | Catalog |
| `venues` | Locais do produtor com a planta de setores | Catalog |

Infraestrutura do projector, em todo read model: `processed_events` (deduplicação por `eventId`) e `aggregate_versions` (última `aggregateVersion` aplicada por agregado, que detecta evento repetido e lacuna). As duas coleções são gravadas na mesma transação do MongoDB que o read model e são apagadas no replay.

Previstos nas fases seguintes:

| Read model | Uso |
|---|---|
| `session_seat_map` | Status de cada assento, um documento por sessão |
| `sector_availability` | Contagem por setor/lote |
| `customer_tickets` | "Meus ingressos" |
| `organizer_sales` | Vendas por lote e receita |
| `checkin_list` | Portaria |

## Catalog (Fase 2)

Primeiro fluxo real do sistema. O produtor (um usuário seed até a Fase 3) monta o catálogo nesta ordem:

```
Local (planta de setores) ─► Evento (Rascunho) ─► Sessão (Rascunho; copia planta e fuso do local)
  ─► Setores da sessão ─► Lotes de cada setor ─► Publicação da sessão
```

- **Dois agregados no write:** `Venue` (local + planta) e `CatalogEvent` (evento + sessões + setores + lotes). O evento guarda a árvore inteira porque as regras de lote e de publicação cruzam sessão, setor e lote. Cada command muda um agregado, gera um evento de domínio e sobe a `version` em 1. São 14 commands e 14 eventos `V1`, todos no tópico `catalog.events` (partition key = ID do agregado).
- **A sessão é a unidade publicável.** Não existe "publicar evento": o evento vira Publicado quando a primeira sessão é publicada, e `PublishSession` emite um único `SessionPublished` com o retrato completo da sessão. Sessão publicada fica congelada.
- **Estados que dependem do relógio são derivados na query, nunca gravados.** Lote vigente, venda aberta, "Sessão encerrada" e "Evento encerrado" saem de `now` comparado a `startsAt`, `salesStartsAt` e `endsAt`, dentro do read-service. O projector não conhece o relógio: sem isso o read model mudaria sozinho e o replay não reproduziria o mesmo documento. As datas gravadas vêm só de `occurredAt`.
- **Projeção em três tempos.** Um evento do agregado `CatalogEvent` reduz o `event_detail` e, na mesma transação, regrava `event_listing` e `organizer_events` com a mesma `version`. Um evento do `Venue` regrava `venues` e espalha nome, endereço e cidade para as sessões que usam o local (fan-out), sem mexer em `version` nem `updatedAt` do evento.
- **Ordem entre agregados não é garantida, então a projeção é comutativa.** A sessão pode chegar ao projector antes do local que ela usa; nesse caso ela fica com `venue: null` e some das leituras públicas até o local chegar. O snapshot do local na sessão carrega o `detailsVersion` (contador só das edições de dados), e uma edição mais antiga nunca sobrescreve a mais nova. Os testes de integração provam que as três ordens de chegada dão os mesmos quatro documentos.
- **Descarte.** Só evento em Rascunho. O `event_detail` fica com a lápide para o read-your-writes do descarte terminar: `GET .../organizer/events/:id?min_version=<versão do descarte>` responde `404` com `minVersionReached: true`.
- **Payload cru no Kafka.** O Outbox Event Router entrega o JSON do `payload` da outbox como texto (`StringConverter`), sem expandi-lo em estrutura. Com `table.expand.json.payload` o Debezium infere um schema e corrompe listas de objetos de formato diferente (setor de pista e setor marcado na mesma lista), o que o contrato do evento não aceita.

As telas do web: `/` vitrine, `/eventos/:id` página do evento, `/produtor/locais` e `/produtor/eventos` (cadastro, planta, sessões, lotes, publicação) e `/diagnostico`.

## Regras de negócio candidatas

Viram specs SDD nas fases do roadmap. Nenhuma está confirmada ainda, salvo o que a seção Catalog descreve: valores e comportamentos serão definidos como Open Questions.

- Hold com TTL e liberação automática.
- Virada de lote por esgotamento (por data já vale desde a Fase 2, ver Catalog).
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
