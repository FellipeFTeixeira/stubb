# ADR 0006 — Event Sourcing apenas no contexto Ordering, na Fase 8

**Status:** aceito (2026-10-24)

## Contexto

CQRS e Event Sourcing são padrões independentes. Aprender os dois juntos dobra a curva de aprendizado.

## Decisão

As fases 1 a 7 usam agregados state-stored com outbox. Na Fase 8, o contexto Ordering é migrado para Event Sourcing (event store, snapshots, replay de projeções), para comparar as duas abordagens.

## Alternativas

- **ES desde o início**: replay nativo, mas curva muito maior antes de qualquer resultado.
- **Nunca usar ES**: perde a comparação prática.

## Consequências

- O aprendizado de CQRS vem primeiro, isolado.
- A Fase 8 exige versionamento de eventos e estratégia de snapshots.
- Os contratos em `libs/contracts` devem ser desenhados desde já pensando em evolução de versão.
