---
feature: {Nome}
plan: SDD/SPEC/AAAA-MM-DD-{Nome}Plan.md
---

# {Nome} — Board

Memória compartilhada dos implementers paralelos. Cada implementer lê este arquivo antes de cada tarefa e escreve aqui ao concluir uma tarefa, ao expor ou alterar uma interface, ao descobrir algo e ao travar.
Regras de escrita: cada agente edita só a linha da sua trilha na tabela e só acrescenta entradas nas outras seções (nunca apaga nem reescreve entradas de outro agente).

## Trilhas

Preenchida pelo thread principal ao disparar cada onda.

| Trilha | Onda | Agente | Status | Tarefa atual | Arquivos donos |
|---|---|---|---|---|---|
| ... | 1 | ... | aguardando / em andamento / bloqueada / concluída | T-n | ... |

## Interfaces publicadas

O que uma trilha expôs e outras consomem: exports, rotas, nomes de env, coleções, tópicos, serviços e portas. Divergência em relação ao Plan é dúvida: registrar em Bloqueios e parar.

- [trilha] <interface> — <onde está> — <estado: conforme Plan | alterada com aprovação>

## Log

- [AAAA-MM-DD HH:MM] [trilha] T-n concluída — <resumo, testes que passaram>

## Bloqueios e dúvidas

- [trilha] T-n — <dúvida exata> — <aguardando usuário | resolvida: decisão>

## Descobertas para o napkin

- [trilha] <fato não óbvio> — **Como aplicar:** <ação>
