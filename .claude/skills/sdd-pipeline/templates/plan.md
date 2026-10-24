---
feature: {Nome}
fase: {número e nome da fase do roadmap}
date: AAAA-MM-DD
status: draft
research: SDD/RESEARCH/AAAA-MM-DD-{Nome}Research.md
spec: SDD/SPEC/AAAA-MM-DD-{Nome}Spec.md
---

# {Nome} — Plan

COMO a Spec será implementada. Deve ser executável por quem não participou da conversa: nada implícito, nada "a decidir".

## Roadmap

Obrigatório. Etapas da implementação em ordem.

| # | Etapa | Objetivo | Entregável | Depende de |
|---|---|---|---|---|
| E1 | ... | ... | ... | — |
| E2 | ... | ... | ... | E1 |

### Trilhas e ondas

A implementação é dividida em trilhas executadas por implementers em paralelo (no máximo 4 por onda). Uma onda só começa quando as trilhas de que depende estão concluídas. Se a feature for pequena demais para paralelizar, uma trilha única e o motivo.

| Trilha | Onda | Etapas | Depende de | Arquivos donos (exclusivos) |
|---|---|---|---|---|
| ... | 1 | E1 | — | ... |

Arquivos compartilhados (raiz, lockfile, Dockerfile, compose): dono único ou concluídos numa onda anterior. Duas trilhas nunca editam o mesmo arquivo. Stack Docker completa só na trilha de integração da última onda.

### Interfaces entre trilhas

Tudo que uma trilha expõe e outra consome, definido antes da implementação: exports de `libs/contracts`, rotas HTTP, variáveis de ambiente, coleções, tópicos, nomes de serviço e portas.

## Arquivos

| Ação | Caminho | Propósito |
|---|---|---|
| criar | ... | ... |
| alterar | ... | ... |

## Tarefas

### E1 — {nome da etapa}
- [ ] T-1 ... (cobre CA-n)
  - Teste: ...

### E2 — {nome da etapa}
- [ ] T-2 ... (cobre CA-n)
  - Teste: ...

## Verificação

Comandos exatos para rodar testes, lint, typecheck e a checagem ponta a ponta, e o resultado esperado de cada um.

```
...
```

## Notas para o implementador

Armadilhas conhecidas, entradas relevantes do napkin, docs consultadas.
