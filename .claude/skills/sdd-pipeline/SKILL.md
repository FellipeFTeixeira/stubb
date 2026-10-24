---
name: sdd-pipeline
description: Inicia o pipeline SDD (Spec-Driven Development) do Stubb para uma feature ou fase do roadmap — Pesquisa, Open Questions, Spec + Plan, Aprovação, Implementação e Verificação.
argument-hint: <feature ou fase a implementar>
disable-model-invocation: true
---

# Pipeline SDD do Stubb

Feature pedida: **$ARGUMENTS**

Você é o thread principal (orquestrador). Você não pesquisa a fundo nem implementa: delega aos subagentes, leva perguntas ao usuário e controla os gates.

## Regras do pipeline

1. **Nunca implementar com dúvida.** Toda dúvida vira Open Question (OQ) levada ao usuário, principalmente regra de negócio.
2. **Gates são obrigatórios.** Sem OQ zerada não há Spec; sem aprovação do usuário não há implementação.
3. **Naming:** `AAAA-MM-DD-{NomePascalCase}{Research|Spec|Plan}.md`, data de criação, mesmo `{Nome}` nos três arquivos. Research em `SDD/RESEARCH/`; Spec e Plan em `SDD/SPEC/`.
4. **Templates obrigatórios:** `.claude/skills/sdd-pipeline/templates/research.md`, `spec.md`, `plan.md`.
5. **Todo Plan começa com um Roadmap** da implementação. Plan sem Roadmap é devolvido ao planner.
6. **Modelos:** pesquisa e planejamento com o subagente `sdd-planner` (Opus 5.5, effort high); implementação com o subagente `sdd-implementer` (Sonnet 5.5, effort medium). Os modelos estão fixados no frontmatter dos agentes.
7. **Status no frontmatter** de cada arquivo: `draft` → `approved` → `implemented`.
8. **Commit só se o usuário pedir.** Formato: prefixo Conventional Commits em inglês + texto em PT-BR.
9. Subagentes rodam em background: aguarde a notificação de conclusão, nunca presuma o resultado.

## Etapa 0, Preparação

1. Ler `.claude/napkin.md` e `docs/roadmap.md`.
2. Se `$ARGUMENTS` estiver vazio ou vago, perguntar ao usuário qual feature/fase antes de seguir.
3. Escolher o `{Nome}` em PascalCase (ex.: `HoldSeats`, `WalkingSkeleton`) e a data de hoje. Informar ao usuário.
4. Marcar a fase como "em andamento" em `docs/roadmap.md`, se ainda não estiver.

## Etapa 1, Pesquisa

Spawn de `sdd-planner` em **modo research**, passando: descrição da feature, fase do roadmap, `{Nome}`, data e o caminho do arquivo a gerar (`SDD/RESEARCH/AAAA-MM-DD-{Nome}Research.md`). Guarde o ID/nome do agente para continuá-lo depois.

## Etapa 2, Gate 1: Open Questions

1. Ler o arquivo de Research gerado. Se houver incoerência ou dúvida que o planner não levantou, acrescente como OQ.
2. Levar as OQs ao usuário com AskUserQuestion (até 4 por chamada; perguntas `[negócio]` primeiro). Incluir a recomendação do planner como primeira opção quando existir.
3. Registrar cada resposta na seção **Decisões** do Research (`OQ-n → decisão`).
4. Se uma resposta gerar dúvida nova, ela vira nova OQ. Repetir até zerar.
5. Só avance quando todas as OQs tiverem decisão registrada.

## Etapa 3, Spec + Plan

Continuar o mesmo `sdd-planner` via SendMessage (mantém o contexto da pesquisa) em **modo spec-plan**, com os caminhos `SDD/SPEC/AAAA-MM-DD-{Nome}Spec.md` e `SDD/SPEC/AAAA-MM-DD-{Nome}Plan.md`.

Ao receber:
- conferir que o Plan começa com Roadmap e que toda tarefa `T-n` aponta para um `CA-n`;
- conferir que toda `RN-n` da Spec é rastreável a uma decisão do Research;
- se o planner devolveu OQs novas, voltar à Etapa 2.

## Etapa 4, Gate 2: Aprovação

Apresentar ao usuário um resumo curto: RNs, CAs, etapas do Roadmap e caminhos dos arquivos. Pedir aprovação explícita. Ajustes pedidos voltam ao planner (Etapa 3). Com aprovação, marcar `status: approved` na Spec e no Plan.

## Etapa 5, Implementação

Spawn de `sdd-implementer` com os caminhos de Spec, Plan e Research. Se ele parar com dúvida:
1. levar a dúvida ao usuário;
2. registrar a decisão no Research e pedir ao planner que atualize Spec/Plan;
3. continuar o implementer via SendMessage.

## Etapa 6, Verificação

1. Conferir cada `CA-n` contra o relatório do implementer e rodar você mesmo os comandos de verificação do Plan.
2. Reportar ao usuário o resultado de forma fiel: o que passou, o que falhou, o que ficou de fora.
3. Se tudo passou: `status: implemented` em Spec e Plan; atualizar `docs/roadmap.md` (links dos arquivos SDD e status da fase).
4. Registrar no `.claude/napkin.md` erros corrigidos e descobertas da execução.
5. Oferecer commit; só commitar se o usuário pedir.
