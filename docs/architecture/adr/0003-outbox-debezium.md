# ADR 0003 — Propagação de eventos com Outbox + Debezium Outbox Event Router

**Status:** aceito (2026-10-24)

## Contexto

O write-service grava no PostgreSQL e o read side precisa ser atualizado. Gravar no banco e publicar no broker em operações separadas (dual-write) pode deixar um dos dois sem a mudança se algo falhar no meio.

A proposta inicial do usuário era CDC com Debezium lendo o WAL das tabelas de domínio.

## Decisão

Usar Transactional Outbox: o write-service grava o agregado e o evento de domínio na tabela `outbox` na mesma transação. O Debezium lê do WAL **apenas a tabela `outbox`** e o Outbox Event Router publica cada evento no tópico do agregado.

## Alternativas

- **CDC das tabelas de domínio**: o Kafka receberia diffs de linha (`status: AVAILABLE → HELD`), sem intenção de negócio (quem, qual pedido, até quando), e o schema interno do write viraria contrato público.
- **Outbox com relay por polling**: funciona, mas adiciona latência e carga no banco.
- **Publicar direto no Kafka pelo handler**: dual-write.

## Consequências

- Sem dual-write e sem polling.
- Eventos carregam significado de negócio e são versionados em `libs/contracts`.
- Schema interno das tabelas de domínio pode mudar sem quebrar o read side.
- Infra adicional: Kafka Connect com o conector Debezium e configuração de replicação lógica no PostgreSQL.
