# ADR 0002 — Gateway com Nginx

**Status:** aceito (2026-10-24)

## Contexto

Write e read são serviços separados. O cliente precisa de um ponto de entrada único que direcione cada requisição ao lado certo.

## Decisão

Nginx como reverse proxy. Requisições `GET` vão para o read-service; os demais métodos, para o write-service. Exceções são roteadas por prefixo de rota.

## Alternativas

- **Kong**: API gateway completo (auth, plugins) sobre Nginx; recursos que ainda não precisamos.
- **Envoy**: poderoso, configuração bem mais complexa.
- **Traefik**: simples com Docker labels, mas esconde mais a configuração.

## Consequências

- Configuração explícita, bom para aprender reverse proxy.
- Rotear por método é convenção: uma query via `POST` (ex.: busca complexa) precisa de regra própria.
- Rate limit e fila virtual (Fase 9) podem ser implementados no próprio Nginx.
