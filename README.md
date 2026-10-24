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
  contracts/       schemas versionados dos eventos (contrato entre write e read)
infra/             docker-compose, Nginx, conector Debezium
docs/              arquitetura, ADRs, glossário, roadmap
SDD/               pesquisas, specs e planos de cada entrega
```

## Andamento

O projeto avança em fases, cada uma ligada a um conceito de CQRS: primeiro um walking skeleton ponta a ponta, depois catálogo, identidade, inventário com concorrência, compra com saga, emissão e check-in, pós-venda, Event Sourcing no contexto Ordering e, por fim, alta demanda. O status de cada fase está em [`docs/roadmap.md`](docs/roadmap.md).

Ainda não existe código executável. As instruções para rodar o projeto entram neste README junto com a Fase 1.

## Como o trabalho é feito

Toda implementação passa por um fluxo de Spec-Driven Development. Primeiro vem uma pesquisa que levanta as dúvidas em aberto. Essas dúvidas são respondidas antes de existir uma spec, e nenhuma regra de negócio é presumida. Depois vêm a spec e o plano, que precisam ser aprovados antes da implementação. Os artefatos de cada entrega ficam em [`SDD/`](SDD/).
