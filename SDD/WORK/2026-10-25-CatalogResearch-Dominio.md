---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-25
status: draft
area: Dominio (regras de negócio e modelo de domínio)
---

# Catalog — Research parcial: Domínio

Pesquisa parcial da área **Domínio**. Cobre regras de negócio, entidades, relacionamentos, ciclo de vida, validações, preço, capacidade e a fronteira Catalog x Inventory. Infra, Backend (mecânica do write-service), ReadSide (projector e read-service) e Frontend ficam com as outras parciais. Quando uma decisão daqui afeta essas áreas, a dependência é apontada na seção "Dependências com outras áreas", sem decidir por elas.

## Objetivo

Definir **o que é** o catálogo do Stubb antes de qualquer código: quais entidades existem (Evento, Local, Sessão, Setor, Lote), como se relacionam, que estados atravessam e quais invariantes o write-service precisa garantir. É o primeiro bounded context real e o primeiro fluxo command → evento de domínio → projeção com significado de negócio (`docs/roadmap.md:13`).

Conceitos de CQRS que o domínio do Catalog exercita:

- **Write model normalizado e read model desnormalizado.** O write side guarda Local, Evento, Sessão, Setor e Lote como o domínio pede; a vitrine (`event_listing`, `docs/architecture/overview.md:97`) quer um documento pronto com nome do evento, cidade, próxima data e "a partir de R$ X". A decisão sobre onde vivem os setores e se o local é copiado (OQ-Dominio-11 e 13) define quanto fan-out a projeção terá.
- **Invariantes no agregado.** "Só publica com sessão, setor e lote" (OQ-Dominio-41) é a regra que justifica a fronteira do agregado (OQ-Dominio-53).
- **O tempo não é um command.** "Lote vigente", "vendas abertas" e "evento encerrado" mudam com o relógio, sem nenhum evento de domínio. O domínio precisa dizer se esses estados são gravados ou derivados (OQ-Dominio-31, 40, 47, 51), e o ReadSide precisa saber disso.
- **Fronteira entre contextos.** O Catalog descreve o que está à venda; o Inventory (Fase 4) controla o que ainda está disponível. Os eventos públicos do Catalog serão a entrada do Inventory, então o contrato desenhado agora precisa sobreviver às Fases 4 e 5 (ADR 0006, `docs/architecture/adr/0006-event-sourcing-ordering.md:22`).

## Escopo

**Dentro (área Domínio):**
- Entidades do Catalog e relacionamentos: Evento, Local, Sessão, Setor (assento marcado e pista), Assento (como layout, se entrar na Fase 2), Lote.
- Campos de cada entidade, obrigatoriedade, limites e validações.
- Ciclo de vida: rascunho, publicação, cancelamento, encerramento, exclusão.
- Regras de edição depois da publicação.
- Lote: semântica da virada (por data, por quantidade), relação com a capacidade do setor.
- Preço: moeda, precisão, mínimo, máximo, gratuidade.
- Produtor seed: quantos, que dados, regra de propriedade.
- O que o Catalog possui versus o que é do Inventory (Fase 4) e do Ordering (Fase 5).
- Regras de negócio que alimentam a vitrine e a página do evento (o que aparece, qual preço, qual ordem).
- Fronteira de agregados e granularidade de commands/eventos, como consequência das regras (marcadas `[técnica]`).

**Fora (área Domínio):**
- Disponibilidade, hold, contagem de vendidos, "esgotado" de verdade: Inventory, Fase 4 (`docs/roadmap.md:15`, `docs/architecture/overview.md:54`).
- Meia-entrada, cota legal, taxa de conveniência, limite por CPF, pedido e pagamento: Fase 5 (`docs/roadmap.md:16`). A OQ-Dominio-39 confirma se o Catalog guarda alguma configuração disso já agora.
- Reembolso e efeitos de cancelamento sobre compradores: Fase 7 (`docs/roadmap.md:18`).
- Cadastro, login e papéis reais: Identity, Fase 3 (`docs/roadmap.md:14`).
- Mecânica técnica (tabelas, migrations, outbox, tópico, endpoints, shape do documento Mongo, telas): áreas Backend, Infra, ReadSide e Frontend.

## Mapeamento da codebase

**Não existe nenhum código do Catalog.** O write-service tem só os módulos `diagnostics`, `health`, `database` e `shared` (`apps/write-service/src/`). O único agregado é o `Ping` do walking skeleton.

O que a Fase 1 deixou e que o domínio do Catalog vai seguir:

| Onde | O que é | Relevância para o domínio |
|---|---|---|
| `apps/write-service/src/diagnostics/domain/ping.aggregate.ts:14-61` | Agregado state-stored sobre `AggregateRoot`; `create` nasce na versão 1 e emite o evento; cada mutação incrementa `version` e chama `apply` | Padrão a seguir: toda regra de negócio do Catalog vive no agregado, cada mutação gera um evento de domínio e incrementa a versão (regra 7, read-your-writes) |
| `apps/write-service/src/diagnostics/domain/ping.aggregate.ts:13` | Eventos só são acumulados; o repositório grava na outbox | Agregados do Catalog não publicam nada; a outbox é responsabilidade do repositório (regra 3) |
| `apps/write-service/src/shared/errors.ts:1-20` | Só existem `ConcurrencyConflictError`, `AggregateNotFoundError` e `IdempotencyKeyMismatchError` | Não há erro de violação de regra de negócio (ex.: "não pode publicar sem sessão"). O Catalog é o primeiro contexto que rejeita commands por regra. Dependência Backend: classe de erro e mapeamento para status HTTP |
| `apps/write-service/src/shared/outbox/outbox-writer.ts:22-37` | `OutboxWriter` fixo no contexto `diagnostics` e nos eventos do Ping | Precisa ser generalizado para os eventos do Catalog. Dependência Backend |
| `libs/contracts/src/events/envelope.ts:4-21` | Envelope com `schemaVersion: 1`, `aggregateType`, `aggregateId`, `aggregateVersion` | Os eventos do Catalog usam esse envelope; `aggregateType` depende da fronteira de agregados (OQ-Dominio-53) |
| `libs/contracts/src/shared/schemas.ts:3-5` | Schemas compartilhados (`uuidSchema`, `idempotencyKeySchema`, `minVersionSchema`) | Não há schema de dinheiro, data/hora com fuso, UF ou texto com trim. As validações decididas aqui viram schemas Zod em `libs/contracts` (OQ-5 da Fase 1: mesmo schema no web e no write-service) |
| `apps/write-service/src/database/migrations/1792869381065-InitialSchema.ts:17` | Tabela `outbox` com `bounded_context` como roteador de tópico | Eventos do Catalog saem com `bounded_context = 'catalog'` (decisão OQ-18 da Fase 1) |
| `infra/kafka/create-topics.sh:7-8` | Só o tópico `diagnostics.events` existe | `catalog.events` (`docs/architecture/adr/0004-kafka.md:11`) precisa ser criado. Dependência Infra |
| `SDD/RESEARCH/2026-10-24-SkeletonResearch.md:519` | Decisão OQ-42 da Fase 1: `label` com trim, 1 a 50 caracteres, mesma regra Zod no form e no write-service | Precedente de **estilo** de validação de texto; não é regra de negócio do Catalog. Os limites de texto do Catalog estão nas OQs |

Documentação de domínio consultada:

| Onde | Conteúdo |
|---|---|
| `docs/domain/glossary.md:7` | Evento: o espetáculo vendido; tem uma ou mais sessões |
| `docs/domain/glossary.md:9` | Local: lugar físico onde o evento acontece, **com sua planta de setores** |
| `docs/domain/glossary.md:10` | Sessão: uma ocorrência do evento em data e horário específicos |
| `docs/domain/glossary.md:11` | Setor: área do local **para uma sessão**; assento marcado ou pista |
| `docs/domain/glossary.md:12-13` | Assento: lugar numerado em setor de assento marcado. Pista: sem assento numerado, vendida por quantidade |
| `docs/domain/glossary.md:14` | Lote: faixa de preço de um setor válida por período ou até esgotar |
| `docs/domain/glossary.md:22-24` | Meia-entrada (50%, Lei 12.933/2013), taxa de conveniência, Produtor |
| `docs/domain/glossary.md:28` | Valores, percentuais, prazos e limites são regras a confirmar no SDD |
| `docs/architecture/overview.md:53-54` | Catalog: eventos, locais, sessões, setores, lotes e preços, CQRS leve, quase CRUD. Inventory: disponibilidade e holds |
| `docs/architecture/overview.md:97-99` | `event_listing` (vitrine e busca), `session_seat_map` (um documento por sessão), `sector_availability` (contagem por setor/lote) |
| `docs/architecture/overview.md:104-116` | Regras candidatas, **nenhuma confirmada**: inclui "virada de lote por data ou por esgotamento" (linha 109) |
| `docs/architecture/adr/0007-escopo-ingressos.md:11,19-20` | Assento marcado e pista suportados a partir da Fase 4; dois modelos de concorrência |
| `CLAUDE.md:44` | Agregado de inventário por sessão + setor |
| `docs/roadmap.md:13-16` | Fase 2 cadastra lotes; a Fase 5 também lista "lotes" entre as entregas |

**Tensão encontrada no glossário:** a linha 9 coloca a planta de setores no Local; a linha 11 define Setor como área do local "para uma sessão". As duas leituras levam a modelos diferentes (planta reutilizável no local versus setores por sessão). Isso está na OQ-Dominio-11; não foi resolvido aqui.

**Tensão encontrada no roadmap:** `docs/roadmap.md:13` entrega o cadastro de lotes na Fase 2 e `docs/roadmap.md:16` lista "lotes" de novo na Fase 5. A leitura provável é "cadastro na Fase 2, virada por esgotamento quando houver venda na Fase 5", mas isso é interpretação. Está na OQ-Dominio-30.

## Regras de negócio identificadas

Somente o que já tem fonte. Tudo o mais está nas Open Questions.

| ID | Regra | Fonte |
|---|---|---|
| RC-1 | Um Evento tem uma ou mais Sessões. (O que vale para rascunho está na OQ-Dominio-28.) | `docs/domain/glossary.md:7` |
| RC-2 | Uma Sessão é uma ocorrência do Evento em data e horário específicos. | `docs/domain/glossary.md:10` |
| RC-3 | Existem dois tipos de setor: assento marcado e pista. Os dois são suportados (a venda, a partir da Fase 4). | `docs/domain/glossary.md:11`, `docs/architecture/adr/0007-escopo-ingressos.md:11`, `CLAUDE.md:37` |
| RC-4 | Em setor de assento marcado, cada assento é numerado e único; pista é vendida por quantidade. | `docs/domain/glossary.md:12-13`, ADR 0007:19 |
| RC-5 | Lote é uma faixa de preço **de um setor**, válida por período ou até esgotar. A semântica exata (os dois critérios juntos? qual vence?) não está definida. | `docs/domain/glossary.md:14`, `docs/architecture/overview.md:109` (candidata) |
| RC-6 | O Catalog é dono de eventos, locais, sessões, setores, lotes e preços. | `docs/architecture/overview.md:53` |
| RC-7 | Disponibilidade e holds são do Inventory (Fase 4). O Catalog não decide disponibilidade. O agregado de inventário é por sessão + setor, então sessão e setor precisam de identidade estável que o Inventory consiga referenciar. | `docs/architecture/overview.md:54`, `CLAUDE.md:44`, `docs/roadmap.md:15` |
| RC-8 | Na Fase 2 o produtor é um usuário seed; não há Identity. | `docs/roadmap.md:13-14` |
| RC-9 | Meia-entrada, taxa de conveniência, limite por CPF, pedido e pagamento são da Fase 5. | `docs/roadmap.md:16` |
| RC-10 | Cancelamento com reembolso é da Fase 7. | `docs/roadmap.md:18` |
| RC-11 | Módulos só se comunicam por commands, queries e eventos públicos; o Inventory não lê tabelas do Catalog. Tudo o que o Inventory precisar do Catalog chega por evento público. | `CLAUDE.md:50` |
| RC-12 | Os eventos do Catalog são contrato público versionado em `libs/contracts`, desenhado pensando em evolução. | `CLAUDE.md:56`, `docs/architecture/adr/0006-event-sourcing-ordering.md:22` |

Restrição técnica com efeito no domínio: o write-service nunca lê do MongoDB para decidir (`CLAUDE.md:41`). Toda validação do Catalog (ex.: "o local existe e pertence ao produtor", "a sessão tem lote") usa o PostgreSQL.

## Impacto CQRS

Tudo abaixo é **candidato**, dependente das OQs. Os nomes seguem a convenção (`CLAUDE.md:55`): command no imperativo, evento no passado, query `Get*`/`List*`.

### Modelo de domínio candidato (não confirmado)

Este é o modelo que resulta das **recomendações** das OQs. Se o usuário escolher outras opções, ele muda.

```
Organizer (seed, fora do Catalog: só um organizerId)
   │ 1..n
   ├── Venue (agregado)                 nome, cidade/UF, endereço, fuso
   │      └── SectorTemplate 1..n       nome, tipo (seated | general_admission),
   │             └── layout             capacidade (pista) ou filas × assentos (marcado)
   │
   └── Event (agregado)                 título, descrição, categoria, classificação, imagem, status
          └── Session 1..n              venueId, início, status
                 └── SessionSector 1..n cópia do SectorTemplate na criação da sessão, ativo/inativo
                        └── Batch 1..n  nome, ordem, preço (centavos BRL), quantidade?, período?
```

Pontos em aberto que mudam esse desenho: OQ-Dominio-6 (Local existe como cadastro?), 11 (onde vivem os setores), 13 (cópia ou referência), 15/16 (layout de assentos na Fase 2), 25 (local por sessão ou por evento), 29 (lote por sessão ou por evento), 49 (estado por sessão), 53 (fronteira de agregados).

### Itens CQRS candidatos

| Tipo | Itens (candidatos) |
|---|---|
| Commands | `CreateVenue`, `UpdateVenueDetails`, `AddVenueSector` / `UpdateVenueSector` / `RemoveVenueSector` (planta); `CreateEvent` (nasce rascunho), `UpdateEventDetails`, `AddSession`, `UpdateSession`, `RemoveSession`, `SetSessionSectorActive`, `AddBatch`, `UpdateBatch`, `RemoveBatch`, `PublishEvent`, `PublishSession` (se OQ-Dominio-49 = B), `DiscardEvent` (se OQ-Dominio-46 = A). Fora, salvo decisão contrária: `CancelEvent`, `CancelSession`, `RescheduleSession`, `UnpublishEvent` |
| Events | `VenueCreated`, `VenueDetailsUpdated`, `VenueSectorAdded` / `VenueSectorUpdated` / `VenueSectorRemoved`; `EventCreated`, `EventDetailsUpdated`, `SessionAdded`, `SessionUpdated`, `SessionRemoved`, `SessionSectorActivated` / `SessionSectorDeactivated`, `BatchAdded`, `BatchUpdated`, `BatchRemoved`, `EventPublished`, `SessionPublished`, `EventDiscarded`. Todos v1 no envelope de `libs/contracts/src/events/envelope.ts:4-21` |
| Queries | `ListEvents` (vitrine, com filtros da OQ-Dominio-50), `GetEvent` (página do evento). Se houver back-office (OQ-Dominio-1): `ListOrganizerEvents`, `GetOrganizerEvent` (inclui rascunhos), `ListOrganizerVenues`, `GetVenue` |
| Aggregates | Recomendação da OQ-Dominio-53: `Venue` (com a planta) e `Event` (com sessões, setores da sessão e lotes) |
| Read models | `event_listing` (`docs/architecture/overview.md:97`). Possíveis outros (documento da página do evento, visão do produtor com rascunhos, locais do produtor): decisão do ReadSide |
| Sagas / process managers | Não se aplica na Fase 2: não há reação entre contextos. Na Fase 4, eventos do Catalog (ex.: `SessionPublished`) devem inicializar os agregados de inventário por sessão + setor; o contrato desenhado agora precisa carregar o que o Inventory vai precisar (capacidade da pista, layout dos assentos, identidade estável de sessão e setor) |

## Riscos

- **R-D1 Ambiguidade Local x Setor no glossário.** `docs/domain/glossary.md:9` e `:11` apontam para modelos diferentes. Escolher sem o usuário gera retrabalho no write model, nos contratos e no Inventory. Mitigação: OQ-Dominio-11, 12 e 13.
- **R-D2 Estados que mudam com o tempo.** "Lote vigente", "vendas abertas", "sessão passada" e "evento encerrado" mudam sem command e sem evento. Se o read model gravar esses estados no momento da projeção, eles ficam velhos. Mitigação: o domínio decide se são derivados (OQ-Dominio-31, 40, 47, 51); o ReadSide decide como calcular (na leitura ou com scheduler, como na regra 8 do `CLAUDE.md:48`).
- **R-D3 Lote "até esgotar" depende de vendas que ainda não existem.** O esgotamento é conhecido pelo Inventory/Ordering (Fases 4 e 5), não pelo Catalog. Se o Catalog tentar ser dono do "lote vigente", vai precisar reagir a eventos de outro contexto; se não for, o dono passa a ser outro contexto. Mitigação: OQ-Dominio-30 e 31 definem a regra agora e deixam claro o que só vale a partir da Fase 4/5.
- **R-D4 Fan-out da desnormalização.** Se o nome ou a cidade do local vão para o `event_listing`, editar um local atualiza muitos documentos. É um bom aprendizado de CQRS, mas cresce o escopo. Mitigação: OQ-Dominio-13 (cópia na sessão reduz o fan-out) e a decisão do ReadSide.
- **R-D5 Edição pós-publicação sem regra quebra o Inventory.** Se a Fase 2 permitir mudar capacidade, layout, data ou local de sessão publicada à vontade, a Fase 4 vai herdar dados que o Inventory não consegue acompanhar (ex.: assento removido depois de vendido). Mitigação: OQ-Dominio-48.
- **R-D6 Agregado grande.** Evento com muitas sessões, cada uma com muitos setores e lotes, gera um agregado pesado e carregado inteiro a cada command. Mitigação: limites (OQ-Dominio-18 e 28) e a OQ-Dominio-53.
- **R-D7 Documento do mapa de assentos no Mongo.** `session_seat_map` é um documento por sessão (`docs/architecture/overview.md:98`), e documento Mongo tem limite de 16 MB. Layout sem limite de assentos pode estourar na Fase 4. Mitigação: OQ-Dominio-18.
- **R-D8 Fuso horário.** O Brasil tem mais de um fuso; guardar data/hora sem fuso exibe horário errado em locais fora do horário de Brasília. Mitigação: OQ-Dominio-10.
- **R-D9 Questões legais reais (meia-entrada, classificação indicativa, acessibilidade).** O projeto é de estudo, mas o usuário quer aprender regras críticas de ticketing. A Lei 12.933/2013, regulamentada pelo Decreto 8.537/2015, assegura meia-entrada em 40% dos ingressos disponíveis de cada evento; há controvérsia se o percentual é por evento ou por setor (entendimento do MP-CE é por setor). Isso afeta capacidade por setor na Fase 5. Mitigação: OQ-Dominio-17, 21 e 39 declaram explicitamente o que fica fora.
- **R-D10 Escopo crescendo.** Cada OQ respondida com "incluir já" aumenta o cadastro. As recomendações abaixo tentam o mínimo que ainda ensina CQRS e não quebra as Fases 4 e 5.

## Dependências com outras áreas

Apontadas, não decididas.

| OQ desta área | Área afetada | O que depende |
|---|---|---|
| OQ-Dominio-1 (back-office do produtor) | Frontend, ReadSide | Quantidade de telas e formulários; necessidade de read model com rascunhos do produtor |
| OQ-Dominio-2, 3 (produtor seed e propriedade) | Backend, Infra | Como o produtor é identificado nas requisições sem Identity; como o seed é criado (one-shot no compose, migration, script) |
| OQ-Dominio-5 (dados de demonstração) | Backend, Infra | Mecanismo do seed de catálogo (via commands, passando pela outbox) |
| OQ-Dominio-8, 10 (campos do local, fuso) | ReadSide, Frontend | Filtro por cidade; formatação de data/hora no fuso do local |
| OQ-Dominio-11, 13, 25, 53 (setores, cópia, agregados) | Backend, ReadSide | Tabelas, repositórios, `aggregateType`, partition key, fan-out de projeção |
| OQ-Dominio-15, 16, 18 (layout de assentos) | Backend, ReadSide, Frontend | Tamanho dos payloads e dos documentos; formulário de layout |
| OQ-Dominio-22 (imagem) | Infra, Backend, Frontend | Upload exige storage; URL externa exige validação e placeholder |
| OQ-Dominio-31, 40, 47, 51, 52 (estados derivados do tempo) | ReadSide, Backend | Cálculo na leitura versus scheduler emitindo eventos |
| OQ-Dominio-36 (preço) | Backend, ReadSide, Frontend | Tipo de coluna, tipo no contrato, formatação em BRL |
| OQ-Dominio-50 (filtros e busca da vitrine) | ReadSide, Frontend | Índices no Mongo, parâmetros de `ListEvents` |
| OQ-Dominio-54 (granularidade dos commands/eventos) | Backend, ReadSide | Número de endpoints e handlers; payload dos eventos (completo ou só o que mudou) |
| Erro de regra de negócio | Backend | Não existe classe de erro de domínio (`apps/write-service/src/shared/errors.ts:1-20`); status HTTP de violação de regra |

## Open Questions

Todas as `[negócio]` precisam de resposta do usuário. Valores numéricos nas recomendações são **sugestões para o usuário confirmar ou trocar**, não regras.

### Grupo A — Escopo e atores

#### OQ-Dominio-1 [negócio] O cadastro tem tela do produtor no web ou é só via API?
- **Contexto:** `docs/roadmap.md:13` entrega "cadastro de evento, local, sessão, setores e lotes" e "vitrine e página do evento no web". Não diz se o produtor cadastra por uma tela. Uma tela de produtor também pede uma lista dos próprios eventos, incluindo rascunhos, que não aparecem na vitrine.
- **Opções:** A) back-office mínimo no web: cadastrar local e planta, criar evento, sessões e lotes, publicar, listar os próprios eventos (com rascunhos); B) cadastro só pela API (HTTP + seed/script); o web tem só vitrine e página do evento; C) back-office parcial: criar e publicar evento pela tela, locais só por seed.
- **Recomendação:** A. O aprendizado da fase é "command → evento → projeção", e ele fica visível quando o usuário escreve pela tela e vê o read-your-writes (`min_version`) na prática. É a opção mais cara; se o escopo pesar, C.

#### OQ-Dominio-2 [negócio] Produtor seed: quantos e com quais dados?
- **Contexto:** `docs/roadmap.md:13` fala em "produtor via usuário seed". Identity só chega na Fase 3. Os eventos precisam de um dono (`organizerId`) para a Fase 3 não mudar o contrato.
- **Opções:** A) um produtor seed com ID fixo (UUID) e nome de exibição; B) dois ou mais produtores seed, para exercitar a regra de propriedade (OQ-Dominio-3); C) nenhum produtor modelado; eventos sem dono até a Fase 3.
- **Recomendação:** A. Basta para o cadastro; o `organizerId` já entra no agregado e nos eventos. B só faz sentido se a OQ-Dominio-3 for A.

#### OQ-Dominio-3 [negócio] A regra "o produtor só gerencia os próprios eventos e locais" já vale na Fase 2?
- **Contexto:** sem Identity, qualquer forma de dizer "sou o produtor X" é forjável. A regra é central na Fase 3.
- **Opções:** A) vale já: o write-service compara o produtor da requisição com o `organizerId` do agregado (mecanismo de identificação provisório definido pelo Backend); B) não vale; toda requisição age como o produtor seed e o `organizerId` é gravado; a validação entra na Fase 3; C) nenhum registro de dono.
- **Recomendação:** B. Grava o dono (contrato estável) sem construir uma autenticação provisória que a Fase 3 vai jogar fora.

#### OQ-Dominio-4 [negócio] O nome do produtor aparece na página do evento?
- **Contexto:** plataformas costumam mostrar "Organizado por ...". O produtor seed não tem perfil real; o perfil vem da Fase 3.
- **Opções:** A) sim, desnormalizado no read model; B) não na Fase 2.
- **Recomendação:** B. Sem Identity não há dado real; quando houver, vira um bom exemplo de desnormalização entre contextos.

#### OQ-Dominio-5 [negócio] O seed também cria locais e eventos de exemplo?
- **Contexto:** sem dados, a vitrine começa vazia. O read model precisa ser reconstruível por replay (`CLAUDE.md:46`), então dado escrito direto no Mongo não serve.
- **Opções:** A) sim, um conjunto pequeno criado **via commands** (passando pela outbox), cobrindo assento marcado e pista, rascunho e publicado; B) não; só o produtor seed; C) seed escrito direto no read model.
- **Recomendação:** A, com o conteúdo (quantos locais, quantos eventos, quais nomes) definido pelo usuário. C viola a reconstrução por replay.

### Grupo B — Local (Venue)

#### OQ-Dominio-6 [negócio] Local é um cadastro próprio e reutilizável?
- **Contexto:** `docs/domain/glossary.md:9` descreve o Local como lugar físico "com sua planta de setores", o que sugere um cadastro reutilizado por vários eventos.
- **Opções:** A) Local é cadastro próprio, criado uma vez e escolhido nas sessões; B) Local é só um conjunto de campos (nome, endereço) preenchido em cada evento ou sessão, sem reuso.
- **Recomendação:** A. Bate com o glossário e evita redigitar a planta de setores a cada evento.

#### OQ-Dominio-7 [negócio] Quem cria e quem enxerga os locais?
- **Contexto:** os papéis previstos são cliente, produtor e portaria (`docs/roadmap.md:14`); não há administrador da plataforma.
- **Opções:** A) cada produtor cadastra os próprios locais, visíveis só para ele; B) qualquer produtor cadastra e todos os locais são compartilhados; C) locais só por seed (lista fixa), o produtor apenas escolhe; D) criar um papel de administrador.
- **Recomendação:** A. Evita que a edição da planta por um produtor afete eventos de outro. Com um único produtor seed, A e B são iguais na prática na Fase 2.

#### OQ-Dominio-8 [negócio] Campos do local e validações.
- **Contexto:** a vitrine provavelmente mostra e filtra por cidade (OQ-Dominio-50). Endereço brasileiro tem formato próprio.
- **Opções:** A) nome, cidade, UF, endereço em texto livre; B) nome + endereço estruturado (logradouro, número, complemento opcional, bairro, cidade, UF, CEP); C) B + coordenadas (latitude/longitude) para mapa.
- Sub-perguntas: só locais no Brasil (UF obrigatória entre as 27)? Nome do local único por produtor? Tamanhos máximos?
- **Recomendação:** A, só Brasil, UF entre as 27 siglas, nome obrigatório com trim e 1 a 100 caracteres, cidade 1 a 100, endereço 1 a 200, nome **não** único (valores a confirmar). Endereço estruturado não acrescenta aprendizado de CQRS.

#### OQ-Dominio-9 [negócio] O local tem capacidade total, e ela limita a soma dos setores?
- **Contexto:** a capacidade de venda é por setor. Um teto do local seria uma segunda fonte de verdade.
- **Opções:** A) local tem capacidade máxima; a soma dos setores precisa ser menor ou igual; B) não há capacidade do local; a capacidade total é a soma dos setores (derivada); C) capacidade informativa, sem validação.
- **Recomendação:** B. Uma fonte só para capacidade.

#### OQ-Dominio-10 [negócio] Fuso horário das sessões.
- **Contexto:** o Brasil tem mais de um fuso. Exibir em horário de Brasília um show em Manaus mostra a hora errada para quem vai ao local.
- **Opções:** A) todo horário é horário de Brasília (`America/Sao_Paulo`); B) o local tem fuso (IANA, ex.: `America/Manaus`), escolhido no cadastro com padrão `America/Sao_Paulo`; a sessão guarda o instante e é exibida no fuso do local; C) data/hora sem fuso ("horário local ingênuo").
- **Recomendação:** B. O instante fica correto para ordenação e regras ("sessão já começou?"), e a exibição respeita o local.

### Grupo C — Setores, planta e assentos

#### OQ-Dominio-11 [negócio] Onde vivem os setores: no local, na sessão ou no evento?
- **Contexto:** o glossário diz que o Local tem "sua planta de setores" (`docs/domain/glossary.md:9`) e que o Setor é "área do local para uma sessão" (`:11`). O Inventory vai precisar de setor por sessão (`CLAUDE.md:44`).
- **Opções:** A) planta no local (setores-modelo); cada sessão cria os seus setores a partir da planta, e os lotes são definidos por setor da sessão; B) setores definidos direto em cada sessão, sem planta no local; C) setores definidos no evento, iguais para todas as sessões; D) planta no local, e a sessão apenas referencia a planta (sem cópia).
- **Recomendação:** A. Concilia as duas definições do glossário: a planta é do local, o setor vendável é da sessão.

#### OQ-Dominio-12 [negócio] (se OQ-Dominio-11 = A ou D) A sessão pode usar só parte da planta ou mudar um setor?
- **Contexto:** a mesma arena pode ter palco montado de formas diferentes; parte dos setores não é vendida.
- **Opções:** A) a sessão usa sempre todos os setores, sem ajuste; B) a sessão pode desativar setores, mas não alterar capacidade nem layout; C) pode desativar setores e reduzir capacidade (ou bloquear assentos); D) livre.
- **Recomendação:** B. Cobre o caso comum sem abrir edição de capacidade por sessão.

#### OQ-Dominio-13 [negócio] (se OQ-Dominio-11 = A ou D) O que acontece com as sessões quando a planta do local muda?
- **Contexto:** se a sessão referencia a planta, editar o local muda sessões já publicadas (e, na Fase 4, sessões com ingressos vendidos).
- **Opções:** A) a sessão copia a planta quando é criada; mudanças posteriores na planta não afetam sessões existentes; B) a cópia acontece na publicação; antes disso, a sessão acompanha a planta; C) a planta fica bloqueada depois de usada por alguma sessão; mudar exige novo local; D) mudanças na planta se propagam para todas as sessões.
- **Recomendação:** A. Regra simples de explicar e isola sessões publicadas (R-D5).

#### OQ-Dominio-14 [negócio] Campos do setor.
- **Contexto:** os tipos já estão confirmados (RC-3). Faltam os demais campos e a unicidade do nome.
- **Opções:** A) nome, tipo, e capacidade (pista) ou layout (assento marcado); B) A + descrição curta (ex.: "visão parcial do palco"); C) A + atributos visuais (cor, posição no mapa).
- Sub-perguntas: nome único dentro da planta? Tamanho máximo do nome? Ordem de exibição definida pelo produtor?
- **Recomendação:** A, nome único na planta (comparação sem diferenciar maiúsculas, após trim), 1 a 50 caracteres (a confirmar), ordem de exibição = ordem de cadastro. Visual do mapa fica para a Fase 4.

#### OQ-Dominio-15 [negócio] O layout dos assentos do setor marcado é definido no Catalog já na Fase 2?
- **Contexto:** o Catalog é dono da configuração do que existe (`docs/architecture/overview.md:53`); o Inventory, da disponibilidade (`:54`). A venda dos dois tipos começa na Fase 4 (ADR 0007:11), e o Inventory vai precisar saber quais assentos existem, por evento público (RC-11).
- **Opções:** A) o Catalog define o layout na Fase 2 e os eventos já o carregam; o Inventory consome na Fase 4; B) na Fase 2 o setor marcado guarda só a capacidade numérica; o layout entra na Fase 4; C) a Fase 2 aceita só setores de pista; assento marcado entra inteiro na Fase 4.
- **Recomendação:** A, com o formato mais simples possível (OQ-Dominio-16). Define o contrato uma vez só e mantém o dono certo do dado.

#### OQ-Dominio-16 [negócio] (se OQ-Dominio-15 = A) Formato do layout.
- **Contexto:** plantas reais têm filas de tamanhos diferentes, numeração par/ímpar, corredores. Quanto mais fiel, maior o formulário e o contrato.
- **Opções:** A) grade simples: lista de filas, cada uma com rótulo (ex.: "A") e quantidade de assentos numerados de 1 a N; o assento é identificado por fila + número; B) A + assentos inexistentes e numeração customizada; C) lista explícita de assentos com rótulo livre; D) coordenadas x/y para desenhar o mapa.
- **Recomendação:** A. Capacidade do setor = soma dos assentos das filas; rótulo de fila único no setor. Desenho do mapa fica para a Fase 4.

#### OQ-Dominio-17 [negócio] Assentos de acessibilidade entram no modelo?
- **Contexto:** a Lei Brasileira de Inclusão (Lei 13.146/2015) exige espaços reservados em locais de espetáculo. É regra real de ticketing.
- **Opções:** A) fora do escopo do estudo, registrado explicitamente; B) o layout marca assentos/espaços como acessíveis, sem regra de venda; C) com regras de venda (reserva, acompanhante).
- **Recomendação:** A. Fica registrado como lacuna consciente; pode virar fase futura.

#### OQ-Dominio-18 [negócio] Limites numéricos de setores e capacidade.
- **Contexto:** sem limite, uma planta pode estourar o agregado (R-D6) e o documento `session_seat_map` da Fase 4 (R-D7).
- **Opções:** A) limites definidos agora; sugestão: pista de 1 a 100.000 lugares; até 50 setores por planta; setor marcado com até 100 filas e até 100 assentos por fila (máx. 10.000 assentos por setor); B) só "inteiro positivo", sem teto; C) outros valores.
- **Recomendação:** A com os valores que o usuário escolher. Os números sugeridos são só ponto de partida.

### Grupo D — Evento

#### OQ-Dominio-19 [negócio] Campos do evento e limites.
- **Contexto:** a vitrine e a página precisam de dados mínimos. Cada campo vira formulário, validação e contrato.
- **Opções:** A) título, descrição (texto puro), categoria, classificação indicativa, imagem; B) só título e descrição; C) A + atrações/artistas, tags e política do evento.
- Sub-perguntas: tamanhos máximos? Dois eventos podem ter o mesmo título?
- **Recomendação:** A, título com trim e 1 a 120 caracteres, descrição de 1 a 5.000 caracteres em texto puro, títulos repetidos permitidos (valores a confirmar).

#### OQ-Dominio-20 [negócio] Categoria: lista fixa? Quais valores?
- **Opções:** A) lista fixa (sugestão: Show, Teatro, Stand-up, Esporte, Festival, Infantil, Outros); B) texto livre; C) sem categoria.
- **Recomendação:** A, com os valores que o usuário definir. Lista fixa permite filtro confiável na vitrine.

#### OQ-Dominio-21 [negócio] Classificação indicativa.
- **Contexto:** no Brasil, espetáculos públicos informam a classificação indicativa (categorias oficiais: Livre, 10, 12, 14, 16 e 18 anos).
- **Opções:** A) obrigatória, com as categorias oficiais; nenhum controle de idade na compra; B) opcional; C) fora do modelo.
- **Recomendação:** A. Custa um campo e deixa o catálogo mais realista; controle de idade na compra não entra.

#### OQ-Dominio-22 [negócio] Imagem do evento.
- **Contexto:** a vitrine fica pobre sem imagem; upload exige armazenamento de arquivos, que a stack não tem.
- **Opções:** A) URL externa (https) informada pelo produtor, opcional, com imagem padrão quando ausente; B) upload de arquivo (exige storage novo; dependência Infra); C) sem imagem; placeholder por categoria.
- **Recomendação:** A. Não adiciona infraestrutura.

#### OQ-Dominio-23 [negócio] Todo evento é presencial?
- **Opções:** A) sim; toda sessão tem local; B) suportar evento online (sessão sem local, com link).
- **Recomendação:** A. Evento online não tem setor nem assento e foge do foco (concorrência por lugar).

#### OQ-Dominio-24 [negócio] Festival de vários dias e passe para mais de uma sessão.
- **Contexto:** festivais vendem ingresso por dia e também "passaporte" que vale para vários dias. O glossário só define ingresso para uma sessão.
- **Opções:** A) fora: cada sessão é vendida separadamente, sem passe que cubra várias sessões; B) uma sessão pode durar vários dias (início e fim em datas diferentes), vendida como uma só; C) produto "passaporte" que reserva lugar em várias sessões.
- **Recomendação:** A. C cria uma reserva que cruza vários agregados de inventário (um por sessão + setor), o que muda a concorrência da Fase 4.

### Grupo E — Sessão

#### OQ-Dominio-25 [negócio] As sessões de um mesmo evento podem ser em locais diferentes?
- **Contexto:** turnês têm o mesmo espetáculo em várias cidades. Afeta a vitrine (um evento em várias cidades).
- **Opções:** A) sim, o local é da sessão; B) não, o local é do evento e vale para todas as sessões.
- **Recomendação:** A. Mais geral, e com a OQ-Dominio-11 = A os setores já são por sessão.

#### OQ-Dominio-26 [negócio] Quais horários a sessão tem?
- **Opções:** A) só início; B) início e término; C) abertura dos portões + início (+ término opcional).
- **Recomendação:** A. Com as recomendações das OQ-Dominio-38 e 47, nenhuma regra usa o término.

#### OQ-Dominio-27 [negócio] Quando uma sessão pode acontecer?
- **Opções:** A) o início precisa estar no futuro ao criar ou editar; sem limite máximo; B) antecedência mínima de X horas; C) A + no máximo N meses à frente.
- **Recomendação:** A. Não há regra de negócio conhecida que peça mais.

#### OQ-Dominio-28 [negócio] Quantidade de sessões e conflitos.
- **Contexto:** RC-1 diz que o evento tem uma ou mais sessões; falta dizer se isso vale para o rascunho.
- **Opções:** A) rascunho pode ter zero sessões; publicar exige pelo menos uma; até 100 sessões por evento; duas sessões do mesmo evento não podem ter o mesmo local e o mesmo início; conflito de agenda do local com outros eventos **não** é validado; B) A com validação de conflito de agenda do local; C) sem limite máximo.
- **Recomendação:** A (o número 100 é sugestão). Conflito de agenda do local exigiria regra entre agregados sem ganho de aprendizado.

### Grupo F — Lote e preço

#### OQ-Dominio-29 [negócio] A que o lote pertence?
- **Contexto:** o glossário diz "faixa de preço de um setor" (`docs/domain/glossary.md:14`), sem dizer se é o setor da sessão ou do evento.
- **Opções:** A) ao setor de uma sessão: cada sessão tem os próprios lotes; B) ao setor no nível do evento: mesmos lotes e preços em todas as sessões, com quantidades por sessão; C) ao evento inteiro: um preço único para todos os setores.
- **Recomendação:** A. Bate com o agregado de inventário por sessão + setor (`CLAUDE.md:44`). Se cadastrar lote sessão a sessão pesar, o back-office pode oferecer "copiar lotes de outra sessão" sem mudar o modelo.

#### OQ-Dominio-30 [negócio] Como funciona a virada de lote?
- **Contexto:** o glossário fala em "por período ou até esgotar" e o overview lista "virada por data ou por esgotamento" como candidata não confirmada (`docs/architecture/overview.md:109`). O roadmap cita lotes nas Fases 2 e 5 (`docs/roadmap.md:13,16`). Esgotamento depende de vendas, que só existem a partir da Fase 4/5 (R-D3).
- **Opções:** A) **sequencial**: os lotes têm ordem; o 1º começa numa data de início de vendas; cada lote fica vigente até esgotar a quantidade **ou** chegar a sua data de fim, o que vier primeiro; aí o seguinte fica vigente na hora; B) **janelas independentes**: cada lote tem início e fim próprios; vigente é o de menor ordem cuja janela contém o momento atual e que não esgotou; se um lote esgota antes do fim, pode haver intervalo sem venda até o próximo início; C) virada manual pelo produtor; D) A ou B, mas na Fase 2 só a virada por data existe; o esgotamento entra quando houver venda (Fase 4/5).
- **Recomendação:** A como regra de negócio, com a parte "esgotar" passando a ter efeito só quando houver venda (é o que a D deixa explícito). É o comportamento comum em plataformas brasileiras e não deixa intervalo sem venda.

#### OQ-Dominio-31 [negócio] Campos do lote.
- **Contexto:** depende da OQ-Dominio-30. Na opção A, só o primeiro lote precisa de data de início.
- **Opções:** A) nome (ex.: "1º lote"), ordem, preço, quantidade opcional, data de fim opcional; data de início de vendas só no 1º lote; B) todos os lotes com início e fim obrigatórios e quantidade opcional (combina com a OQ-Dominio-30 = B); C) quantidade obrigatória, sem datas.
- Sub-perguntas: "lote vigente" é **derivado** (calculado a partir das datas e, depois, das vendas) ou **gravado** por um evento como `BatchActivated`? Tamanho do nome do lote?
- **Recomendação:** A, com "lote vigente" derivado e nunca gravado pelo Catalog (a passagem do tempo não é command; ver R-D2). Nome com 1 a 50 caracteres (a confirmar).

#### OQ-Dominio-32 [negócio] Pode haver mais de um lote vigente no mesmo setor ao mesmo tempo?
- **Contexto:** algumas plataformas vendem "promocional" e "regular" em paralelo.
- **Opções:** A) não; no máximo um lote vigente por setor da sessão; B) sim.
- **Recomendação:** A. Lotes paralelos são, na prática, tipos de ingresso, que é outro conceito.

#### OQ-Dominio-33 [negócio] Como a quantidade dos lotes se relaciona com a capacidade do setor?
- **Opções:** A) todos os lotes, exceto o último, têm quantidade; o último fica com o restante da capacidade; a soma das quantidades informadas precisa ser menor que a capacidade; B) a soma das quantidades precisa ser igual à capacidade; C) livre; a capacidade do setor é o teto real e a quantidade do lote só dispara a virada.
- **Recomendação:** A. Garante que o setor inteiro é vendável sem exigir conta exata do produtor.

#### OQ-Dominio-34 [negócio] Quando um lote vira por data, os ingressos não vendidos dele passam para o próximo?
- **Contexto:** só tem efeito quando houver venda (Fase 4/5), mas muda o significado de "quantidade do lote".
- **Opções:** A) sim, a sobra passa para o próximo lote, ao preço do próximo; B) não, a sobra se perde (a capacidade vendável cai); C) adiar a decisão para a Fase 4/5.
- **Recomendação:** A. É o comportamento esperado pelo público (a capacidade do setor não diminui), e fechar agora deixa o contrato estável.

#### OQ-Dominio-35 [negócio] Em setor de assento marcado, o lote vale para qualquer assento?
- **Opções:** A) sim; o lote conta assentos vendidos no setor, qualquer que seja a posição; B) o lote é ligado a um subconjunto de filas/assentos (preço por região); C) setor marcado não tem lotes, só preço único.
- **Recomendação:** A. Preço por região se resolve criando setores diferentes.

#### OQ-Dominio-36 [negócio] Preço: moeda, precisão, mínimo, máximo e gratuidade.
- **Contexto:** dinheiro em ponto flutuante gera erro de arredondamento; a Fase 5 vai calcular meia (50%) e taxa sobre esse preço.
- **Opções:** A) só BRL, guardado em centavos inteiros, preço maior que zero, máximo sugerido de R$ 100.000,00; B) A, mas permitindo preço zero (ingresso gratuito); C) várias moedas.
- **Recomendação:** A. Ingresso gratuito tem regras próprias (checkout sem pagamento) que pertencem à Fase 5. O preço cadastrado é o da **inteira**. O máximo é sugestão.

#### OQ-Dominio-37 [negócio] O preço precisa crescer de um lote para o seguinte?
- **Opções:** A) não validar; B) o lote seguinte precisa ter preço maior ou igual ao anterior.
- **Recomendação:** A. Nenhuma fonte exige; a liberdade é do produtor.

#### OQ-Dominio-38 [negócio] Período de vendas da sessão.
- **Contexto:** sem venda na Fase 2, "vendas abertas" é só status exibido; a partir da Fase 5 decide se a compra é aceita.
- **Opções:** A) vendas começam no início do 1º lote e terminam no início da sessão (fixo); a data de fim de um lote não pode passar do início da sessão; B) o produtor define o fim das vendas (menor ou igual ao início da sessão); C) A + vendas só abrem depois da publicação, mesmo que o 1º lote tenha começado antes.
- **Recomendação:** C. A regra "publicar é o que expõe à venda" evita venda de evento ainda em rascunho.

#### OQ-Dominio-39 [negócio] Meia-entrada, cota legal, taxa de conveniência e limite por CPF ficam totalmente fora da Fase 2?
- **Contexto:** são da Fase 5 (`docs/roadmap.md:16`). A Lei 12.933/2013, regulamentada pelo Decreto 8.537/2015, assegura meia-entrada em 40% dos ingressos disponíveis de cada evento, e há entendimento (MP-CE) de que o percentual vale por setor. Parte disso pode virar configuração do Catalog (ex.: limite por CPF definido pelo produtor por evento).
- **Opções:** A) totalmente fora; nenhum campo agora; a Fase 5 decide onde a configuração vive; B) já criar os campos no Catalog, sem uso.
- **Recomendação:** A. Campo sem regra é suposição sobre a Fase 5.

### Grupo G — Ciclo de vida

#### OQ-Dominio-40 [negócio] Quais estados o evento tem?
- **Contexto:** "encerrado" depende só da passagem do tempo (R-D2).
- **Opções:** A) Rascunho → Publicado (→ Cancelado, se a OQ-Dominio-44 incluir); "encerrado" é **derivado** da data da última sessão, sem estado gravado; B) Rascunho, Publicado, Cancelado e Encerrado gravados, com a passagem para Encerrado feita por um scheduler (como a expiração de hold, `CLAUDE.md:48`); C) sem rascunho: o evento nasce publicado.
- **Recomendação:** A. Ensina a diferença entre fato de negócio (publicar, cancelar) e estado derivado do relógio.

#### OQ-Dominio-41 [negócio] O que é exigido para publicar?
- **Opções:** A) campos obrigatórios do evento preenchidos; pelo menos uma sessão futura; cada sessão com pelo menos um setor ativo; cada setor ativo com pelo menos um lote; B) só pelo menos uma sessão; C) nenhum pré-requisito.
- **Recomendação:** A. Garante que todo evento visível na vitrine é vendável (quando houver venda).

#### OQ-Dominio-42 [negócio] A publicação pode ser agendada?
- **Opções:** A) só imediata; B) agendada para data/hora (exige scheduler).
- **Recomendação:** A. O momento em que as vendas abrem já é controlado pelo 1º lote (OQ-Dominio-38).

#### OQ-Dominio-43 [negócio] Um evento publicado pode voltar a rascunho (despublicar)?
- **Opções:** A) não; depois de publicado, só cancelamento (se houver); B) sim, enquanto não houver venda (a partir da Fase 5, bloqueado com venda); C) sempre.
- **Recomendação:** A. Menos estados e nenhuma regra que dependa de venda.

#### OQ-Dominio-44 [negócio] Cancelar evento entra na Fase 2?
- **Contexto:** o cancelamento com consequências (reembolso, compradores) é da Fase 7 (`docs/roadmap.md:18`). Na Fase 2 seria só um estado.
- **Opções:** A) sim; o evento cancelado sai da vitrine e a página continua acessível com aviso "Cancelado"; B) sim; continua na vitrine com selo "Cancelado" até a data da última sessão; C) não; cancelamento entra na Fase 7.
- **Recomendação:** C. Na Fase 7 o cancelamento ganha os efeitos que o tornam interessante (evento compensatório). Para corrigir erros na Fase 2, há a exclusão de rascunho (OQ-Dominio-46).

#### OQ-Dominio-45 [negócio] Cancelar ou remarcar uma sessão individual entra na Fase 2?
- **Opções:** A) não; fica com a OQ-Dominio-44 (Fase 7); B) cancelar sessão entra; C) remarcar (mudar data/local de sessão publicada) entra.
- **Recomendação:** A.

#### OQ-Dominio-46 [negócio] O que pode ser excluído?
- **Opções:** A) evento em rascunho pode ser descartado (sai do write e dos read models); evento publicado nunca; sessão, setor e lote podem ser removidos enquanto o evento está em rascunho; local pode ser excluído se nenhuma sessão o usa; B) nada é excluído; C) tudo pode ser excluído.
- **Recomendação:** A. Permite corrigir erro de cadastro sem apagar histórico do que já foi público.

#### OQ-Dominio-47 [negócio] Quando o evento sai da vitrine e quando uma sessão some da página?
- **Opções:** A) a sessão some da página do evento (ou aparece como encerrada) quando começa; o evento sai da vitrine quando a última sessão começa; B) quando a última sessão termina (exige término, OQ-Dominio-26); C) nunca sai, só vai para o fim da ordenação.
- Sub-pergunta: a página de um evento encerrado continua acessível pela URL?
- **Recomendação:** A, com a página continuando acessível e mostrando "Evento encerrado".

### Grupo H — Edição depois da publicação

#### OQ-Dominio-48 [negócio] O que pode ser editado depois de publicar?
- **Contexto:** na Fase 2 não há venda, mas o Inventory (Fase 4) vai herdar o que for permitido agora (R-D5).
- **Opções:** A) tudo editável na Fase 2; as restrições entram na Fase 4/5, quando houver venda; B) restrições definitivas já: textos, imagem, categoria e classificação editáveis; sessões, setores ativos e lotes novos podem ser adicionados; **não** se altera data nem local de sessão publicada (seria remarcação, OQ-Dominio-45); **não** se desativa setor nem se altera layout ou capacidade; **não** se altera preço nem quantidade de lote já iniciado ou passado; lotes futuros são editáveis e removíveis; C) nada editável depois de publicar.
- **Recomendação:** B. As regras não dependem de venda, ficam estáveis quando o Inventory chegar e ainda permitem corrigir o que não afeta quem compraria.

#### OQ-Dominio-49 [negócio] Sessão adicionada a um evento já publicado nasce publicada?
- **Opções:** A) sim; ao ser adicionada a evento publicado, a sessão precisa já cumprir os pré-requisitos (setor ativo com lote) e aparece na hora; B) a sessão tem estado próprio (rascunho/publicada) e é publicada separadamente, com os mesmos pré-requisitos da OQ-Dominio-41.
- **Recomendação:** B. Permite montar a sessão aos poucos sem expor uma sessão incompleta.

### Grupo I — Vitrine e página do evento (regras de negócio)

#### OQ-Dominio-50 [negócio] O que entra na vitrine, em que ordem e com quais filtros?
- **Contexto:** `event_listing` serve "vitrine e busca" (`docs/architecture/overview.md:97`).
- **Opções:** A) eventos publicados com pelo menos uma sessão futura, ordenados pela próxima sessão; filtros por cidade e categoria; busca por texto no título; B) A sem filtros nem busca; C) A + filtro por período de datas.
- **Recomendação:** A. Filtro e busca simples exercitam índices no read model, que é o lado que escala.

#### OQ-Dominio-51 [negócio] Qual preço a vitrine mostra?
- **Opções:** A) "a partir de R$ X", com X = menor preço entre os lotes vigentes agora, em todas as sessões futuras e setores ativos; B) menor preço entre todos os lotes ainda não encerrados (vigentes ou futuros); C) não mostrar preço na vitrine.
- **Recomendação:** A, sem taxa de conveniência (Fase 5). Como "vigente agora" muda com o relógio (R-D2), o ReadSide precisa decidir como calcular.

#### OQ-Dominio-52 [negócio] O que a página do evento mostra de setores e lotes?
- **Contexto:** disponibilidade e "esgotado" são da Fase 4.
- **Opções:** A) por sessão e setor ativo, só o lote vigente (nome e preço); sem lote vigente, mostra "vendas a partir de dd/mm" ou "vendas encerradas"; B) todos os lotes com datas, preços e status (encerrado, vigente, próximo); C) só setores e preço vigente, sem nome do lote.
- **Recomendação:** A. É o que o comprador precisa; o histórico de lotes é informação do produtor.

### Grupo J — Modelagem (técnica, consequência das regras)

#### OQ-Dominio-53 [técnica] Qual é a fronteira dos agregados?
- **Contexto:** a invariante de publicação (OQ-Dominio-41) cruza evento, sessões, setores e lotes. O Catalog tem pouca disputa (`docs/architecture/overview.md:53`). Read-your-writes usa a versão do agregado (`CLAUDE.md:47`); a partition key é o ID do agregado (`CLAUDE.md:45`).
- **Opções:** A) dois agregados: `Venue` (com a planta) e `Event` (com sessões, setores da sessão e lotes); B) três: `Venue`, `Event`, `Session` (com setores e lotes); C) um agregado por entidade.
- **Recomendação:** A. A invariante de publicação fica dentro de um agregado, há uma versão só para o `min_version` da página do evento e todos os eventos de um evento caem na mesma partição, em ordem. O custo é o tamanho do agregado (R-D6), controlado pelos limites. A cópia da planta para a sessão (OQ-Dominio-13 = A) lê o `Venue` no PostgreSQL, dentro do mesmo contexto, sem ferir a regra 1. Decisão final com o Backend.

#### OQ-Dominio-54 [técnica] Commands e eventos orientados a tarefa ou CRUD?
- **Contexto:** o overview descreve o Catalog como "quase CRUD" (`docs/architecture/overview.md:53`), mas eventos como `EventPublished` carregam significado que o Inventory vai consumir.
- **Opções:** A) transições e mudanças com significado têm command e evento próprios (`PublishEvent`, `AddSession`, `AddBatch` ...), e campos descritivos são agrupados (`UpdateEventDetails`, `UpdateVenueDetails`); B) CRUD puro (`UpdateEvent` com o agregado inteiro, evento `EventUpdated`); C) um command por campo.
- **Recomendação:** A. Os consumidores sabem **o que** aconteceu sem comparar estados, e o formulário de texto continua simples. Payload completo ou só o que mudou: decisão do Backend e do ReadSide.

## Decisões

Preenchida pelo thread principal com as respostas do usuário.

- (nenhuma ainda)

## Fontes externas

- [Guia da meia-entrada, Procon Juiz de Fora](https://www.pjf.mg.gov.br/administracao_indireta/procon/material_grafico/cartilhas/arquivos/guia_meia_entrada.pdf)
- [MP do Ceará orienta organizadores do Fortal 2024 a garantir a meia-entrada](https://mpce.mp.br/mp-do-ceara-orienta-organizadores-do-fortal-2024-a-garantir-a-meia-entrada-no-evento/)
- [Parecer 12/2023 Procon-MG sobre pontos controvertidos da meia-entrada](https://www.mpmg.mp.br/data/files/72/97/11/F6/30E7F810DBE5E3F8760849A8/Parecer-Meia%20entrada-Parecer%2012-2023%20-%20Analise%20principais%20pontos%20controvertidos%20nas%20normas%20q%20regulam%20a%20meia-entrada-Procon-MG-08maio20.pdf)
