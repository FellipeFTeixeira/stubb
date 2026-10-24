# ADR 0005 — MongoDB como read store

**Status:** aceito (2026-10-24)

## Contexto

Read models são desnormalizados e moldados para cada tela. O usuário considerou MongoDB e Cassandra.

## Decisão

MongoDB. Cada read model é um documento (ou coleção) pensado para uma tela: página do evento com sessões e setores embutidos, mapa de assentos como um documento por sessão.

## Alternativas

- **Cassandra**: exige uma tabela por query fixa (sem consulta ad hoc), só se destaca em cluster multi-nó com escrita massiva e é pesado de operar (JVM, vários nós). Custo alto sem retorno para estudo.
- **PostgreSQL separado**: possível, mas perde a lição de usar um store com modelo diferente do write.
- **Redis**: fica como opção para o mapa de assentos ao vivo na Fase 9, se medições justificarem.

## Consequências

- Modelo de documento combina com "um documento por tela".
- Consultas flexíveis com índices.
- O write side nunca lê do MongoDB para decidir.
