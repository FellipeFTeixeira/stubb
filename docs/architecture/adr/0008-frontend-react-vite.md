# ADR 0008 — Frontend em React + Vite

**Status:** aceito (2026-10-24)

## Contexto

O Stubb precisa de uma interface web para vitrine, mapa de assentos, compra, "meus ingressos", painel do produtor e portaria.

## Decisão

React + Vite em `apps/web`, falando com o backend apenas via Nginx. Stack do front:

| Tema | Escolha |
|---|---|
| Linguagem | TypeScript |
| Roteamento | React Router |
| Estado do servidor (busca, cache, invalidação) | TanStack Query |
| Estado do cliente (seleção de assentos, etapa do checkout, sessão, cronômetro do hold) | Zustand |
| UI e estilo | Tailwind CSS + shadcn/ui |
| Formulários e validação | React Hook Form + Zod |
| Testes de componente | Vitest + React Testing Library |
| Testes ponta a ponta | Playwright |

## Alternativas

- Linguagem: JavaScript (perde tipagem compartilhada com o backend).
- Roteamento: TanStack Router (tipagem total, menos material de estudo).
- Estado do servidor: SWR (menos recursos de mutation/invalidação); `fetch` puro (mais código).
- Estado do cliente: Context API (re-render amplo); Redux Toolkit (mais boilerplate).
- UI: MUI (visual engessado); CSS Modules (tudo na mão).
- Formulários: só React Hook Form; formulários controlados na mão.
- Testes: só componente ou só E2E.

## Consequências

- **Estado do servidor e estado do cliente ficam separados.** Dado vindo da API vive só no cache do TanStack Query, que é mais um read model e pode estar atrasado. Nunca copiar dado do servidor para a store do Zustand (duas verdades).
- Read-your-writes no front: após um command, a query correspondente é refeita com `min_version` até alcançar a versão devolvida. SSE atualiza ou invalida o cache do TanStack Query nas telas ao vivo.
- Tipos de commands, queries e eventos podem ser importados de `libs/contracts`. Schemas Zod nessa lib permitiriam validar o mesmo payload no front e no backend; usar Zod também no backend é decidido na Fase 1.
- shadcn/ui copia os componentes para dentro do projeto: o código é nosso e pode ser alterado.
- Versões exatas das bibliotecas são definidas na pesquisa SDD da Fase 1, consultando a documentação atual.
