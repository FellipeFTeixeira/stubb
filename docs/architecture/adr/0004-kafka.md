# ADR 0004 — Kafka como broker

**Status:** aceito (2026-10-24)

## Contexto

Eventos do write side precisam chegar ao projector e às sagas do próprio write-service, com ordem garantida por agregado e possibilidade de replay.

## Decisão

Kafka em modo KRaft (sem Zookeeper). Um tópico por contexto (`catalog.events`, `inventory.events`, `ordering.events`, `ticketing.events`), partition key = ID do agregado, retenção longa.

## Alternativas

- **RabbitMQ**: ótimo para filas de trabalho, mas sem log persistente para replay.
- **PostgreSQL LISTEN/NOTIFY**: simples, mas não sustenta a separação física nem o replay.

## Consequências

- Ordem garantida apenas dentro de uma partição, ou seja, por agregado.
- Consumers precisam ser idempotentes (entrega at-least-once).
- Replay depende da retenção do tópico; na Fase 8 o event store passa a ser a fonte para o contexto Ordering.
- Kafka não tem mensagem atrasada: timeouts (ex.: expiração de hold) ficam com um scheduler no write-service.
