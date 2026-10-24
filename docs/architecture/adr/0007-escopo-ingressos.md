# ADR 0007 — Assento marcado e pista desde o início

**Status:** aceito (2026-10-24)

## Contexto

Ingressos podem ser de assento marcado (cada assento é único) ou de pista (quantidade por setor).

## Decisão

Suportar os dois tipos a partir da Fase 4 (Inventory).

## Alternativas

- **Só pista no início**: mais simples, mas perde o caso de concorrência por assento.

## Consequências

- Dois modelos de concorrência: disputa por assento específico (unique `(session_id, seat_id)`) e contador por setor.
- O read model `session_seat_map` atende assento marcado; `sector_availability` atende pista.
