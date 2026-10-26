---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-26
status: proposta aprovada pelo usuário, revisada para coerência com a proposta de negócio (revisão 2)
---

# Catalog — Respostas às Open Questions técnicas (OQ-60 a OQ-97)

Proposta do `sdd-planner` para o Gate 1 da Fase 2, por delegação do usuário. O usuário aprovou esta proposta e a proposta de negócio (`SDD/WORK/2026-10-26-CatalogProposta-Negocio.md`, OQ-5 a OQ-59). **Em qualquer conflito, a de negócio prevalece.** Esta revisão 2 realinha todo o documento a ela; a revisão 1 tinha usado as recomendações do Research como premissa, e as diferenças estão listadas em "O que mudou na revisão 2", no fim.

O Research (`SDD/RESEARCH/2026-10-25-CatalogResearch.md`) não foi alterado; o registro das decisões nele é do thread principal.

Entradas lidas: `CLAUDE.md`, `.claude/napkin.md`, `docs/roadmap.md`, `docs/architecture/overview.md`, ADRs 0001 a 0009, `docs/domain/glossary.md`, o Research consolidado, as quatro parciais em `SDD/WORK/2026-10-25-CatalogResearch-*.md`, a proposta de negócio (inclusive "Conflitos e pontos de atenção" e "Reconciliação") e o código citado.

Decisões anteriores respeitadas: OQ-1 = A, OQ-2 = C, OQ-3 = A, OQ-4 = A (Research, seção Decisões).

## Base de negócio usada (proposta de negócio aprovada)

Só o que afeta as OQs técnicas. O texto completo e as fontes estão na proposta de negócio.

| Ref. | OQ de negócio | Regra aprovada |
|---|---|---|
| N-1 | OQ-5, OQ-6, OQ-7 | Um produtor seed, `organizerId = 0193a4f0-0000-7000-8000-000000000001`, sem nome; todo command roda em nome dele; posse validada só na Fase 3 |
| N-2 | OQ-8 | Seed de demonstração via commands pela API: 3 locais e 4 eventos, datas relativas ao dia da execução |
| N-3 | OQ-9, OQ-10, OQ-11 | Local é cadastro próprio com `organizerId`; campos `name`, `address`, `city`, `state` (27 UFs), `timeZone`; dados do local **sempre editáveis**; local **nunca é removido** na Fase 2 |
| N-4 | OQ-13 | Instantes ISO 8601 com offset na API e `timestamptz` no banco; fuso IANA no local (16 fusos brasileiros, padrão `America/Sao_Paulo`); a sessão **copia o fuso** do local ao ser agendada; exibição e entrada sempre no fuso da sessão |
| N-5 | OQ-14, OQ-15, OQ-16, OQ-17 | Planta no local; ao agendar, a sessão copia **todos** os setores da planta, com IDs novos; em rascunho, a sessão pode **remover** um setor (os lotes vão junto) e **adicionar** de novo um setor da planta que não esteja nela; sem flag ativo/inativo; setor-modelo não é editável (remove e adiciona); mudança na planta não afeta sessões existentes; nomes únicos sem diferenciar maiúsculas |
| N-6 | OQ-18, OQ-19 | Layout do setor marcado no Catalog: lista ordenada de filas (rótulo `A-Z0-9`, 1 a 3 caracteres, maiúsculo, único no setor; quantidade de assentos numerados de 1 a N); capacidade do setor marcado = soma das filas |
| N-7 | OQ-21, OQ-31, OQ-34 | Limites: 1 a 20 setores por planta; pista de 1 a 50.000; setor marcado com 1 a 50 filas e 1 a 100 assentos por fila; até 50 sessões por evento; 1 a 10 lotes por setor da sessão |
| N-8 | OQ-22 a OQ-25 | Evento com `title`, `description`, `category` (7 códigos), `ageRating` (`L`, `10` a `18`) obrigatórios na criação; `imageUrl` opcional (só `https://`) |
| N-9 | OQ-28, OQ-29, OQ-30, OQ-31 | Local é da sessão; sessão tem `startsAt` e `salesStartsAt`; `startsAt` futuro ao agendar e ao publicar; duas sessões do evento não repetem local + `startsAt` |
| N-10 | OQ-32 a OQ-41 | Lote pertence ao setor da sessão; virada sequencial (só por data tem efeito na Fase 2); lote com `name`, `priceCents` (1 a 10.000.000), `quantity?`, `endsAt?`, ordem de cadastro; sem início próprio (vem de `salesStartsAt` e do lote anterior); vendas abertas = sessão publicada e `salesStartsAt` ≤ agora < `startsAt` e existe lote vigente |
| N-11 | OQ-43, OQ-44, OQ-51 | Unidade publicável é a **sessão** (Rascunho → Publicada); **não existe `PublishEvent`**; o evento passa a Publicado quando a **primeira sessão é publicada**; "encerrado" é derivado do relógio |
| N-12 | OQ-46 a OQ-50 | Sem despublicar, cancelar ou remarcar. Exclusões: evento só em rascunho (descarte definitivo); sessão, setor da sessão e lote só com a sessão em rascunho; setor da planta sempre; local nunca. **Sessão publicada fica congelada.** Editáveis sempre: dados do evento e dados do local. **Sem edição de sessão, de lote nem de setor-modelo** |
| N-13 | OQ-52 a OQ-56 | Card por evento; vitrine com eventos que têm pelo menos uma sessão publicada ainda não iniciada; página pública mostra só sessões publicadas e só o lote vigente; área do produtor mostra todos os lotes com selo e o status da sessão; rascunho ou descartado dá 404 na rota pública |
| N-14 | OQ-57, OQ-58 | Busca por palavra no título; filtros cidade (texto livre normalizado: trim, minúsculas, sem acento) e categoria; ordenação fixa pela próxima sessão publicada não iniciada, desempate por título e por ID; paginação por offset, `pageSize` padrão 12 e máximo 48; lista de locais do produtor não pagina |

## Achados transversais (afetam várias OQs)

- **X-1 Colisão de nomes em `libs/contracts`.** O Research propunha `CatalogEvent` para o agregado e `CatalogEventSchema` para a união dos eventos de domínio, por analogia com `DiagnosticsEventSchema` (`libs/contracts/src/diagnostics/events.ts:18`). Resolvido na OQ-79.
- **X-2 A ordem do WAL não chega ao projector.** O Debezium publica em ordem de commit (um slot, uma task, `infra/debezium/register-connector.sh:21`), mas eventos de agregados diferentes caem em partições diferentes e o consumer não garante ordem entre partições (ADR 0004). No replay, a inversão é a regra. Referência entre agregados precisa ser comutativa no projector (OQ-62) e nunca tratada como lacuna (R-7).
- **X-3 Uma transação Mongo por evento atualiza todos os read models.** O projector já faz uma transação por evento (`apps/projector/src/projection/ping.projection.ts:38-40`). `event_detail`, `event_listing`, `organizer_events`, `venues` e `aggregate_versions` gravados na mesma transação: esperar a versão num documento garante que os outros já a refletem (OQ-68).
- **X-4 Reducer único + mapeadores.** O projector aplica cada evento do agregado Evento à árvore `event_detail` e deriva `event_listing` e `organizer_events` dessa árvore com funções puras, na mesma transação. Um só lugar interpreta cada evento; o replay é determinístico.
- **X-5 Descarte físico e `min_version`.** O descarte de evento em rascunho (N-12) apaga o documento, e uma espera por `min_version` sobre ele nunca terminaria. Lápide técnica na OQ-68. Como o local nunca é removido (N-3), não há lápide de local.
- **X-6 Estado do evento derivado da sessão.** Com N-11, o command `PublishSession` muda dois estados gravados (sessão → Publicada e, na primeira vez, evento → Publicado) e emite **um** evento de domínio, `SessionPublished` (OQ-63). Tanto o agregado quanto o projector derivam o estado do evento da regra "evento é Publicado se tem pelo menos uma sessão publicada".
- **X-7 Não foi possível medir o lag neste ambiente** (sem daemon Docker). A OQ-97 usa as evidências gravadas no repositório.

---

## Bloco T1 — Técnicas que dependiam de respostas de negócio

### OQ-60 Fronteira dos agregados

- **Base:** N-3, N-5, N-7, N-9, N-11, N-12.
- **Decisão:** **A**, dois agregados:
  - `Venue`: dados do local + planta de setores-modelo (`VenueSector`);
  - Evento (raiz): `Session` → `SessionSector` → `Batch` como entidades filhas.
  
  A versão é única na raiz de cada um. O handler de `ScheduleSession` e o de `AddSessionSector` leem o `Venue` no PostgreSQL, na mesma transação, para copiar planta e fuso. É leitura de outro agregado do mesmo contexto; só o Evento é alterado. A sessão guarda o `venueId` como referência ao local.
- **Justificativa:** agregado é a fronteira das invariantes verdadeiras e a unidade de concorrência (regra 4). Cinco invariantes aprovadas só se garantem sem lock se sessões, setores e lotes estiverem dentro do Evento:
  - publicar a sessão exige setor com lote e `startsAt` futuro (OQ-44);
  - o evento vira Publicado na primeira sessão publicada (N-11);
  - duas sessões não repetem local + início;
  - no máximo 50 sessões por evento;
  - descartar o evento só sem sessão publicada.

  A regra de Vernon de "agregados pequenos" cede quando a invariante é real e a disputa é praticamente nula (um produtor por evento, `docs/architecture/overview.md:53`). Lição de CQRS: no Catalog o agregado é grande e quase sem disputa; no Inventory (Fase 4) ele será pequeno (sessão + setor, `CLAUDE.md:44`) porque lá a disputa é o problema. Um agregado por evento também dá ordem total no Kafka (regra 5) e uma versão única para o `min_version` (regra 7).
- **Tamanho com os limites aprovados (N-7):** no pior caso, 50 sessões × 20 setores × 50 filas = 50.000 entradas de layout, guardadas em `jsonb` (OQ-72), e 50 × 20 × 10 = 10.000 lotes. É aceitável para carregar a cada command no volume de estudo.
- **Referências:** Vaughn Vernon, *Effective Aggregate Design*, partes I e II; resumo da InfoQ das quatro regras; Eventbrite (venue como objeto próprio, ticket classes como filhos do evento).
- **Riscos:** qualquer alteração em qualquer filha conflita com outra no mesmo evento (409). Com um produtor é raro, e a UI trata (OQ-64).
- **Confiança:** alta.

### OQ-61 Commands e eventos: estilo, payload e nomes

- **Base:** as 14 capacidades da proposta de negócio ("Modelo que resulta das propostas"), N-5, N-6, N-11, N-12.
- **Decisão:** **A + a**, com verbos que revelam intenção. São 14 commands, cada um com exatamente um evento:

| Agregado | Command | Evento | Permitido quando |
|---|---|---|---|
| Venue | `RegisterVenue` | `VenueRegistered` | sempre (o local nasce sem setores) |
| | `UpdateVenueDetails` | `VenueDetailsUpdated` | sempre (inclui o fuso) |
| | `AddVenueSector` | `VenueSectorAdded` | sempre |
| | `RemoveVenueSector` | `VenueSectorRemoved` | sempre (sessões não mudam) |
| Evento | `CreateEvent` | `EventCreated` | sempre (nasce Rascunho) |
| | `UpdateEventDetails` | `EventDetailsUpdated` | sempre (Rascunho ou Publicado) |
| | `DiscardEvent` | `EventDiscarded` | evento em Rascunho |
| | `ScheduleSession` | `SessionScheduled` | sempre (sessão nasce Rascunho; copia planta e fuso) |
| | `RemoveSession` | `SessionRemoved` | sessão em Rascunho |
| | `AddSessionSector` | `SessionSectorAdded` | sessão em Rascunho; setor da planta do local da sessão, ainda não presente nela |
| | `RemoveSessionSector` | `SessionSectorRemoved` | sessão em Rascunho (os lotes vão junto) |
| | `AddBatch` | `BatchAdded` | sessão em Rascunho |
| | `RemoveBatch` | `BatchRemoved` | sessão em Rascunho |
| | `PublishSession` | `SessionPublished` | sessão em Rascunho e completa (OQ-44) |

  Não existem: `PublishEvent`/`EventPublished`, `ActivateSessionSector`/`DeactivateSessionSector`, `UpdateSessionSchedule`, `UpdateBatch`, `UpdateVenueSector`, `RemoveVenue`/`VenueRemoved`.

  Payload (opção a): estado completo da entidade afetada + IDs dos pais.
  - `VenueRegistered`: `organizerId`, `name`, `address`, `city`, `state`, `timeZone`.
  - `VenueDetailsUpdated`: os mesmos cinco campos descritivos.
  - `VenueSectorAdded`: `venueSectorId`, `name`, `kind`, `position` e `capacity` (pista) ou `rows` (marcado).
  - `VenueSectorRemoved`: `venueSectorId`.
  - `EventCreated`: `organizerId`, `title`, `description`, `category`, `ageRating`, `imageUrl`.
  - `EventDetailsUpdated`: os mesmos cinco campos descritivos.
  - `EventDiscarded`: só os IDs do envelope.
  - `SessionScheduled`: `sessionId`, `venueId`, `startsAt`, `salesStartsAt`, `timeZone` (cópia do fuso do local) e a lista de setores copiados: `sessionSectorId`, `venueSectorId` de origem, `name`, `kind`, `position` e `capacity` ou `rows`. **Sem `active`.**
  - `SessionSectorAdded`: `sessionId` + um setor no mesmo formato.
  - `SessionSectorRemoved`: `sessionId`, `sessionSectorId`.
  - `BatchAdded`: `sessionId`, `sessionSectorId`, `batchId`, `name`, `priceCents`, `quantity` (ou `null`), `endsAt` (ou `null`), `position`.
  - `BatchRemoved`: `sessionId`, `sessionSectorId`, `batchId`.
  - `SessionRemoved`: `sessionId`.
  - `SessionPublished`: retrato completo da sessão publicada (`sessionId`, `venueId`, `timeZone`, `startsAt`, `salesStartsAt`, setores com tipo e capacidade ou filas, lotes com ordem, preço, quantidade e `endsAt`). É o gatilho para o Inventory criar os agregados sessão + setor na Fase 4 sem consultar o Catalog (regra 10).

  Nenhum evento carrega nome nem endereço do local (OQ-62).
- **Justificativa:** o outbox publica fatos com significado (ADR 0003), não diffs. Commands por intenção deixam a regra no agregado e tornam cada evento um contrato estável. O estado completo evita `V2` cedo (R-25). O retrato da sessão em `SessionPublished` é redundante com os eventos anteriores, mas é isso que permite a um consumidor novo (Inventory) começar pela publicação sem reconstruir o rascunho. É event-carried state transfer no ponto em que o dado congela (N-12), o caso em que ele é barato e seguro.
- **Referências:** Martin Fowler, *What do you mean by "Event-Driven"?* (notificação x event-carried state transfer).
- **Riscos:** o retrato completo aumenta o tamanho de `SessionPublished` (no pior caso, 20 setores × 50 filas + 200 lotes), na casa das dezenas de KB, longe do limite de 1 MB do Kafka.
- **Confiança:** alta.

### OQ-62 Dados do local no read side

- **Base:** N-3 (local sempre editável, nunca removido), N-4 (fuso copiado na sessão), N-5 (planta copiada), N-13 (card mostra nome + cidade/UF; página mostra nome e endereço).
- **Decisão:** **A, lookup no projector + merge comutativo**, usando como lookup o read model de locais do produtor (`venues`, OQ-69):
  1. `SessionScheduled` traz só `venueId` como referência ao local; o fuso e os setores vêm copiados, porque são do Evento (N-4, N-5).
  2. Ao projetar `SessionScheduled`, o projector procura o local em `venues`. Se achar, copia para a sessão do `event_detail` os campos exibidos (`name`, `address`, `city`, `state`, `cityKey` normalizado) e a `venueVersion`. Se o local ainda não foi projetado, grava `venue: { id, pending: true }`.
  3. Ao projetar `VenueRegistered` ou `VenueDetailsUpdated`, o projector atualiza `venues` e, na mesma transação, todos os `event_detail` com sessão nesse `venueId`. Só altera onde `venueVersion` for menor que a versão recebida (guarda contra ordem invertida) e recalcula os resumos (X-4). O fuso **não** se propaga: a sessão mantém o seu (N-4).
  4. Eventos de planta (`VenueSectorAdded`, `VenueSectorRemoved`) só atualizam `venues`. Não há fan-out para eventos, porque as sessões têm cópia (N-5).
  5. Queries públicas não mostram sessão com `venue.pending`.
- **Justificativa:** o negócio aprovou que a edição do local aparece nas sessões existentes (OQ-50). Com o local editável, carregar o nome no evento de sessão (opção B) **também** exigiria um lookup com a última versão do local: um `VenueDetailsUpdated` pode ser projetado antes de um `SessionScheduled` mais antigo (X-2). Então B teria a complexidade de A e ainda acoplaria o payload às telas. A mantém uma fonte do dado do local e eventos sem viés de tela. O resultado independe da ordem de chegada, que é o que faz o replay dar o mesmo documento (regra 6). O projector lê o próprio store, nunca o PostgreSQL.
- **Referências:** Oskar Dudycz, *Dealing with race conditions in EDA using read models* e *How to scale projections in the event-driven systems*; Fowler sobre ECST.
- **Riscos:** o fan-out (`updateMany` com `arrayFilters`) cresce com o número de eventos que usam o local, o que é aceitável no estudo (R-15) e exige índice em `sessions.venueId` (OQ-86). O teste de comutatividade da OQ-87 é obrigatório.
- **Confiança:** alta (o negócio confirmou o local editável).

### OQ-63 Semântica da versão num agregado com filhas

- **Base:** OQ-60 = A, N-11.
- **Decisão:** **A**:
  - `version` só na raiz;
  - todo command que altera qualquer filha faz o `UPDATE ... WHERE id = :id AND version = :expected` da raiz, mesmo sem mudar coluna da raiz;
  - cada evento soma 1 e carrega a versão resultante; criação gera a versão 1;
  - **um evento de domínio por command, sem exceção.**
  
  `PublishSession` grava `status = 'published'` na sessão e, se for a primeira sessão publicada, `status = 'published'` na raiz, no mesmo UPDATE condicional. Emite só `SessionPublished` (X-6). O projector deriva o estado do evento pela mesma regra: Publicado se houver pelo menos uma sessão publicada.
- **Justificativa:** a versão é do agregado porque o agregado é a unidade de consistência (regra 4). O bump da raiz impede duas transações de alterarem filhas diferentes sem conflito (R-22). Um evento por command mantém a versão devolvida igual à versão do único evento, que é o par exato do `min_version` (regra 7). Também mantém o `decideProjection` da Fase 1 (`apps/projector/src/projection/sequence.ts:4-14`) válido: `aggregateVersion = atual + 1`.
- **Riscos:** um consumidor futuro que queira o fato "evento publicado" deriva da primeira `SessionPublished` do agregado. Se isso incomodar na Fase 4, um campo `firstPublication: true` no payload é acréscimo compatível.
- **Confiança:** alta.

### OQ-64 Versão esperada vinda do cliente

- **Base:** N-12 (só dados do evento e do local são editáveis).
- **Decisão:** **A**:
  - `UpdateEventDetails` e `UpdateVenueDetails`, os únicos commands de edição, exigem `expectedVersion` no corpo; divergência → 409 `CONCURRENCY_CONFLICT`;
  - os outros 12 commands usam a versão lida no servidor, como o Ping (`apps/write-service/src/diagnostics/application/increment-ping.handler.ts:12-17`);
  - a versão enviada pelo formulário é a do read model que o preencheu.
- **Justificativa:** o risco que a versão do cliente resolve é o *lost update*: sobrescrever campos com base num estado que já mudou. Só esses dois commands sobrescrevem campos; os demais adicionam, removem ou publicam, e o agregado reavalia as regras sobre o estado atual. Um formulário preenchido com projeção atrasada recebe 409 e recarrega (R-32). É o exemplo mais visível de "o read model serve para exibir; o write model é a verdade" (`docs/architecture/overview.md:11`). A versão vai no corpo, e não em `If-Match`, porque o hash da idempotência cobre método, caminho e corpo (`apps/write-service/src/shared/idempotency/request-hash.ts:3-5`).
- **Referências:** RFC 9110 (409 Conflict; `If-Match` + 412 como alternativa padrão, descartada pelo motivo acima).
- **Riscos:** a versão é do agregado inteiro. Editar o título depois de outra aba adicionar um lote dá 409. É o custo do agregado grande, e vale como lição.
- **Confiança:** alta.

### OQ-65 Resposta do command que cria entidade filha

- **Decisão:** **A**: `EntityCommandAcceptedSchema = CommandAcceptedSchema.extend({ entityId })`, devolvido por `ScheduleSession` (`entityId` = sessão), `AddSessionSector` (setor da sessão), `AddBatch` (lote) e `AddVenueSector` (setor da planta). `id` + `version` são sempre do agregado. Os IDs dos setores copiados em `ScheduleSession` não voltam na resposta; o web os lê do read model depois de alcançar a versão.
- **Justificativa:** regra 2 (só ack, ID e versão) e regra 7 (o par `id` + `version` é o que o `min_version` compara). O ID da filha é gerado na aplicação (decisão OQ-17 da Fase 1).
- **Confiança:** alta.

### OQ-66 Um ou dois read models para vitrine e página

- **Base:** N-11, N-13.
- **Decisão:** **B**, gravados na mesma transação (X-3):
  - `event_listing`: um documento por evento com pelo menos uma sessão publicada, com resumo indexado e só as sessões publicadas;
  - `event_detail`: um documento por evento em qualquer estado, árvore completa, lido por `_id`.
  
  `event_detail` é o resultado do reducer; `event_listing` é derivado dele por função pura (X-4). O documento entra no `event_listing` no primeiro `SessionPublished` e nunca sai na Fase 2 (sessão publicada não é removida). A visibilidade por tempo ("sessão não iniciada") é filtro da query (OQ-70). `GetEvent` público lê `event_detail`: devolve 404 se o evento não tem sessão publicada ou é lápide, filtra sessões em rascunho e calcula o lote vigente na query.
- **Justificativa:** "um documento por tela" (ADR 0005), e o mesmo evento de domínio alimentando read models com formatos diferentes, que é a lição de desnormalização da fase (`docs/roadmap.md:13`). Os índices da vitrine ficam sem o peso da árvore e sem rascunhos.
- **Riscos:** registrar `event_detail` e os demais read models no `docs/architecture/overview.md` na implementação (hoje só `event_listing` aparece, `:97`).
- **Confiança:** alta.

### OQ-67 Controle de sequência com documentos compostos

- **Decisão:** **A**: coleção `aggregate_versions` (`_id = aggregateId`, `aggregateType`, `version`) lida e atualizada na mesma transação do evento. Regra genérica:
  - `aggregateVersion <= atual` → já aplicado (registra o `eventId` e commita);
  - `aggregateVersion = atual + 1` → aplica;
  - maior → lacuna (aborta, não commita, `exit(1)`, como na Fase 1).
  
  Sem registro, só a versão 1 é aplicável, o que substitui o caso especial de `PingIncremented` (`sequence.ts:11`). `processed_events` continua como dedupe por `eventId` (regra 6). Os documentos guardam `version` só para o `min_version`: `event_detail` guarda a do Evento e `venues` a do `Venue`.
- **Justificativa:** separa "o que já foi aplicado de cada agregado" (infra do projector) de "o que a tela mostra". Funciona com um agregado alimentando vários documentos e com o fan-out do local. Mantém a lacuna como falha barulhenta dentro de um agregado (ADR 0009), onde a ordem é garantida. A referência entre agregados nunca passa por esse gate (OQ-62), o que fecha o crash loop (R-7).
- **Riscos:** o replay apaga `aggregate_versions` junto com `processed_events` (OQ-85).
- **Confiança:** alta.

### OQ-68 Qual versão o `min_version` compara, e como o web espera

- **Base:** OQ-60 = A, N-3, N-12.
- **Decisão:** **A + C + i**, com lápide só para o descarte de evento:
  - leituras do Evento (`GET /api/catalog/events/:eventId` e `GET /api/catalog/organizer/events/:eventId`) comparam com a versão do agregado Evento;
  - a leitura do local (`GET /api/catalog/organizer/venues/:venueId`) compara com a versão do `Venue`. O read-your-writes de `UpdateVenueDetails` é garantido nela; a página do evento reflete a mudança em seguida, pelo fan-out na mesma transação (X-3);
  - listas (`ListEvents`, `ListOrganizerEvents`, `ListVenues`) não aceitam `min_version`. O web espera na leitura por ID e depois invalida a lista; pela X-3, quando o documento alcança a versão, as listas já a refletem;
  - **lápide de `EventDiscarded`:** o `event_detail` vira `{ _id, version, status: 'discarded' }`, sem dados de negócio, e o evento sai de `organizer_events` (e de `event_listing`, por segurança, embora um rascunho nunca esteja lá). As duas leituras por ID respondem 404; com `min_version` alcançado, respondem 404 com `minVersionReached: true`, e o web volta para "Meus eventos". Nenhuma query devolve dado da lápide.
- **Justificativa:** com o agregado único, um número de versão basta para tudo o que é do evento (regra 7). Sem a lápide, a espera depois de um descarte nunca termina, porque "documento não existe" não se distingue de "projeção ainda não chegou" (X-5). O local nunca é removido (N-3), então não precisa de lápide.
- **Riscos:** a lápide é um documento técnico que fica no read model; o comportamento visível é o do negócio ("sai das listas e de todos os read models"; a página pública dá 404).
- **Confiança:** alta.

### OQ-69 Read models e queries do produtor

- **Base:** OQ-1 = A, OQ-4 = A, N-13, N-14.
- **Decisão:** **B**, com quatro read models + duas coleções internas (`aggregate_versions`, `processed_events`):

| Read model | Tela | Query | Notas |
|---|---|---|---|
| `event_listing` | vitrine | `ListEvents` | só eventos com sessão publicada; offset, 12 por padrão, máximo 48 |
| `event_detail` | página pública e gestão do evento | `GetEvent` (público) e `GetOrganizerEvent` | mesmo documento, dois mapeamentos; gestão mostra sessões em rascunho, todos os lotes com selo (Encerrado, Vigente, Em breve) e status da sessão |
| `organizer_events` | "Meus eventos" | `ListOrganizerEvents` | todos os estados exceto descartado; do mais recente para o mais antigo (`occurredAt` de `EventCreated`, desempate por ID); offset, 12 por padrão, máximo 48 |
| `venues` | lista e detalhe dos locais, select do formulário de sessão | `ListVenues` (sem paginação) e `GetVenue` (com `min_version`) | inclui a planta; também é o lookup da OQ-62 |

  As queries do produtor filtram pelo produtor seed (OQ-73) e ficam sob `/api/catalog/organizer/` (OQ-80).
- **Justificativa:** um read model por tela sem duplicar o reducer. O que muda entre as telas é o formato do resumo e o mapeamento da query. A vitrine pública fica sem rascunhos no índice (R-28) e a área do produtor lê do read side com read-your-writes, como qualquer cliente.
- **Riscos:** `GetEvent` e `GetOrganizerEvent` leem o mesmo documento; um bug no filtro público pode expor sessão em rascunho. Mitigação: testes de query com documento que contém sessão em rascunho e lápide.
- **Confiança:** alta.

### OQ-70 Estados que dependem do relógio

- **Base:** N-10, N-11, N-13, N-14.
- **Decisão:** **A**: derivados no read-service, na query, com o `now` do servidor. O documento guarda só fatos e datas: status gravados, `startsAt`, `salesStartsAt`, ordem, `quantity` e `endsAt` dos lotes. Funções puras `(documento, now) → view` ficam em `apps/read-service/src/catalog/`, com um provider `Clock` injetável para os testes. Regras implementadas, todas da proposta de negócio:
  - **lote vigente** do setor: o primeiro lote, na ordem, cujo `endsAt` ainda não passou, desde que as vendas tenham começado. Na Fase 2 só a data encerra lote, porque não há venda (OQ-33 itens 3 a 6);
  - **vendas abertas** da sessão: sessão publicada e `salesStartsAt` ≤ now < `startsAt` e existe lote vigente;
  - **sessão encerrada**: now ≥ `startsAt`. **Evento encerrado**: todas as sessões publicadas encerradas;
  - **selo do lote** (gestão): Encerrado, Vigente ou Em breve;
  - **"a partir de R$ X"**: menor `priceCents` entre os lotes vigentes das sessões publicadas não iniciadas com vendas abertas. Sem lote vigente, "Vendas a partir de" (o menor `salesStartsAt` futuro) ou "Vendas encerradas";
  - **visibilidade na vitrine**: pelo menos uma sessão publicada com `startsAt` > now (`$elemMatch` com índice multikey);
  - **ordenação da vitrine**: agregação com `$addFields` (menor `startsAt` futuro entre as sessões publicadas), depois `$sort` por esse campo, título e `_id`. O título usa collation `pt` para ordenar acentos corretamente.
  
  As views de evento incluem `asOf` (o `now` usado no cálculo).
- **Justificativa:** o tempo não é um command (Research, Objetivo; princípio P3 do negócio). Gravar esses estados no projector congelaria o valor e tornaria o replay dependente do dia em que roda (regra 6, R-10). Uma fonte de "agora" mantém o web sem regra de negócio. O scheduler (C) criaria eventos que não são fatos; ele serve à expiração de hold (regra 8) porque ali o tempo muda a verdade do write.
- **Riscos:**
  - a ordenação por próxima sessão não usa índice; o custo cresce com os eventos visíveis, aceitável no estudo e um gancho de medição para a Fase 9;
  - offset com ordenação que muda com o tempo pode repetir ou pular um card entre dois "Carregar mais" (risco aceito pelo negócio);
  - na Fase 5, o Ordering decide o lote vigente no write side, com esgotamento, sobre o PostgreSQL; a extração para um módulo puro compartilhado se avalia lá.
- **Confiança:** alta.

### OQ-71 Busca textual

- **Base:** N-14 (palavra inteira no título, sem prefixo).
- **Decisão:** **A**: índice de texto `$text` em `event_listing.title`, com `default_language: 'portuguese'`. A busca é `GET /api/catalog/events?q=...`; o primeiro estágio é `$match: { $text: ... }`, combinado com os filtros de cidade e categoria e com a ordenação da OQ-70.
- **Justificativa:** nativo, sem serviço novo, ensina índice de texto no read model e roda por GET sem exceção no Nginx (ADR 0002). Índice de texto v3 ignora caixa e acento; não acha prefixo, exatamente como o negócio aprovou.
- **Referências:** manual do MongoDB, *Text Index Restrictions* ("A collection can have at most one text index"); *Specify the Default Language for a Text Index*.
- **Riscos:** os testes de integração do read-service criam o mesmo índice (OQ-86).
- **Confiança:** alta.

### OQ-72 Tabelas, chaves e persistência das filhas

- **Base:** OQ-60 = A, N-3, N-5, N-6, N-7, N-9, N-10, N-12.
- **Decisão:** **A + a + x**:
  - **Tabelas** (schema `public`): `catalog_venues`, `catalog_venue_sectors`, `catalog_events`, `catalog_sessions`, `catalog_session_sectors`, `catalog_batches`. `version` só em `catalog_venues` e `catalog_events`. `status` (`draft` | `published`) em `catalog_events` e `catalog_sessions`.
  - **FKs dentro do agregado:** `ON DELETE CASCADE`. Apagar a raiz apaga o agregado (descarte de evento), e apagar sessão ou setor da sessão apaga os filhos (N-12).
  - **FK entre agregados:** `catalog_sessions.venue_id → catalog_venues` com `ON DELETE RESTRICT`. O local não é removido na Fase 2; a FK é a última defesa se algum dia for.
  - `catalog_session_sectors.venue_sector_id` guarda o setor de origem **sem FK**: o setor da planta pode ser removido a qualquer momento (N-5), e a cópia é referência por identidade.
  - `organizer_id uuid` sem FK (Identity é outro contexto, regra 10).
  - **Uniques como última defesa das regras do agregado:**
    - `catalog_sessions (event_id, venue_id, starts_at)`;
    - `catalog_session_sectors (session_id, venue_sector_id)`;
    - `catalog_session_sectors (session_id, lower(name))`;
    - `catalog_venue_sectors (venue_id, lower(name))`;
    - `catalog_batches (session_sector_id, lower(name))`;
    - `catalog_batches (session_sector_id, position)`.
  - **Colunas:**
    - layout do setor marcado como `rows jsonb` (value object validado pelo schema Zod), imutável;
    - `capacity integer` só para pista;
    - `position integer` para ordem de setores e lotes; novo lote recebe `max + 1`, e remoção deixa lacuna (a ordem relativa se mantém);
    - dinheiro `price_cents integer`; instantes `timestamptz` (`starts_at`, `sales_starts_at`, `ends_at`); fuso `text` (IANA) em `catalog_venues` e em `catalog_sessions`.
  - **IDs:** cada setor copiado para a sessão ganha um uuid v7 novo; o Inventory (Fase 4) referencia `(sessionId, sessionSectorId)`.
  - **Repositório:** UPDATE condicional na raiz; filhos com `INSERT ... ON CONFLICT (id) DO UPDATE` e `DELETE` dos removidos, na mesma transação.
  - **Limites** (N-7) nos schemas Zod e no agregado: 1 a 20 setores por planta (o local pode existir sem setores, mas `ScheduleSession` exige pelo menos 1); pista de 1 a 50.000; 1 a 50 filas; 1 a 100 assentos por fila; até 50 sessões por evento; 1 a 10 lotes por setor.
- **Justificativa:** segue a convenção `diagnostics_pings` (`apps/write-service/src/diagnostics/infrastructure/ping.entity.ts:3`) e o SQL explícito do ADR 0009. CASCADE x RESTRICT expressa no banco a diferença entre "parte do agregado" e "referência a outro agregado". As uniques espelham a unique `(session_id, seat_id)` da regra 4: o agregado decide, o banco é a última defesa. Layout em `jsonb` porque o Catalog nunca consulta fila a fila.
- **Riscos:** migration gerada exige `nest build` antes (napkin; R-23). O `truncateAll` do teste de integração (`apps/write-service/test/integration/setup.ts:39`) precisa das tabelas novas.
- **Confiança:** alta.

### OQ-73 Produtor seed no handler e no web

- **Base:** N-1.
- **Decisão:** **A + a**:
  - `SEED_ORGANIZER_ID` no `config.ts` do write-service (Zod, default `0193a4f0-0000-7000-8000-000000000001`);
  - provider `CurrentOrganizer` em `apps/write-service/src/shared/actor/`, que o controller usa para preencher o command;
  - o web não envia nada;
  - o read-service lê a mesma variável, com o mesmo default, para filtrar as leituras do produtor; o valor é definido uma vez no `docker-compose.yaml` para os dois serviços.
- **Justificativa:** um ponto único a trocar na Fase 3 (o provider passa a ler o usuário do JWT), sem mudar o corpo dos commands nem as rotas.
- **Riscos:** o default repetido nos dois `config.ts` pode divergir. Mitigação: valor no compose e um E2E que cria evento e o acha em "Meus eventos".
- **Confiança:** alta.

### OQ-74 Entrada de preço

- **Base:** N-10 (`priceCents` de 1 a 10.000.000).
- **Decisão:** **A**:
  - `Input` de texto com `inputMode="decimal"` em `Input Group` com prefixo "R$";
  - schema de formulário que converte `"1.234,56"` em `123456` e termina no schema do contrato com `.pipe`;
  - a conversão é feita sobre a string (`,` decimal, `.` milhar, no máximo 2 casas), nunca com `parseFloat(x) * 100`: em ponto flutuante, `0.29 * 100` dá `28.999999999999996`;
  - exibição com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
  
  O mesmo formulário de lote tem `quantity` (inteiro opcional) e `endsAt` (opcional, OQ-75).
- **Justificativa:** sem dependência nova; um ponto testável; o contrato continua sendo a validação final no web e no write-service.
- **Riscos:** `Intl` em pt-BR põe espaço não separável depois de "R$"; testes usam a mesma função de formatação.
- **Confiança:** alta.

### OQ-75 Entrada de data/hora

- **Base:** N-4 (instantes na API; entrada e exibição no fuso da sessão), N-9, N-10.
- **Decisão:** **A**: `<input type="datetime-local">` em três campos:
  - `startsAt` e `salesStartsAt`, no formulário de sessão;
  - `endsAt`, no formulário de lote.
  
  Os campos de sessão são interpretados no fuso do local escolhido (lido de `venues`); o de lote, no fuso copiado da sessão. A conversão "hora local no fuso X → instante ISO com offset" (e a inversa, para exibir) fica num módulo puro em `libs/contracts`, usado pelo web, pelo seed e pelos testes. Implementação com `Intl.DateTimeFormat`, sem biblioteca nova. O `Intl` não converte no sentido inverso numa chamada só: o algoritmo estima o instante tratando a hora digitada como UTC, mede o offset do fuso nesse instante com `timeZoneName: 'longOffset'`, corrige e repete uma vez. A API recebe e devolve só instantes, como o negócio aprovou.
- **Justificativa:** acessível, sem dependência, simples no Playwright. O fuso só entra na borda de entrada e de exibição; regras e ordenação usam instantes (OQ-30). `Temporal` resolveria nativamente, mas não está no Node 24 do projeto nem no Safari estável; fica como troca futura do módulo.
- **Referências:** anúncio do Chrome 144 (Temporal estável); InfoQ sobre o Temporal no Chrome.
- **Riscos:** algoritmo de fuso feito à mão pode errar em transição de horário de verão. O Brasil não tem horário de verão desde 2019, mas os testes devem cobrir `America/Sao_Paulo`, `America/Manaus`, `America/Noronha`, `America/Rio_Branco` e uma data de 2018 com horário de verão. Ver também a OQ-98.
- **Confiança:** média-alta.

### OQ-76 Mecanismo do seed de demonstração

- **Base:** N-2 (conteúdo da OQ-8 do negócio).
- **Decisão:** **A**: script sob demanda `pnpm seed:catalog`, em `e2e/src/seed/` (reaproveita o helper HTTP e os schemas do contrato), que monta o conjunto da OQ-8 de negócio: 3 locais com planta, 4 eventos, sessões publicadas e em rascunho, o Balcão removido da sessão de São Paulo de "Riso Solto". Cada chamada usa `Idempotency-Key` e espera a projeção com `min_version` antes do passo seguinte; os IDs dos setores copiados só existem no read model depois de `SessionScheduled`. Datas relativas ao momento da execução, convertidas no fuso de cada local com o módulo da OQ-75. Antes de começar, o script consulta `GET /api/catalog/organizer/events` e não faz nada se algum dos quatro títulos de demonstração já existir.
- **Justificativa:** o seed passa pelo pipeline inteiro como um cliente real (regras 3 e 6) e exercita o read-your-writes. Ler o read side para decidir se semeia é aceitável porque quem decide é um cliente, não o write-service (regra 1 intacta). Não roda sozinho, então não duplica depois das 24 h de retenção das chaves.
- **Riscos:** a checagem por título é heurística. Os E2E não dependem do seed (OQ-95).
- **Confiança:** alta.

---

## Bloco T2 — Técnicas independentes

### OQ-77 Infraestrutura compartilhada do write-service

- **Decisão:** **A + a**:
  - `SharedModule` (não global) com `TypeOrmModule.forFeature([OutboxEntity, IdempotencyKeyEntity])`, `TransactionContext`, `OutboxWriter`, `IdempotencyService` e `IdempotencyCleanupJob` (o cron só existe aqui);
  - o módulo exporta os três primeiros; `DiagnosticsModule` e `CatalogModule` o importam;
  - `OutboxWriter.append(boundedContext, envelopes)` recebe envelopes já montados e validados;
  - cada contexto tem um mapper (`ping-event.mapper.ts`, `catalog-event.mapper.ts`) que converte o evento de domínio no envelope `V1` com o schema do contrato.
- **Justificativa:** hoje o writer conhece as classes do Ping (`apps/write-service/src/shared/outbox/outbox-writer.ts:39-65`) e o contexto é fixo (`:27`). Com o mapper por contexto, o outbox vira infraestrutura pura e o contrato continua validado antes de gravar (regra 3, ADR 0009).
- **Riscos:** a refatoração toca o smoke test; fazer numa etapa isolada, validada com integração, E2E e replay do diagnóstico antes do Catalog (R-12).
- **Confiança:** alta.

### OQ-78 Tópico `catalog.events`

- **Decisão:** **A**: `catalog.events` com 3 partições e `retention.ms=-1`, criado com `--if-not-exists` em `infra/kafka/create-topics.sh` (mesmo padrão da linha 7).
- **Justificativa:** auto-create desligado (`docker-compose.yaml:81`). Sem o tópico, o primeiro evento do Catalog derruba a task do Debezium e para todos os eventos (R-1). Retenção infinita permite o replay (regra 6). O conector não muda (`register-connector.sh:44-45`).
- **Confiança:** alta.

### OQ-79 Organização de `libs/contracts` e nome do agregado Evento

- **Decisão:** a proposta de arquivos do Research mais a opção **A**, com uma correção:
  - arquivos: `catalog/constants.ts`, `catalog/http.ts`, `catalog/events.ts`; `CommandAcceptedSchema` e `EntityCommandAcceptedSchema` em `http/command-accepted.ts`, reexportados pelo barrel;
  - opção A: `CatalogEvent` para o agregado no TS, `aggregateType: 'Event'`, eventos `EventCreated`, `SessionPublished` etc.;
  - correção (X-1): a união dos eventos de domínio do Catalog se chama `CatalogDomainEventSchema` / `CatalogDomainEvent`, como o write-service já faz com o Ping (`PingDomainEvent`, `apps/write-service/src/diagnostics/domain/ping.events.ts:21`). `DiagnosticsEventSchema` não é renomeado.
  
  Entram também em `libs/contracts`:
  - o módulo de fuso (OQ-75);
  - a normalização de cidade (`normalizeCityKey`: trim, minúsculas, sem acento via NFD), usada pelo projector para gravar `cityKey` e pelo read-service para normalizar o filtro, para que os dois lados nunca divirjam;
  - as listas fechadas (UF, fusos, categorias, classificações).
- **Justificativa:** `Event` como classe sombreia o global do Node e do DOM (R-21). Com `DomainEvent` no nome da união, quem lê o projector sabe que está tratando eventos de domínio, e não o agregado.
- **Confiança:** alta.

### OQ-80 Rotas, status HTTP e `Idempotency-Key`

- **Decisão:** **A + a + i**:
  - **Commands do `Venue`** (write-service):
    - `POST /api/catalog/venues` → `RegisterVenue`;
    - `PATCH /api/catalog/venues/:venueId` → `UpdateVenueDetails`;
    - `POST /api/catalog/venues/:venueId/sectors` → `AddVenueSector`;
    - `DELETE /api/catalog/venues/:venueId/sectors/:venueSectorId` → `RemoveVenueSector`.
  - **Commands do Evento** (write-service):
    - `POST /api/catalog/events` → `CreateEvent`;
    - `PATCH /api/catalog/events/:eventId` → `UpdateEventDetails`;
    - `DELETE /api/catalog/events/:eventId` → `DiscardEvent`;
    - `POST /api/catalog/events/:eventId/sessions` → `ScheduleSession`;
    - `DELETE /api/catalog/events/:eventId/sessions/:sessionId` → `RemoveSession`;
    - `POST /api/catalog/events/:eventId/sessions/:sessionId/publish` → `PublishSession`;
    - `POST /api/catalog/events/:eventId/sessions/:sessionId/sectors` (corpo `{ venueSectorId }`) → `AddSessionSector`;
    - `DELETE /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId` → `RemoveSessionSector`;
    - `POST /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId/batches` → `AddBatch`;
    - `DELETE .../batches/:batchId` → `RemoveBatch`.
  - **Queries públicas** (read-service): `GET /api/catalog/events` (`q`, `city`, `category`, `page`, `pageSize`) e `GET /api/catalog/events/:eventId` (`min_version`).
  - **Queries do produtor** (read-service):
    - `GET /api/catalog/organizer/events` (`page`, `pageSize`);
    - `GET /api/catalog/organizer/events/:eventId` (`min_version`);
    - `GET /api/catalog/organizer/venues` (sem paginação);
    - `GET /api/catalog/organizer/venues/:venueId` (`min_version`).
  - **Status e idempotência:** todos os commands respondem 202 com `CommandAccepted` ou `EntityCommandAccepted` (OQ-65). `Idempotency-Key` é obrigatória em todos, inclusive `PATCH` e `DELETE`, com o mecanismo e as 24 h da Fase 1. `DELETE` não tem corpo; só os dois `PATCH` levam `expectedVersion` (OQ-64).
- **Justificativa:** cada intenção fica visível na URL, e as rotas aninhadas carregam o ID do agregado. O prefixo `/organizer/` separa as leituras por público (o mesmo agregado tem read models diferentes para comprador e produtor); na Fase 3, o guard de papel se aplica a um prefixo. O Nginx já manda `PATCH`/`DELETE` para o write-service (`infra/nginx/nginx.prod.conf:7-14`). 202 em tudo mantém o `IdempotencyService` (`idempotency.service.ts:50`) sem mudança (R-39); idempotência opcional violaria a regra 9.
- **Riscos:** `sendCommand` do web e o helper `api` do E2E precisam de `PATCH` e `DELETE` (R-38, OQ-91).
- **Confiança:** alta.

### OQ-81 Identificador nas URLs

- **Decisão:** **A**, UUID do agregado (e das filhas) na API e no web.
- **Justificativa:** slug exigiria regra de negócio nova (geração, unicidade). O UUID v7 já é o ID do Kafka (regra 5).
- **Confiança:** alta.

### OQ-82 Contrato de erro e exibição no formulário

- **Decisão:** **A**:
  - regra de negócio violada: `BusinessRuleViolationError(code, message)` → 422 `{ statusCode, error, message, code }`;
  - recurso do caminho inexistente (agregado ou filha) → 404;
  - referência inexistente no corpo (`venueId`, `venueSectorId`) → 422 com `code`;
  - conflito de versão → 409.
  
  `code` também nos erros que já existem (`CONCURRENCY_CONFLICT`, `AGGREGATE_NOT_FOUND`, `IDEMPOTENCY_KEY_MISMATCH`) e no 400 de validação (`VALIDATION_FAILED`). A lista de códigos é uma constante em `libs/contracts`, com os schemas `ValidationErrorResponse` e `DomainErrorResponse`. Cada regra das OQ-15, 17, 19, 21, 30, 31, 34, 36, 41, 44 e 49 de negócio tem um código estável em inglês (ex.: `SESSION_NOT_DRAFT`, `SESSION_START_IN_PAST`, `SESSION_WITHOUT_SECTOR`, `SECTOR_WITHOUT_BATCH`, `BATCH_ENDED`, `DUPLICATE_SESSION`, `SESSION_LIMIT_REACHED`, `BATCH_LIMIT_REACHED`, `BATCH_QUANTITY_EXCEEDS_CAPACITY`, `PREVIOUS_BATCH_UNBOUNDED`, `VENUE_WITHOUT_SECTORS`, `VENUE_NOT_FOUND`, `EVENT_NOT_DRAFT`); a lista completa sai no Spec. O web mapeia `issues[].path` para `setError` e `code` para mensagem PT-BR; o resto vira alerta no topo do formulário.
- **Justificativa:** 422 já é usado para chave reutilizada (`apps/write-service/src/shared/http/domain-error.filter.ts:9-22`). Com a violação de regra também em 422, só o `code` distingue os casos no web, então ele precisa existir em todos. 409 fica só para concorrência (regra 4). Problem Details (RFC 9457) trocaria o formato de todos os erros da Fase 1 sem aprendizado de CQRS.
- **Referências:** RFC 9110 (422 Unprocessable Content; 409 Conflict).
- **Riscos:** códigos são contrato público; renomear depois quebra o web.
- **Confiança:** alta.

### OQ-83 Topologia de consumo do projector

- **Decisão:** **A**: um grupo `projector` assinando `diagnostics.events` e `catalog.events`. Um registro `tópico → { schema, dispatcher }` escolhe o parse e os handlers por `message.topic`. Evento desconhecido num tópico conhecido continua derrubando o processo.
- **Justificativa:** hoje todo evento passa por `DiagnosticsEventSchema.parse` (`apps/projector/src/kafka/kafka-consumer.service.ts:35`), o que derrubaria o projector no primeiro evento do Catalog (R-5). O tópico novo, sem offset no grupo, começa do início (`fromBeginning: true`, `confluent-event-consumer.ts:13`). Isolamento por consumidor é da Fase 6.
- **Riscos:** falha numa projeção para as duas (R-26), aceito.
- **Confiança:** alta.

### OQ-84 Migrar a projeção do Ping para o mecanismo genérico

- **Decisão:** **A**: o Ping passa a usar `aggregate_versions` e o executor genérico; `pings` mantém `version` para o `min_version`.
- **Justificativa:** um mecanismo só é o que as próximas fases herdam (ADR 0009); integração, E2E e replay do diagnóstico provam a refatoração.
- **Riscos:** num volume existente, `aggregate_versions` começa vazio e o próximo `PingIncremented` de um ping antigo seria lacuna. Mitigação documentada no Plan: rodar `pnpm replay` uma vez depois da migração.
- **Confiança:** alta.

### OQ-85 Escopo do replay

- **Decisão:** **A**: replay total.
  1. Para o projector.
  2. `deleteMany` em `pings`, `event_listing`, `event_detail`, `organizer_events`, `venues`, `aggregate_versions` e `processed_events`.
  3. Reseta o grupo com `--all-topics`.
  4. Sobe o projector.
  
  A lista de coleções vive numa constante única em `libs/contracts` (`READ_STORE_COLLECTIONS`), usada pelo replay e pelos testes.
- **Justificativa:** hoje o replay apaga duas coleções e reseta um tópico fixos (`e2e/src/replay/replay.ts:13-16`, `:21-35`). Replay por projeção é da Fase 8.
- **Confiança:** alta.

### OQ-86 Onde criar coleções e índices

- **Decisão:** **A**: no `infra/mongo/init-replica-set.js`, com `createIndex` idempotente. Índices:
  - `event_listing`:
    - texto em `title` (`default_language: 'portuguese'`);
    - `category`;
    - `sessions.cityKey`, `sessions.startsAt` e `sessions.venueId` (multikey);
  - `event_detail`: `sessions.venueId` (para o fan-out da OQ-62);
  - `organizer_events`: `{ organizerId: 1, createdAt: -1, _id: -1 }`;
  - `venues`: `{ organizerId: 1, name: 1 }`.
  
  Os testes de integração do projector e do read-service criam os índices de que dependem, com comentário apontando para o script.
- **Justificativa:** mantém o padrão atual (`init-replica-set.js:21-27`), garante índices antes de qualquer app e independe do replay (`deleteMany` preserva índices). O índice é do read side.
- **Riscos:** as definições no script e nos testes podem divergir; o E2E contra a stack real pega a divergência do `$text`, que falha sem índice.
- **Confiança:** alta.

### OQ-87 Cobertura E2E e de replay do read side

- **Decisão:** **A**, em três frentes.
  - **E2E de API pelo gateway:**
    - cadastro completo (local com planta, evento, sessão, remoção e adição de setor na sessão, lotes, publicação da sessão);
    - vitrine e página com `min_version`;
    - evento sem sessão publicada fora da vitrine e com 404 na página pública;
    - descarte de rascunho com 404 e `minVersionReached: true`;
    - edição do local refletida na página do evento;
    - mensagem em `catalog.events` com key = ID do agregado.
  - **Replay total:** compara `event_listing`, `event_detail`, `organizer_events` e `venues` antes e depois, ignorando `processedAt`.
  - **Integração do projector:** aplica os mesmos eventos em ordens diferentes entre agregados e confere documentos idênticos. Ordens cobertas: local antes e depois da sessão; `VenueDetailsUpdated` antes do `SessionScheduled`.
- **Justificativa:** a comutatividade só é provável onde a ordem é escolhida pelo teste; o replay prova a regra 6 com documentos compostos. Arrays ordenados por chave estável (`position`, `startsAt` + ID) e datas vindas de `occurredAt` são pré-requisito do `toEqual` (R-9).
- **Confiança:** alta.

### OQ-88 Vitrine, diagnóstico e layout global

- **Decisão:** **A**:
  - vitrine em `/`;
  - diagnóstico em `/diagnostico`, com link discreto no rodapé;
  - layout raiz com header (logo → vitrine, link "Área do produtor") e `errorElement` com página 404;
  - `apps/web/e2e/diagnostics.spec.ts:4` atualizado no mesmo passo.
- **Justificativa:** a vitrine é a tela principal; o diagnóstico continua como smoke test (ADR 0009) sem ocupar a raiz (R-11).
- **Confiança:** alta.

### OQ-89 Idioma das URLs do web

- **Decisão:** **A**, PT-BR: `/eventos/:eventId`, `/produtor/eventos`, `/produtor/eventos/novo`, `/produtor/eventos/:eventId`, `/produtor/locais`, `/produtor/locais/novo`, `/produtor/locais/:venueId`, `/diagnostico`. Arquivos e componentes em inglês; rotas da API em inglês.
- **Justificativa:** URL é texto visível de um site pt-BR; a convenção de inglês vale para código.
- **Confiança:** alta.

### OQ-90 Loaders do React Router x TanStack Query

- **Decisão:** **A**: só TanStack Query nos componentes; o router cuida de rotas, layout e `errorElement`.
- **Justificativa:** um cache só, que é o "read model do cliente" (ADR 0008).
- **Confiança:** alta.

### OQ-91 Extrair cliente HTTP e read-your-writes

- **Decisão:** **A**, no web e no read-service:
  - `apps/web/src/api/http.ts`: `ApiError`, `readBody`, `sendCommand(method, url, key, body)` para `POST`/`PATCH`/`DELETE`, `getJson`;
  - `apps/web/src/lib/read-your-writes.ts`: hook genérico de espera por versão, com o limite da OQ-97 como opção;
  - `mutation-retry.ts` movido para `src/api/`;
  - no read-service, um helper `pollUntil` comum para `GetPing` e as leituras do Catalog.
  
  O diagnóstico passa a usar tudo isso com o mesmo comportamento e os testes atuais passando.
- **Justificativa:** uma implementação do padrão de consistência eventual, testada uma vez (R-4).
- **Riscos:** as mensagens específicas (ex.: "Ping não encontrado", `apps/web/src/api/diagnostics.ts:77`) ficam em cada feature, mapeadas por `code`.
- **Confiança:** alta.

### OQ-92 Ciclo de vida da `Idempotency-Key`

- **Decisão:** **B**: uma chave por intenção.
  - gerada quando o formulário abre;
  - reusada em todo reenvio com o mesmo payload;
  - trocada depois de sucesso ou quando o payload a enviar difere do último enviado;
  - os retries automáticos da mutation reusam a chave, como hoje.
  
  Nos botões sem formulário ("Publicar sessão", "Remover"), a chave nasce no clique e é reusada no reenvio da mesma ação.
- **Justificativa:** fecha o buraco do reenvio manual depois de resposta perdida (R-31) e evita o 422 de chave reutilizada quando o usuário corrige um campo (regra 9 no cliente). Como o command que falha desfaz também a chave (ADR 0009), reenviar o mesmo payload depois de um 422 de regra reexecuta normalmente.
- **Referências:** Stripe (retry com a mesma chave e os mesmos parâmetros; chave reusada com parâmetros diferentes é erro).
- **Riscos:** a comparação de payloads exige serialização estável; usar o objeto já validado pelo schema.
- **Confiança:** alta.

### OQ-93 Componentes shadcn e feedback de sucesso

- **Decisão:** **A + a**: `field`, `input-group`, `textarea`, `native-select`, `badge`, `skeleton`, `empty`, `spinner`, `alert`, `separator`, `breadcrumb`, instalados de uma vez numa trilha só, antes das telas.
  - `badge` serve aos selos de lote e de status;
  - `native-select` serve a categoria, classificação, UF, fuso, local e setor da planta;
  - sem `pagination`, porque a UI é "carregar mais";
  - sucesso com status inline em `aria-live`, sem toast.
- **Justificativa:** o CLI altera `src/index.css` e `package.json` (napkin; R-37). Status inline deixa visível a etapa "aguardando projeção", que é a lição.
- **Riscos:** conferir na instalação que os nomes existem no registry da versão `shadcn@4.22.1` fixada.
- **Confiança:** alta.

### OQ-94 Simulação da API nos testes de componente

- **Decisão:** **A**: `vi.stubGlobal('fetch')` com um helper `createFakeApi` em `apps/web/src/test/` que roteia por método + caminho, guarda estado e simula projeção atrasada.
- **Justificativa:** sem dependência nova; o contrato HTTP continua exercitado; segue `apps/web/src/pages/diagnostics-page.test.tsx:12-57`.
- **Confiança:** alta.

### OQ-95 Dados e host dos testes Playwright e E2E

- **Decisão:** **A + a**:
  - o spec do produtor cria tudo pela UI com nomes únicos;
  - os specs de vitrine e página semeiam pela API (`request` do Playwright, com `Idempotency-Key`), com datas futuras relativas, e acham o evento pela busca ou pela URL;
  - nenhuma asserção de contagem total; nenhum teste depende do seed de demonstração;
  - default `http://127.0.0.1:8080`, com override por `E2E_BASE_URL`, em `apps/web/playwright.config.ts:7` e `e2e/src/support/env.ts:3`.
- **Justificativa:** a stack de produção acumula dados (R-35) e o replay depende deles; `localhost` resolve para `::1` no host Windows com WSL mirrored (napkin; R-34).
- **Riscos:** o sufixo único precisa ser uma palavra para o `$text` (ex.: `e2e` + hex sem hífen).
- **Confiança:** alta.

### OQ-96 Seletores de teste e acessibilidade

- **Decisão:** **A**: `getByRole`/`getByLabelText` no RTL e no Playwright; `data-testid` só onde não há papel. Checklist no Plan:
  - labels;
  - `aria-invalid`;
  - `FieldError` anunciado;
  - foco no primeiro campo inválido;
  - `aria-live` no status;
  - um `h1` por página.
- **Justificativa:** consultas por papel testam o que o usuário e a tecnologia assistiva percebem.
- **Riscos:** sem checagem automática; `@axe-core/playwright` fica como evolução opcional.
- **Confiança:** alta.

---

## Bloco T3 — Valor do usuário

### OQ-97 O que a UI faz quando a projeção demora

- **Decisão:** **B com limite de 10 s** (`PROJECTION_WAIT_BUDGET_MS = 10_000`), contado no relógio de parede a partir do 202 do command.
  - Até o limite, a tela mostra "Aguardando projeção" (`aria-live`) e refaz a leitura com `min_version`: o servidor espera até 3 s por requisição, e o cliente refaz 250 ms depois.
  - Ao estourar, o polling para e a tela mostra "Salvo. Os dados podem demorar a aparecer." com o botão "Atualizar", que abre uma nova janela de 10 s.
  - Vale para todas as telas do Catalog. O diagnóstico continua sem limite (opção do hook), porque a função dele é medir o lag real.
- **Dados que sustentam o número:**
  - o E2E de API lê um ping recém-criado com `min_version=1` e exige `minVersionReached: true` numa única requisição (`e2e/src/api/queries.e2e.test.ts:18-20`). Como o servidor espera no máximo 3 s (`apps/read-service/src/diagnostics/get-ping.handler.ts:7`), todo E2E que passou mediu lag write → read **abaixo de 3 s**;
  - o Playwright espera "sincronizado" três vezes com o timeout padrão de `expect` (5 s, sem override em `apps/web/playwright.config.ts`; `apps/web/e2e/diagnostics.spec.ts:10`, `:16`, `:26`). O ciclo completo na UI ficou **abaixo de 5 s**;
  - pela configuração, o caminho normal é de centenas de milissegundos. O conector não define `poll.interval.ms` (`infra/debezium/register-connector.sh:19-46`) e usa o default do Debezium (500 ms segundo fontes secundárias; não confirmado na página oficial). Somam-se o produce, o fetch do consumer e uma transação Mongo por evento;
  - o diagnóstico mostra a latência por ação (`apps/web/src/features/diagnostics/ping-panel.tsx:39`), mas os valores não ficam gravados no repositório (X-7);
  - no caso anormal (projector caído), o grupo pode levar até o `session.timeout.ms` padrão (45 s desde o Kafka 3.0) para reatribuir as partições; o replay espera até 30 s pelo grupo vazio (`e2e/src/replay/replay.ts:5`, `:9`). Nenhum limite razoável de UI esconde isso, e não deve esconder.
- **Justificativa:**
  - 10 s é mais de três janelas de espera do servidor e mais de dez vezes o caminho normal, então só estoura quando algo está fora do normal;
  - é também o limite clássico de atenção de Nielsen;
  - a mensagem ensina a lição do `docs/architecture/overview.md:11`: o command foi aceito e a verdade está no write; só a leitura atrasou.
- **Referências:** Jakob Nielsen, *Response Times: The 3 Important Limits*; KIP-735; TanStack Query v5, guia de polling.
- **Riscos:**
  - com a aba em segundo plano o TanStack Query pausa o polling, mas o relógio continua; ao voltar, se o limite passou, a tela mostra "Atualizar";
  - os specs Playwright do Catalog que esperam a projeção usam timeout de `expect` de 15 s, acima do limite.
- **Confiança:** média-alta (aprovado pelo usuário; sem medição nova).

---

## Open Questions novas surgidas no realinhamento

### OQ-98 [técnica, com efeito de negócio] O que acontece se o fuso do local muda entre abrir e enviar o formulário de sessão?

- **Contexto:** a API recebe instantes (N-4), então o web converte `startsAt` e `salesStartsAt` com o fuso do local que leu de `venues`. O write-service, ao agendar, copia para a sessão o fuso **atual** do local no PostgreSQL (N-4). Se o fuso do local for editado entre a abertura do formulário e o envio (outra aba, ou read model atrasado depois de um `UpdateVenueDetails`), o instante foi calculado com o fuso antigo e a sessão guarda o novo. O horário exibido fica diferente do digitado (ex.: 20:00 digitado em `America/Sao_Paulo`, exibido 19:00 em `America/Manaus`). A chance é pequena (um produtor), mas o resultado é um horário errado e silencioso. Nenhuma das duas propostas trata o caso, e a escolha envolve o comportamento em caso de erro, que é regra de negócio.
- **Opções:**
  - A) o corpo de `ScheduleSession` inclui o `timeZone` com que o formulário converteu as datas; se for diferente do fuso atual do local, o command é rejeitado com 422 `VENUE_TIME_ZONE_CHANGED`, e o web recarrega o local e pede para conferir os horários;
  - B) o corpo inclui o `timeZone` usado e o write-service grava **esse** fuso na sessão, aceitando uma sessão com fuso diferente do atual do local;
  - C) a API de `ScheduleSession` passa a receber data e hora locais (sem offset) e o write-service converte com o fuso atual do local. Elimina o problema, mas muda o formato de entrada aprovado na OQ-13 ("instante com offset na API") só para esse command;
  - D) aceitar o risco e documentar.
- **Recomendação:** A. Mantém o contrato em instantes, deixa a decisão no write side sobre o PostgreSQL (regra 1) e transforma um erro silencioso num erro explícito, com o mesmo padrão de "recarregar e conferir" do 409.

## Tabela final de decisões (OQ-60 a OQ-97)

| OQ | Decisão |
|---|---|
| OQ-60 | Dois agregados: `Venue` (local + planta) e Evento com sessões, setores da sessão e lotes como filhas, versão única na raiz. |
| OQ-61 | 14 commands por intenção, um evento cada, com estado completo da entidade: `RegisterVenue`, `UpdateVenueDetails`, `AddVenueSector`, `RemoveVenueSector`, `CreateEvent`, `UpdateEventDetails`, `DiscardEvent`, `ScheduleSession`, `RemoveSession`, `AddSessionSector`, `RemoveSessionSector`, `AddBatch`, `RemoveBatch`, `PublishSession`; `SessionScheduled` traz `salesStartsAt` e `timeZone` e não traz `active`; `SessionPublished` traz o retrato completo da sessão. |
| OQ-62 | Lookup em `venues` + merge comutativo com guarda de `venueVersion`; edição de dados do local propaga por fan-out (exceto fuso); planta não propaga; sem lápide de local. |
| OQ-63 | Versão só na raiz, bump da raiz em toda alteração de filha, um evento por command; a primeira `SessionPublished` também torna o evento Publicado, sem `EventPublished`. |
| OQ-64 | Só `UpdateEventDetails` e `UpdateVenueDetails` exigem `expectedVersion` no corpo (409 se divergir); os demais usam a versão lida no servidor. |
| OQ-65 | `EntityCommandAccepted` `{ id, version, entityId }` em `ScheduleSession`, `AddSessionSector`, `AddBatch` e `AddVenueSector`. |
| OQ-66 | `event_listing` (eventos com sessão publicada) + `event_detail` (árvore completa), gravados juntos; o resumo é derivado do detalhe. |
| OQ-67 | Coleção `aggregate_versions` como gate de sequência por agregado, mais `processed_events` para dedupe por `eventId`. |
| OQ-68 | `min_version` compara com a versão do Evento nas leituras do evento e do `Venue` na leitura do local; listas sem `min_version`; lápide técnica só em `EventDiscarded`. |
| OQ-69 | Read models `event_listing`, `event_detail` (público e gestão), `organizer_events` e `venues` (sem paginação, também lookup), leituras do produtor sob `/api/catalog/organizer/`. |
| OQ-70 | Lote vigente, vendas abertas, encerrado, preço "a partir de", visibilidade e ordenação calculados no read-service com o `now` do servidor, `asOf` na view, ordenação por agregação. |
| OQ-71 | `$text` em português só no título do `event_listing`, via `GET` com `q`. |
| OQ-72 | Seis tabelas `catalog_*`, CASCADE dentro do agregado, RESTRICT sessão → local, uniques como última defesa, layout em `jsonb`, limites de negócio nos schemas e no agregado. |
| OQ-73 | `SEED_ORGANIZER_ID` (default `0193a4f0-0000-7000-8000-000000000001`) em write-service e read-service, provider `CurrentOrganizer`, web não envia dono. |
| OQ-74 | Campo texto com "R$", conversão para centavos sobre a string, faixa 1 a 10.000.000. |
| OQ-75 | `datetime-local` em `startsAt`, `salesStartsAt` e `endsAt`, convertido no fuso do local/sessão por módulo puro com `Intl` em `libs/contracts`; API só com instantes. |
| OQ-76 | Script `pnpm seed:catalog` pela API com `Idempotency-Key` e `min_version`, conteúdo da OQ-8 de negócio, checagem prévia por título. |
| OQ-77 | `SharedModule` importado explicitamente e `OutboxWriter` genérico com mapper por contexto. |
| OQ-78 | Tópico `catalog.events` com 3 partições e retenção infinita no `create-topics.sh`. |
| OQ-79 | Arquivos `catalog/*` em `libs/contracts`, agregado `CatalogEvent`, união `CatalogDomainEventSchema`, `CommandAccepted` em `http/`, normalização de cidade e módulo de fuso compartilhados. |
| OQ-80 | Rotas por intenção sob `/api/catalog/` (mapa na OQ-80), `PATCH` para edição, `DELETE` para remoção, 202 em todos, `Idempotency-Key` obrigatória. |
| OQ-81 | UUID nas URLs da API e do web. |
| OQ-82 | 422 com `code` estável para regra de negócio, 404 para recurso do caminho, 409 só para versão, `code` em todos os erros e schemas em `libs/contracts`. |
| OQ-83 | Um grupo `projector` com registro tópico → schema e handlers. |
| OQ-84 | Ping migrado para o mecanismo genérico, com `pnpm replay` uma vez depois da migração. |
| OQ-85 | Replay total com lista única de coleções e reset `--all-topics`. |
| OQ-86 | Coleções e índices no `mongo-init` (texto, categoria, `cityKey`, `startsAt`, `venueId`, organizador), testes criam os que usam. |
| OQ-87 | E2E de API completo, replay comparando os quatro read models e teste de integração de comutatividade. |
| OQ-88 | Vitrine em `/`, diagnóstico em `/diagnostico`, layout raiz com header e 404. |
| OQ-89 | URLs do web em PT-BR. |
| OQ-90 | Só TanStack Query para dados; router sem loaders. |
| OQ-91 | Cliente HTTP, retry e read-your-writes extraídos para módulos compartilhados, diagnóstico migrado sem mudar comportamento. |
| OQ-92 | Uma `Idempotency-Key` por intenção, trocada no sucesso ou quando o payload muda. |
| OQ-93 | Componentes shadcn instalados de uma vez numa trilha (sem `pagination`), sucesso inline com `aria-live`. |
| OQ-94 | `vi.stubGlobal('fetch')` com helper `createFakeApi`. |
| OQ-95 | Dados de teste próprios com nomes únicos, sem contagem total, host `127.0.0.1` com override. |
| OQ-96 | Seletores por papel e label, `data-testid` só sem papel, checklist de acessibilidade no Plan. |
| OQ-97 | Limite de 10 s de espera pela projeção, depois "Salvo. Os dados podem demorar a aparecer." com "Atualizar"; diagnóstico sem limite. |

## O que mudou na revisão 2

- **Base:** as premissas P-1 a P-20 (recomendações do Research) foram trocadas pela proposta de negócio aprovada (N-1 a N-14).
- **OQ-61:** sem `PublishEvent`, `Activate/DeactivateSessionSector`, `UpdateSessionSchedule`, `UpdateBatch`, `UpdateVenueSector` e `RemoveVenue`. Entram `AddSessionSector` e `RemoveSessionSector`; ficam 14 commands. `SessionScheduled` ganha `salesStartsAt` e perde `active`; `SessionPublished` passa a ter o retrato completo da sessão.
- **Pergunta resolvida:** "publicar o evento publica quais sessões?" deixou de existir. Publica-se a sessão, e o evento vira Publicado na primeira (OQ-63, X-6).
- **OQ-62:** sem lápide de local; o fuso não propaga; a planta não propaga; a cidade normalizada entra no fan-out.
- **OQ-64:** `expectedVersion` só nos dois commands de edição.
- **OQ-66 a OQ-69:** listing por "tem sessão publicada"; lápide só para `EventDiscarded`; paginação 12/48; `venues` sem paginação.
- **OQ-70:** regras de lote com `salesStartsAt`, desempate da ordenação por título (collation `pt`) e ID.
- **OQ-72:** limites de negócio (20 setores, pista 50.000, 50 × 100 assentos, 50 sessões, 10 lotes); novas uniques; `venue_sector_id` sem FK.
- **Demais itens:**
  - OQ-73: valor do UUID seed;
  - OQ-74: faixa de preço;
  - OQ-75: três campos de data;
  - OQ-76: conteúdo do seed;
  - OQ-80: rotas;
  - OQ-82: códigos;
  - OQ-86: índices;
  - OQ-87: casos de E2E.
- **OQ-97:** mantida em 10 s.
- **Nova:** OQ-98.

## Fontes externas

- [Vaughn Vernon, Effective Aggregate Design, parte I](https://dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)
- [Vaughn Vernon, Effective Aggregate Design, parte II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)
- [InfoQ, resumo das regras de agregados](https://www.infoq.com/news/2014/12/aggregates-ddd)
- [Martin Fowler, What do you mean by "Event-Driven"?](https://www.martinfowler.com/articles/201701-event-driven.html)
- [Oskar Dudycz, Dealing with race conditions in EDA using read models](https://event-driven.io/en/dealing_with_race_conditions_in_eda_using_read_models/)
- [Oskar Dudycz, How to scale projections in the event-driven systems](https://event-driven.io/pl/how_to_scale_projections_in_the_event_driven_systems)
- [Eventbrite, Getting Information on Events](https://www.eventbrite.co/platform/docs/events)
- [MongoDB, Text Index Restrictions](https://www.mongodb.com/docs/v7.0/core/indexes/index-types/index-text/text-index-restrictions/)
- [MongoDB 8.0, idioma de índice de texto](https://www.mongodb.com/docs/v8.0/core/indexes/index-types/index-text/specify-language-text-index/use-any-field-to-specify-language/)
- [TanStack Query v5, polling](https://tanstack.com/query/v5/docs/framework/react/guides/polling.md)
- [KIP-735, session timeout padrão do consumer](https://cwiki.apache.org/confluence/spaces/KAFKA/pages/177051635/KIP-735+Increase+default+consumer+session+timeout)
- [RisingWave, Debezium performance tuning](https://risingwave.com/blog/debezium-performance-tuning-throughput-latency/)
- [Jakob Nielsen, Time Scales of UX](https://jakobnielsenphd.substack.com/p/time-scale-ux?open=false) e [reprodução dos três limites de tempo de resposta](https://www.jmduke.com/posts/response-times.md)
- [Stripe, erros e retry com a mesma chave](https://docs.stripe.com/error-low-level) e [changelog 2015-09-03](https://docs.stripe.com/changelog/2015-09-03/reuse-idempotency-tokens-alter-error)
- [Guia sobre 409 x 422 (Auth0 Community)](https://community.auth0.com/t/demystifying-identity-http-status-codes-how-to-fix-409-conflict-422-unprocessable-entity-errors/202572)
- [Chrome 144 (Temporal estável)](https://developer.chrome.com/blog/new-in-chrome-144) e [InfoQ sobre o Temporal no Chrome](https://www.infoq.com/news/2026/02/chrome-temporal-date-api)

O acesso direto às páginas (WebFetch) foi bloqueado pelo proxy deste ambiente; as referências vieram da busca na web e não foram lidas na íntegra.
