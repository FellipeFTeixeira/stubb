# Napkin

Caderno de aprendizados do Stubb. Ler no início de toda sessão e antes de cada etapa SDD.
Escrever quando errar e for corrigido, ou ao descobrir algo não óbvio. Atualizar entradas existentes em vez de duplicar.

Formato: `- [AAAA-MM-DD] <fato>. **Como aplicar:** <ação>`

## Erros e correções

- [2026-10-24] A instrução original sobre pastas citava `SPEC/` duas vezes; a intenção era `SDD/RESEARCH/` (pesquisa) + `SDD/SPEC/` (Spec e Plan). **Como aplicar:** quando uma instrução parecer contraditória, perguntar em vez de escolher uma leitura.

## Descobertas

- [2026-10-24] Ambiente é Windows 11, com PowerShell 5.1 como shell principal e Git Bash disponível. **Como aplicar:** não usar `&&` no PowerShell; escolher a sintaxe do shell usado.
- [2026-10-24] O usuário escreveu "vitre" querendo dizer Vite (frontend React + Vite). **Como aplicar:** em caso de termo estranho, confirmar ou registrar a interpretação.
- [2026-10-24] "Fase" se refere ao roadmap do projeto (`docs/roadmap.md`); "Etapa" se refere aos passos do pipeline SDD. **Como aplicar:** usar os termos de forma consistente em docs e conversas.
- [2026-10-24] O `gh` está logado como `fellipeftg`, que tem permissão de admin no repo `FellipeFTeixeira/stubb`. Existe um worktree `C:/Users/felli/orca/workspaces/stubb/duvidas` (branch `duvidas`) que não é do pipeline. **Como aplicar:** não estranhar a diferença de login; não mexer no worktree `duvidas` sem o usuário pedir.
- [2026-10-24] Subagentes do Claude Code aceitam `model` e `effort` no frontmatter de `.claude/agents/*.md`, e por padrão rodam em background. **Como aplicar:** esperar a notificação de conclusão do subagente; não presumir o resultado.
