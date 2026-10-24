# ADR 0001 — Backend em TypeScript + Node.js + NestJS

**Status:** aceito (2026-10-24)

## Contexto

O projeto é de estudo, com foco em CQRS. O usuário nunca trabalhou com TypeScript/Node/Nest e quer aprender a stack.

## Decisão

Backend em TypeScript sobre Node.js, com NestJS como framework e `@nestjs/cqrs` para CommandBus, QueryBus, EventBus e Sagas.

## Alternativas

- **.NET (C#)**: ecossistema CQRS maduro (MediatR/Wolverine, Marten); descartado pela vontade de aprender TS/Node.
- **Java/Kotlin (Spring + Axon)**: o Axon esconde boa parte do mecanismo, o que atrapalha o estudo.
- **Go**: tudo manual; mais trabalho de infraestrutura que de CQRS.

## Consequências

- Mesma linguagem no backend e no frontend.
- `@nestjs/cqrs` é in-memory: não persiste eventos nem faz outbox, retry ou checkpoint. Construímos isso à mão, e essa é parte central do aprendizado.
- Injeção de dependência e módulos do Nest ajudam a manter os bounded contexts separados.
