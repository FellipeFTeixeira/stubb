---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-26
status: implemented
research: SDD/RESEARCH/2026-10-25-CatalogResearch.md
plan: SDD/SPEC/2026-10-26-CatalogPlan.md
---

# Catalog — Spec

O QUÊ será entregue na Fase 2. As decisões citadas (`OQ-n`) estão na seção Decisões do Research, cujos anexos normativos são `SDD/WORK/2026-10-26-CatalogProposta-Negocio.md` (OQ-5 a OQ-59) e `SDD/WORK/2026-10-26-CatalogProposta-Tecnico.md` (revisão 2, OQ-60 a OQ-98). Onde os anexos divergem, vale o de negócio.

## Resumo

O produtor seed cadastra locais com planta de setores, cria eventos, agenda sessões que copiam a planta e o fuso do local, monta setores e lotes e publica cada sessão. O write-service grava tudo no PostgreSQL com outbox; o projector monta quatro read models no MongoDB; o read-service serve a vitrine, a página do evento e a área do produtor; o web mostra tudo com read-your-writes. É o primeiro fluxo real command → evento de domínio → projeção desnormalizada do Stubb.

## Requisitos

- R-1 Contratos públicos do Catalog em `libs/contracts`: constantes, schemas Zod de request, 14 eventos `V1`, views de leitura, códigos e schemas de erro, módulo de fuso e normalização de texto (OQ-61, OQ-79, OQ-82, OQ-75).
- R-2 Infraestrutura compartilhada do write-service usável por dois contextos: `SharedModule`, `OutboxWriter` genérico com mapper por contexto, erros com `code` (OQ-77, OQ-82).
- R-3 Módulo `catalog` no write-service com os agregados `Venue` e `CatalogEvent`, 14 commands, seis tabelas e migration (OQ-60, OQ-61, OQ-72).
- R-4 Tópico `catalog.events`; o conector Debezium não muda (OQ-78).
- R-5 Projector com mecanismo genérico de sequência por agregado (`aggregate_versions`), registro por tópico, Ping migrado e projeções do Catalog (OQ-67, OQ-83, OQ-84).
- R-6 Read models `event_listing`, `event_detail`, `organizer_events` e `venues`, com coleções e índices criados no `mongo-init` (OQ-66, OQ-69, OQ-86).
- R-7 Read-service com `ListEvents`, `GetEvent`, `ListOrganizerEvents`, `GetOrganizerEvent`, `ListVenues` e `GetVenue`; estados do relógio derivados na query (OQ-68 a OQ-71).
- R-8 Web com vitrine em `/`, página do evento, área do produtor (locais, meus eventos, gestão do evento), página 404 e diagnóstico em `/diagnostico` (OQ-1, OQ-3, OQ-88, OQ-89).
- R-9 Cliente HTTP, retry, read-your-writes com limite de 10 s e `Idempotency-Key` por intenção como módulos compartilhados do web; o diagnóstico continua igual (OQ-91, OQ-92, OQ-97).
- R-10 Seed de demonstração por script que chama a API (OQ-8, OQ-76).
- R-11 E2E de API, replay dos quatro read models, integração de comutatividade e Playwright do Catalog; o diagnóstico continua como smoke test (OQ-87, OQ-95).
- R-12 Documentação atualizada: read models no overview, modelo do Catalog no glossário, seed e replay no README.

## Regras de negócio

### Produtor e propriedade

- RN-1 Existe um único produtor seed, `organizerId = 0193a4f0-0000-7000-8000-000000000001`, sem nome. Todo command roda em nome dele; o cliente não envia o dono. (OQ-5, OQ-6, OQ-73)
- RN-2 `organizerId` é gravado no local e no evento. As leituras do produtor filtram pelo produtor seed. A validação de posse ("só o dono altera"; "a sessão só usa local do mesmo produtor") fica para a Fase 3. (OQ-6, OQ-10)
- RN-3 O nome do produtor não aparece em nenhuma tela. (OQ-7)

### Local

- RN-4 Local é cadastro próprio, reutilizável e com dono. Campos: `name` (trim, 1 a 100, não único), `address` (texto livre, trim, 1 a 200), `city` (trim, 1 a 100), `state` (uma das 27 UFs), `timeZone` (um dos 16 fusos brasileiros do tzdb; padrão no formulário `America/Sao_Paulo`). Só locais no Brasil. (OQ-9, OQ-10, OQ-11, OQ-13)
- RN-5 Os dados do local (os cinco campos) são editáveis sempre. A edição de nome, endereço, cidade e UF aparece em todas as sessões que usam o local; a edição do fuso não muda sessões já agendadas. O local nunca é removido na Fase 2. (OQ-49, OQ-50, OQ-13, OQ-62)
- RN-6 Não existe capacidade do local; a capacidade total é a soma dos setores. (OQ-12)

### Planta e setores

- RN-7 A planta do local é uma lista de 0 a 20 setores-modelo, na ordem de cadastro. O local pode existir sem setores, mas só recebe sessão com pelo menos 1. (OQ-14, OQ-17, OQ-21)
- RN-8 Setor: `name` (trim, 1 a 50, único na planta sem diferenciar maiúsculas), `kind` (`general_admission` = pista, `seated` = assento marcado). Pista tem `capacity` de 1 a 50.000. Assento marcado tem `rows`: 1 a 50 filas, cada uma com `label` (trim, 1 a 3 caracteres `A-Z0-9`, gravado em maiúsculas, único no setor) e `seats` (1 a 100, numerados de 1 a N); a capacidade é a soma dos assentos. Sem descrição, cor ou posição no mapa. (OQ-17, OQ-18, OQ-19, OQ-21)
- RN-9 Setor-modelo não é editável: para corrigir, remove e adiciona de novo. Setor da planta pode ser removido sempre; sessões já agendadas não mudam. (OQ-16, OQ-17, OQ-49)
- RN-10 Assentos de acessibilidade ficam fora da Fase 2 (lacuna consciente). (OQ-20)

### Evento

- RN-11 Evento: `title` (trim, 1 a 120, repetível), `description` (texto puro, quebras de linha preservadas, trim, 1 a 5.000), `category`, `ageRating` obrigatórios já na criação; `imageUrl` opcional (só `https://`, até 2.048 caracteres; o servidor não baixa a imagem). (OQ-22, OQ-25)
- RN-12 Categorias fixas: `show` (Shows), `theater` (Teatro e espetáculos), `stand_up` (Stand-up), `sports` (Esportes), `festival` (Festivais), `kids` (Infantil), `other` (Outros). (OQ-23)
- RN-13 Classificação indicativa obrigatória: `L` (Livre), `10`, `12`, `14`, `16`, `18` ("N anos"); exibida na página do evento; nenhum controle de idade. (OQ-24)
- RN-14 Sem imagem (ou se ela não carregar), o web mostra um placeholder por categoria; o texto alternativo é o título. (OQ-25)
- RN-15 Todo evento é presencial; cada dia de festival é uma sessão; não há passaporte. (OQ-26, OQ-27)
- RN-16 Os dados do evento são editáveis sempre, em Rascunho ou Publicado. (OQ-50)

### Sessão

- RN-17 O local é da sessão; sessões do mesmo evento podem ser em locais diferentes. (OQ-28)
- RN-18 Sessão tem `startsAt` (início) e `salesStartsAt` (início das vendas), sem término nem abertura de portões. `salesStartsAt` é obrigatório, anterior a `startsAt` e pode estar no passado ("assim que publicar"). (OQ-29, OQ-41)
- RN-19 Ao agendar, `startsAt` precisa ser posterior ao "agora" do write-service, sem limite máximo. (OQ-30)
- RN-20 Até 50 sessões por evento; rascunho pode ter zero; duas sessões do mesmo evento não têm o mesmo local e o mesmo `startsAt`; conflito de agenda com outros eventos não é validado. (OQ-31)
- RN-21 Ao ser agendada, a sessão copia **todos** os setores da planta (IDs novos, mesma ordem) e o fuso do local. Exibição e entrada de datas da sessão usam o fuso copiado. (OQ-13, OQ-14, OQ-16)
- RN-22 O command de agendar leva o fuso com que o formulário converteu as datas; se for diferente do fuso atual do local, o command é rejeitado (`VENUE_TIME_ZONE_CHANGED`) e o web recarrega o local e pede para conferir os horários. (OQ-98)
- RN-23 Com a sessão em Rascunho, o produtor pode remover um setor da sessão (os lotes vão junto) e adicionar à sessão um setor da planta atual que não esteja nela (nova cópia, ID novo, ordem da planta). A sessão não tem duas cópias do mesmo setor da planta nem dois setores com o mesmo nome (sem diferenciar maiúsculas). Capacidade e layout da cópia não são editáveis. (OQ-15)

### Lote e preço

- RN-24 Lote pertence a um setor da sessão; cada sessão tem os próprios lotes; não há "copiar lotes". (OQ-32)
- RN-25 Lote: `name` (trim, 1 a 50, único no setor da sessão sem diferenciar maiúsculas), `priceCents` (inteiro de 1 a 10.000.000, só BRL, preço da inteira, sem taxa), `quantity` (opcional, inteiro de 1 até a capacidade do setor), `endsAt` (opcional). A ordem é a de cadastro, sem reordenação; nenhum lote tem início próprio. Até 10 lotes por setor da sessão. (OQ-34, OQ-39, OQ-21)
- RN-26 `endsAt`, quando informado, é depois de `salesStartsAt` e antes de `startsAt` da sessão, e depois do `endsAt` de qualquer lote anterior que tenha data. (OQ-34, OQ-41)
- RN-27 Ao adicionar um lote, o lote que era o último precisa ter `quantity` ou `endsAt`. (OQ-34)
- RN-28 A soma das `quantity` informadas num setor não passa da capacidade do setor. `quantity` é teto do próprio lote; a capacidade do setor continua sendo o teto real. (OQ-36)
- RN-29 Virada sequencial: as vendas do setor começam em `salesStartsAt`, só depois da publicação; o lote vigente é o primeiro, na ordem, que ainda não terminou; um lote termina no seu `endsAt` ou ao vender a sua `quantity`, o que vier primeiro (na Fase 2 só a data tem efeito, porque não há venda); quando o último lote termina, as vendas do setor acabam; o último lote sem `quantity` nem `endsAt` vende até o início da sessão. No máximo um lote vigente por setor. (OQ-33, OQ-35)
- RN-30 Sobra de lote encerrado por data continua na capacidade do setor e é vendida pelos lotes seguintes, ao preço deles; o teto do lote seguinte não aumenta. O lote vale para qualquer assento do setor. O preço não precisa crescer entre lotes. (OQ-37, OQ-38, OQ-40)
- RN-31 Meia-entrada, cota legal, taxa de conveniência e limite por CPF ficam totalmente fora; nenhum campo agora. (OQ-42)

### Ciclo de vida

- RN-32 A sessão é a unidade publicável (Rascunho → Publicada). Não existe publicar evento. O evento é Rascunho até a primeira sessão ser publicada e passa a Publicado nesse momento. Nada volta a Rascunho; não há despublicar, cancelar nem remarcar. (OQ-43, OQ-45, OQ-46, OQ-47, OQ-48, OQ-51)
- RN-33 Para publicar uma sessão: ela está em Rascunho; `startsAt` é posterior a agora; tem pelo menos 1 setor; cada setor tem pelo menos 1 lote; nenhum lote tem `endsAt` no passado; as regras RN-25 a RN-28 continuam valendo. A publicação é imediata. (OQ-44, OQ-45)
- RN-34 Sessão publicada fica congelada: não muda data, início das vendas, local, setores nem lotes, e não é removida. Evento publicado pode receber sessões novas, que nascem em Rascunho. (OQ-50, OQ-51)
- RN-35 Exclusões: evento só em Rascunho (descarte definitivo; sai das listas do produtor e de todos os read models; a página pública dá 404); sessão, setor da sessão e lote só com a sessão em Rascunho; setor da planta sempre; local nunca. (OQ-49)
- RN-36 "Sessão encerrada" (já começou) e "evento encerrado" (todas as sessões publicadas já começaram) são derivados do relógio, nunca gravados. (OQ-43, OQ-70)

### Vitrine e página do evento

- RN-37 A vitrine lista um card por evento que tenha pelo menos uma sessão publicada que ainda não começou. O evento sai da vitrine quando começa a última sessão publicada. (OQ-52, OQ-53)
- RN-38 O card mostra imagem (ou placeholder), título, rótulo da categoria, nome do local + cidade/UF da próxima sessão publicada não iniciada, data e hora dessa sessão no fuso dela, "+N datas" quando houver outras sessões publicadas futuras, e o preço da RN-39. (OQ-54)
- RN-39 Preço do card: "A partir de R$ X", com X = menor `priceCents` entre os lotes vigentes agora, em todos os setores das sessões publicadas não iniciadas com vendas abertas. Sem lote vigente: "Vendas a partir de dd/mm" (o menor `salesStartsAt` futuro entre essas sessões) ou, se as vendas já acabaram em todas, "Vendas encerradas". Sem taxa. (OQ-55)
- RN-40 Vendas abertas de uma sessão = sessão publicada **e** `salesStartsAt` ≤ agora < `startsAt` **e** existe lote vigente. (OQ-41)
- RN-41 A página pública mostra só sessões publicadas, em ordem de `startsAt`. Para cada uma: local (nome, endereço, cidade/UF), data e hora no fuso dela; por setor (ordem da planta), o tipo ("Assento marcado" ou "Pista") e só o lote vigente (nome e preço); sem lote vigente, "Vendas a partir de dd/mm HH:mm" ou "Vendas encerradas". Sessão que já começou aparece como "Sessão encerrada", sem lotes nem preço. Sem capacidade nem disponibilidade. (OQ-53, OQ-56)
- RN-42 Evento encerrado continua acessível pela URL com "Evento encerrado". Evento em Rascunho ou descartado dá 404 na rota pública. (OQ-53)
- RN-43 A área do produtor mostra, por setor, a sequência completa de lotes com selo derivado (Encerrado, Vigente, Em breve) e o status de cada sessão (Rascunho, Publicada). (OQ-56)
- RN-44 Busca por palavra inteira no título, sem diferenciar maiúsculas e acentos, sem prefixo. Filtros cidade (texto livre comparado por igualdade após trim, minúsculas e sem acento; o evento entra se qualquer sessão publicada não iniciada for na cidade) e categoria, combináveis com a busca. Sem filtro de datas. (OQ-57, OQ-71)
- RN-45 Ordenação fixa da vitrine: próxima sessão publicada não iniciada, mais cedo primeiro; desempate por título e depois por ID. (OQ-57, OQ-70)
- RN-46 Paginação por offset: `page` começa em 1, `pageSize` padrão 12 e máximo 48, resposta com `items`, `page`, `pageSize` e `total`; UI "Carregar mais". A lista de eventos do produtor pagina igual, do mais recente para o mais antigo, com rascunhos. A lista de locais do produtor não pagina. (OQ-58)
- RN-47 A página do evento não tem botão de compra. (OQ-59)

### Seed de demonstração

- RN-48 Um script cria, via commands pela API, o conjunto de demonstração da OQ-8 de negócio (3 locais, 4 eventos), com datas relativas ao dia da execução, sem imagem; roda uma vez, sob demanda; não faz nada se algum dos quatro títulos já existir. Os valores que a OQ-8 não fixou seguem a OQ-99: descrição fictícia de uma frase por evento; datas dadas só como dia valem 00:00 no fuso do local; o início das vendas é o momento da execução do seed, salvo "vendas a partir de D+10" em Manaus; os lotes sem nome se chamam "Lote único"; `D` é a data de hoje no fuso de cada local. A tabela completa está na T-52 do Plan. (OQ-8, OQ-76, OQ-99)

### Regras técnicas que viram comportamento observável

- RN-49 Todo command responde `202` com `{ id, version }` do agregado; os que criam filha respondem `{ id, version, entityId }` (`ScheduleSession`, `AddSessionSector`, `AddBatch`, `AddVenueSector`). (OQ-65, OQ-80, regra 2)
- RN-50 Todo command exige `Idempotency-Key` (UUID), inclusive `PATCH` e `DELETE`, com o mecanismo e a retenção de 24 h da Fase 1. (OQ-80, regra 9)
- RN-51 Só `UpdateEventDetails` e `UpdateVenueDetails` levam `expectedVersion` no corpo; divergência → `409`. Os demais commands usam a versão lida no servidor. (OQ-64, regra 4)
- RN-52 Erros de command: `400` validação (`issues`), `404` recurso do caminho inexistente, `409` só conflito de versão, `422` violação de regra de negócio ou referência inexistente no corpo; todos com `code` estável em inglês. (OQ-82)
- RN-53 Leituras por ID aceitam `min_version`: o servidor espera até 3 s; o web espera até 10 s e depois mostra "Salvo. Os dados podem demorar a aparecer." com "Atualizar". Listas não aceitam `min_version`. O diagnóstico continua sem limite no web. (OQ-68, OQ-97, regra 7)
- RN-54 O evento descartado deixa no `event_detail` só uma lápide técnica (`_id`, `version`, `status: 'discarded'`), sem dado de negócio, para o read-your-writes do descarte terminar. (OQ-68)

### Interpretações das decisões (para confirmar no Gate 2)

Aplicações diretas das decisões que o Plan precisa fixar. Nenhuma cria regra nova; se o usuário discordar de alguma, ela volta como OQ.

| # | Ponto | Interpretação | Base |
|---|---|---|---|
| I-1 | Selo do lote na área do produtor | Vigente = o lote vigente da RN-29. Encerrado = `endsAt` já passou **ou** a sessão já começou (as vendas terminam no início, RN-29). Em breve = os demais. Em sessão Rascunho nenhum lote é Vigente (vendas só depois da publicação) | OQ-33, OQ-41, OQ-56 |
| I-2 | Card com filtro de cidade | O card continua mostrando a próxima sessão publicada não iniciada do evento, mesmo que seja em outra cidade; a ordenação também | OQ-54, OQ-57 |
| I-3 | `pageSize` fora de 1 a 48 ou `page` < 1 | `400` de validação | OQ-58 |
| I-4 | Lista "Meus eventos" | Cada item mostra título, rótulo da categoria, status (Rascunho/Publicado) e "N sessões (M publicadas)" | OQ-4, OQ-58 |
| I-5 | Lista de locais | Ordem alfabética do nome (sem diferenciar maiúsculas e acentos), desempate por ID; cada item mostra nome, cidade/UF e número de setores | OQ-58, OQ-86 |
| I-6 | Ordem das sessões na área do produtor | `startsAt`, desempate por ID (igual à página pública, RN-41) | OQ-56 |
| I-7 | Formato de data e hora | Data e hora da sessão `dd/mm/aaaa HH:mm`; "Vendas a partir de dd/mm" no card; "Vendas a partir de dd/mm HH:mm" na página; sempre no fuso da sessão, 24 h | OQ-13, OQ-55, OQ-56 |
| I-8 | Imagem na edição | `UpdateEventDetails` substitui os cinco campos; `imageUrl: null` remove a imagem; na criação, `imageUrl` ausente = sem imagem | OQ-22, OQ-25 |
| I-9 | Desempate por título | Feito por uma chave normalizada do título (trim, minúsculas, sem acento) gravada no read model, em vez de collation: o MongoDB não combina `$text` com collation diferente de `simple` | OQ-70, anexo técnico |
| I-10 | Descartar evento | Botão "Descartar evento" pede confirmação na própria tela ("Confirmar descarte" / "Cancelar") antes de enviar o command | OQ-49 |
| I-11 | Parâmetros da vitrine na URL do web | `busca`, `cidade` e `categoria` (código da categoria), em PT-BR como as rotas | OQ-57, OQ-89 |
| I-12 | Erro de `Idempotency-Key` ausente ou inválida | `400` com `code: 'IDEMPOTENCY_KEY_INVALID'` | OQ-82, RN-50 |
| I-13 | Erros do read-service | Mantêm o formato da Fase 1 (sem `code`): a OQ-82 trata do contrato de erro dos commands | OQ-82 |
| I-14 | `endsAt` no passado ao adicionar lote | Não é validado no cadastro (a regra existe só na publicação, RN-33) | OQ-34, OQ-44 |
| I-15 | 404 com `min_version` | O corpo do `404` das leituras por ID traz `minVersionReached: true` quando existe documento (inclusive lápide ou rascunho na rota pública) com versão ≥ `min_version`; senão `false` | OQ-68 |

## Contratos

Todos os schemas em `libs/contracts` (detalhe de exports no Plan, "Interfaces entre trilhas"). Instantes são ISO 8601 com offset na entrada (`z.iso.datetime({ offset: true })`) e `toISOString()` (UTC, sufixo `Z`) na saída.

### Commands

`organizerId` nunca vem do cliente (RN-1). Todos com header `Idempotency-Key` (RN-50). "Rascunho" = sessão em Rascunho.

| Command | Payload (corpo) | Retorno (`202`) | Erros (`code`) |
|---|---|---|---|
| `RegisterVenue` | `{ name, address, city, state, timeZone }` | `{ id, version: 1 }` | 400 |
| `UpdateVenueDetails` | `{ expectedVersion, name, address, city, state, timeZone }` | `{ id, version }` | 400; 404 `AGGREGATE_NOT_FOUND`; 409 `CONCURRENCY_CONFLICT` |
| `AddVenueSector` | `{ name, kind: 'general_admission', capacity }` ou `{ name, kind: 'seated', rows: [{ label, seats }] }` | `{ id, version, entityId }` | 400; 404 `AGGREGATE_NOT_FOUND`; 422 `VENUE_SECTOR_LIMIT_REACHED`, `VENUE_SECTOR_NAME_TAKEN` |
| `RemoveVenueSector` | — | `{ id, version }` | 404 `AGGREGATE_NOT_FOUND`, `ENTITY_NOT_FOUND` |
| `CreateEvent` | `{ title, description, category, ageRating, imageUrl? }` | `{ id, version: 1 }` | 400 |
| `UpdateEventDetails` | `{ expectedVersion, title, description, category, ageRating, imageUrl: string \| null }` | `{ id, version }` | 400; 404; 409 |
| `DiscardEvent` | — | `{ id, version }` | 404; 422 `EVENT_NOT_DRAFT` |
| `ScheduleSession` | `{ venueId, startsAt, salesStartsAt, timeZone }` | `{ id, version, entityId: sessionId }` | 400 (inclui `salesStartsAt` não anterior a `startsAt`); 404; 422 `VENUE_NOT_FOUND`, `VENUE_TIME_ZONE_CHANGED`, `VENUE_WITHOUT_SECTORS`, `SESSION_LIMIT_REACHED`, `SESSION_START_NOT_IN_FUTURE`, `SESSION_DUPLICATED` |
| `RemoveSession` | — | `{ id, version }` | 404 `AGGREGATE_NOT_FOUND`, `ENTITY_NOT_FOUND`; 422 `SESSION_NOT_DRAFT` |
| `AddSessionSector` | `{ venueSectorId }` | `{ id, version, entityId: sessionSectorId }` | 400; 404; 422 `SESSION_NOT_DRAFT`, `VENUE_SECTOR_NOT_FOUND`, `SESSION_SECTOR_ALREADY_PRESENT`, `SESSION_SECTOR_NAME_TAKEN` |
| `RemoveSessionSector` | — | `{ id, version }` | 404; 422 `SESSION_NOT_DRAFT` |
| `AddBatch` | `{ name, priceCents, quantity?, endsAt? }` (`null` aceito nos opcionais) | `{ id, version, entityId: batchId }` | 400; 404; 422 `SESSION_NOT_DRAFT`, `BATCH_LIMIT_REACHED`, `BATCH_NAME_TAKEN`, `BATCH_QUANTITY_EXCEEDS_CAPACITY`, `BATCH_END_OUT_OF_RANGE`, `BATCH_END_BEFORE_PREVIOUS`, `PREVIOUS_BATCH_UNBOUNDED` |
| `RemoveBatch` | — | `{ id, version }` | 404; 422 `SESSION_NOT_DRAFT` |
| `PublishSession` | `{}` | `{ id, version }` | 404; 422 `SESSION_NOT_DRAFT`, `SESSION_START_NOT_IN_FUTURE`, `SESSION_WITHOUT_SECTORS`, `SECTOR_WITHOUT_BATCH`, `BATCH_ENDED` e os códigos de lote de `AddBatch` |

Comuns a todos: 400 `VALIDATION_FAILED` (`issues: [{ path, message }]`), 400 `IDEMPOTENCY_KEY_INVALID`, 422 `IDEMPOTENCY_KEY_MISMATCH`. Corpo dos erros não-400: `{ statusCode, error, message, code }`. Corpo do 400 de validação: `{ statusCode: 400, error: 'Bad Request', message: 'Validation failed', code: 'VALIDATION_FAILED', issues }`.

### Events

Todos `V1`, no envelope da Fase 1 (`libs/contracts/src/events/envelope.ts`), `bounded_context = 'catalog'`, tópico `catalog.events`, `aggregateVersion` = versão do agregado depois do evento. Um evento por command (OQ-63).

| Event | Versão | Payload | Partition key |
|---|---|---|---|
| `VenueRegistered` | 1 | `{ organizerId, name, address, city, state, timeZone }` (`aggregateVersion` = 1) | `venueId` |
| `VenueDetailsUpdated` | 1 | `{ name, address, city, state, timeZone }` | `venueId` |
| `VenueSectorAdded` | 1 | `{ sector: VenueSector }` | `venueId` |
| `VenueSectorRemoved` | 1 | `{ venueSectorId }` | `venueId` |
| `EventCreated` | 1 | `{ organizerId, title, description, category, ageRating, imageUrl: string \| null }` (`aggregateVersion` = 1) | `eventId` |
| `EventDetailsUpdated` | 1 | `{ title, description, category, ageRating, imageUrl }` | `eventId` |
| `EventDiscarded` | 1 | `{}` | `eventId` |
| `SessionScheduled` | 1 | `{ sessionId, venueId, startsAt, salesStartsAt, timeZone, sectors: SessionSector[] }` (sem `active`; `sectors` com `batches: []`) | `eventId` |
| `SessionRemoved` | 1 | `{ sessionId }` | `eventId` |
| `SessionSectorAdded` | 1 | `{ sessionId, sector: SessionSector }` (`batches: []`) | `eventId` |
| `SessionSectorRemoved` | 1 | `{ sessionId, sessionSectorId }` | `eventId` |
| `BatchAdded` | 1 | `{ sessionId, sessionSectorId, batch: Batch }` | `eventId` |
| `BatchRemoved` | 1 | `{ sessionId, sessionSectorId, batchId }` | `eventId` |
| `SessionPublished` | 1 | `{ session: PublishedSession }`: retrato completo (`sessionId`, `venueId`, `timeZone`, `startsAt`, `salesStartsAt`, `sectors: SessionSector[]` com `batches`) | `eventId` |

Tipos de payload:
- `VenueSector = { venueSectorId, name, position, kind: 'general_admission', capacity } | { venueSectorId, name, position, kind: 'seated', rows: [{ label, seats }] }`.
- `SessionSector = { sessionSectorId, venueSectorId, name, position, kind, capacity | rows, batches: Batch[] }` (mesma união de `kind`).
- `Batch = { batchId, name, priceCents, quantity: number | null, endsAt: string | null, position }`.

### Queries

| Query | Parâmetros | Retorno | Read model |
|---|---|---|---|
| `ListEvents` | `q?`, `city?`, `category?`, `page` (padrão 1), `pageSize` (padrão 12, máx. 48) | `{ items: EventCard[], page, pageSize, total, asOf }` | `event_listing` |
| `GetEvent` | `eventId`, `min_version?` | `{ event: PublicEventView, minVersionReached }` ou `404 { statusCode, message, minVersionReached }` | `event_detail` |
| `ListOrganizerEvents` | `page`, `pageSize` | `{ items: OrganizerEventSummary[], page, pageSize, total }` | `organizer_events` |
| `GetOrganizerEvent` | `eventId`, `min_version?` | `{ event: OrganizerEventView, minVersionReached }` ou `404` | `event_detail` |
| `ListVenues` | — | `{ items: VenueSummary[] }` | `venues` |
| `GetVenue` | `venueId`, `min_version?` | `{ venue: VenueView, minVersionReached }` ou `404` | `venues` |

Views (campos; datas em ISO UTC):
- `EventCard = { id, title, category, imageUrl, nextSession: { id, startsAt, timeZone, venue: { name, city, state } }, otherUpcomingSessionsCount, price: { kind: 'from', priceCents } | { kind: 'sales_start', salesStartsAt } | { kind: 'sales_ended' } }`.
- `PublicEventView = { id, version, title, description, category, ageRating, imageUrl, ended, asOf, sessions: [{ id, startsAt, timeZone, ended, venue: { name, address, city, state }, sectors: [{ id, name, kind, sales: { status: 'open', batch: { name, priceCents } } | { status: 'upcoming', salesStartsAt } | { status: 'ended' } }] }] }` (`sectors` vazio quando `ended`).
- `OrganizerEventView = { id, version, status: 'draft' | 'published', title, description, category, ageRating, imageUrl, createdAt, asOf, sessions: [{ id, status, venueId, venue: { name, address, city, state } | null, startsAt, salesStartsAt, timeZone, ended, salesOpen, sectors: [{ id, venueSectorId, name, kind, capacity, rows: [{ label, seats }] | null, batches: [{ id, name, priceCents, quantity, endsAt, badge: 'ended' | 'current' | 'upcoming' }] }] }] }`.
- `OrganizerEventSummary = { id, title, category, status, sessionsCount, publishedSessionsCount, createdAt }`.
- `VenueSummary = { id, name, city, state, timeZone, sectorsCount, version }`.
- `VenueView = { id, version, name, address, city, state, timeZone, sectors: [{ id, name, kind, capacity, rows | null }] }`.

### HTTP

Prefixo `api` (Fase 1). O Nginx manda `GET`/`HEAD` ao read-service e o resto ao write-service, sem mudança.

| Método | Rota | Serviço | Command/Query |
|---|---|---|---|
| POST | `/api/catalog/venues` | write | `RegisterVenue` |
| PATCH | `/api/catalog/venues/:venueId` | write | `UpdateVenueDetails` |
| POST | `/api/catalog/venues/:venueId/sectors` | write | `AddVenueSector` |
| DELETE | `/api/catalog/venues/:venueId/sectors/:venueSectorId` | write | `RemoveVenueSector` |
| POST | `/api/catalog/events` | write | `CreateEvent` |
| PATCH | `/api/catalog/events/:eventId` | write | `UpdateEventDetails` |
| DELETE | `/api/catalog/events/:eventId` | write | `DiscardEvent` |
| POST | `/api/catalog/events/:eventId/sessions` | write | `ScheduleSession` |
| DELETE | `/api/catalog/events/:eventId/sessions/:sessionId` | write | `RemoveSession` |
| POST | `/api/catalog/events/:eventId/sessions/:sessionId/publish` | write | `PublishSession` |
| POST | `/api/catalog/events/:eventId/sessions/:sessionId/sectors` | write | `AddSessionSector` |
| DELETE | `/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId` | write | `RemoveSessionSector` |
| POST | `/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId/batches` | write | `AddBatch` |
| DELETE | `/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId/batches/:batchId` | write | `RemoveBatch` |
| GET | `/api/catalog/events` | read | `ListEvents` |
| GET | `/api/catalog/events/:eventId` | read | `GetEvent` |
| GET | `/api/catalog/organizer/events` | read | `ListOrganizerEvents` |
| GET | `/api/catalog/organizer/events/:eventId` | read | `GetOrganizerEvent` |
| GET | `/api/catalog/organizer/venues` | read | `ListVenues` |
| GET | `/api/catalog/organizer/venues/:venueId` | read | `GetVenue` |

Rotas do web: `/`, `/eventos/:eventId`, `/produtor/eventos`, `/produtor/eventos/novo`, `/produtor/eventos/:eventId`, `/produtor/locais`, `/produtor/locais/novo`, `/produtor/locais/:venueId`, `/diagnostico`, qualquer outra → 404 (OQ-88, OQ-89).

## Critérios de aceite

### CA-1 Contratos validam as regras de campo
- **Given** os schemas de request do Catalog em `libs/contracts`
- **When** recebem valores dentro e fora dos limites das RN-4, RN-8, RN-11 a RN-13, RN-18 e RN-25 (incluindo trim, UF fora da lista, fuso fora dos 16, `imageUrl` `http://`, rótulo de fila com acento, fila repetida, `salesStartsAt` igual a `startsAt`, `priceCents` 0 e 10.000.001)
- **Then** aceitam os válidos (com trim e rótulo em maiúsculas) e rejeitam os inválidos com `issues` no campo certo

### CA-2 Eventos V1 e união
- **Given** os 14 schemas `V1` e `CatalogDomainEventSchema`
- **When** um envelope válido de cada tipo e variações inválidas (tipo desconhecido, `schemaVersion: 2`, `SessionScheduled` com `active`) são validados
- **Then** os válidos passam e os inválidos falham; `VenueRegistered` e `EventCreated` só aceitam `aggregateVersion` 1

### CA-3 Conversão de fuso
- **Given** o módulo de fuso de `libs/contracts`
- **When** converte `2026-12-10T20:00` em `America/Sao_Paulo`, `America/Manaus`, `America/Noronha` e `America/Rio_Branco`, e `2018-12-10T20:00` em `America/Sao_Paulo`, e faz a conversão inversa
- **Then** obtém `23:00Z`, `00:00Z` do dia 11, `22:00Z`, `01:00Z` do dia 11 e `22:00Z`, e a inversa devolve o texto original

### CA-4 Normalização de texto
- **Given** `normalizeSearchKey`
- **When** recebe `'  São Paulo '` e `'SAO PAULO'`
- **Then** ambos viram `'sao paulo'`

### CA-5 Infraestrutura compartilhada sem duplicação
- **Given** o write-service com `DiagnosticsModule` e `CatalogModule`
- **When** a aplicação sobe
- **Then** existe uma única instância de `OutboxWriter`, `IdempotencyService` e do cron `idempotency-cleanup`; os testes unitários, de integração e E2E do diagnóstico continuam passando sem mudança de comportamento

### CA-6 Cadastro de local
- **Given** um corpo válido de `RegisterVenue`
- **When** é enviado com `Idempotency-Key`
- **Then** responde `202 { id, version: 1 }`, grava `catalog_venues` com o `organizerId` seed e, na mesma transação, uma linha na `outbox` com `VenueRegistered`, `bounded_context 'catalog'`, `aggregate_id` = id

### CA-7 Edição de local com versão esperada
- **Given** um local na versão 3
- **When** `UpdateVenueDetails` chega com `expectedVersion: 3` e depois outro com `expectedVersion: 3`
- **Then** o primeiro responde `202 { version: 4 }` com `VenueDetailsUpdated`; o segundo responde `409 CONCURRENCY_CONFLICT` sem gravar nada

### CA-8 Planta do local
- **Given** um local com 19 setores
- **When** recebe `AddVenueSector` válido, depois um 21º, depois um com nome igual a outro sem diferenciar maiúsculas
- **Then** o primeiro responde `202` com `entityId` e `VenueSectorAdded` (capacidade de assento marcado = soma das filas); o segundo `422 VENUE_SECTOR_LIMIT_REACHED`; o terceiro `422 VENUE_SECTOR_NAME_TAKEN`

### CA-9 Remoção de setor da planta não afeta sessões
- **Given** uma sessão agendada com a cópia do setor S da planta
- **When** `RemoveVenueSector` remove S da planta
- **Then** responde `202`, emite `VenueSectorRemoved`, e a sessão continua com a cópia de S no write e nos read models

### CA-10 Criação de evento
- **Given** um corpo válido de `CreateEvent` sem `imageUrl`
- **When** é enviado
- **Then** responde `202 { id, version: 1 }`, o evento nasce Rascunho com `organizerId` seed e `imageUrl` nulo, e `EventCreated` vai para a outbox

### CA-11 Edição dos dados do evento
- **Given** um evento em Rascunho e outro Publicado
- **When** `UpdateEventDetails` chega com a versão certa em cada um
- **Then** os dois respondem `202` e emitem `EventDetailsUpdated`; com versão errada, `409`

### CA-12 Agendar sessão copia planta e fuso
- **Given** um local com 2 setores (1 pista, 1 marcado) e fuso `America/Manaus`
- **When** `ScheduleSession` chega com `timeZone: 'America/Manaus'`, `startsAt` futuro e `salesStartsAt` anterior
- **Then** responde `202 { id: eventId, version, entityId: sessionId }`; a sessão nasce Rascunho com 2 setores copiados (IDs novos, `venueSectorId` de origem, mesma ordem) e fuso `America/Manaus`; `SessionScheduled` traz `salesStartsAt`, `timeZone` e os setores com `batches: []`, sem `active`

### CA-13 Agendar sessão: rejeições
- **Given** um evento e locais em situações diferentes
- **When** `ScheduleSession` é enviado com local inexistente, com fuso diferente do atual do local, com local sem setores, com `startsAt` no passado, repetindo local + `startsAt` de outra sessão do evento, ou numa 51ª sessão
- **Then** responde `422` com, respectivamente, `VENUE_NOT_FOUND`, `VENUE_TIME_ZONE_CHANGED`, `VENUE_WITHOUT_SECTORS`, `SESSION_START_NOT_IN_FUTURE`, `SESSION_DUPLICATED`, `SESSION_LIMIT_REACHED`; nada é gravado (nem outbox, nem chave)

### CA-14 Setores da sessão
- **Given** uma sessão em Rascunho com os setores A e B copiados
- **When** `RemoveSessionSector` remove A e depois `AddSessionSector` adiciona de novo o setor da planta de A; depois tenta adicionar B de novo; depois um setor da planta de outro local
- **Then** a remoção leva os lotes de A junto; a nova cópia tem ID novo e a posição da planta; as tentativas seguintes dão `422 SESSION_SECTOR_ALREADY_PRESENT` e `422 VENUE_SECTOR_NOT_FOUND`

### CA-15 Regras de lote
- **Given** um setor de sessão em Rascunho com capacidade 200
- **When** recebe lotes: (a) válido com `quantity` 100; (b) segundo sem `quantity` nem `endsAt`; (c) terceiro depois de (b); (d) nome repetido; (e) `quantity` que faz a soma passar de 200; (f) `endsAt` depois do `startsAt`; (g) `endsAt` antes do `endsAt` de um anterior; (h) o 11º lote
- **Then** (a) e (b) são aceitos com `BatchAdded`; (c) `PREVIOUS_BATCH_UNBOUNDED`; (d) `BATCH_NAME_TAKEN`; (e) `BATCH_QUANTITY_EXCEEDS_CAPACITY`; (f) `BATCH_END_OUT_OF_RANGE`; (g) `BATCH_END_BEFORE_PREVIOUS`; (h) `BATCH_LIMIT_REACHED`

### CA-16 Remoções em rascunho
- **Given** uma sessão em Rascunho com lotes
- **When** `RemoveBatch` e depois `RemoveSession` são enviados
- **Then** respondem `202`, emitem `BatchRemoved` e `SessionRemoved`, e as linhas filhas somem do PostgreSQL

### CA-17 Publicar sessão publica o evento na primeira vez
- **Given** um evento em Rascunho com uma sessão completa (RN-33)
- **When** `PublishSession` é enviado
- **Then** responde `202`; sessão e evento ficam Publicados no PostgreSQL; a outbox recebe **uma** linha, `SessionPublished`, com o retrato completo da sessão; uma segunda sessão publicada depois também emite só `SessionPublished`

### CA-18 Publicar sessão: rejeições
- **Given** sessões incompletas ou vencidas
- **When** `PublishSession` é enviado para sessão já publicada, com `startsAt` no passado, sem setores, com setor sem lote, ou com lote de `endsAt` vencido
- **Then** responde `422` com `SESSION_NOT_DRAFT`, `SESSION_START_NOT_IN_FUTURE`, `SESSION_WITHOUT_SECTORS`, `SECTOR_WITHOUT_BATCH` ou `BATCH_ENDED`, respectivamente

### CA-19 Sessão publicada congelada
- **Given** uma sessão publicada
- **When** recebe `RemoveSession`, `AddSessionSector`, `RemoveSessionSector`, `AddBatch` ou `RemoveBatch`
- **Then** todos respondem `422 SESSION_NOT_DRAFT`; o evento continua aceitando `UpdateEventDetails` e `ScheduleSession` (nova sessão em Rascunho)

### CA-20 Descartar evento
- **Given** um evento em Rascunho com sessões, setores e lotes, e um evento Publicado
- **When** `DiscardEvent` é enviado para cada um
- **Then** o rascunho responde `202`, todas as linhas dele somem do PostgreSQL (CASCADE) e `EventDiscarded` vai para a outbox; o publicado responde `422 EVENT_NOT_DRAFT`; um command posterior no evento descartado responde `404`

### CA-21 Concorrência por agregado
- **Given** um evento na versão n
- **When** dois `AddBatch` em setores diferentes do mesmo evento chegam ao mesmo tempo
- **Then** um responde `202` com versão n+1 e o outro `409 CONCURRENCY_CONFLICT`; só um evento vai para a outbox

### CA-22 Atomicidade
- **Given** um command do Catalog que falha numa regra ou no meio da gravação
- **When** a transação é desfeita
- **Then** não sobra linha de domínio, de outbox nem de `idempotency_keys`; reenviar com a mesma chave executa de novo

### CA-23 Idempotência dos commands do Catalog
- **Given** um command qualquer do Catalog, inclusive `PATCH` e `DELETE`
- **When** é repetido com a mesma chave e o mesmo corpo, depois com a mesma chave e outro corpo, depois sem a chave
- **Then** a repetição devolve a mesma resposta sem novo evento; o corpo diferente dá `422 IDEMPOTENCY_KEY_MISMATCH`; sem chave dá `400 IDEMPOTENCY_KEY_INVALID`

### CA-24 Contrato de erro
- **Given** qualquer erro de command
- **When** a resposta é lida
- **Then** valida contra `ValidationErrorResponseSchema` (400) ou `DomainErrorResponseSchema` (404, 409, 422) com o `code` da tabela de Commands; o diagnóstico também passa a trazer `code`

### CA-25 Eventos no Kafka
- **Given** a stack completa
- **When** o fluxo de cadastro roda pelo gateway
- **Then** cada evento aparece em `catalog.events` com key = ID do agregado (venue ou evento) e headers `eventId` e `eventType`; os de um mesmo agregado ficam na mesma partição, em ordem de `aggregateVersion`

### CA-26 Mecanismo genérico de sequência
- **Given** o projector com `aggregate_versions`
- **When** recebe um evento repetido, um evento com `aggregateVersion` = atual + 1 e um com atual + 2
- **Then** o repetido é registrado como já aplicado e commitado; o seguinte é aplicado e `aggregate_versions` avança; a lacuna aborta a transação, não commita o offset e encerra o processo; o Ping passa pelos mesmos testes de integração da Fase 1 usando esse mecanismo

### CA-27 Registro por tópico
- **Given** o projector assinando `diagnostics.events` e `catalog.events`
- **When** chega uma mensagem de cada tópico, uma de tópico desconhecido e uma com `eventType` desconhecido
- **Then** as duas primeiras são validadas pelo schema do próprio tópico e projetadas; as outras duas derrubam o processo sem commit

### CA-28 Projeção da árvore do evento
- **Given** a sequência de eventos de um evento (criação, edição, sessões, setores, lotes, remoções, publicação)
- **When** é projetada
- **Then** `event_detail` reflete a árvore com arrays ordenados (sessões por `startsAt` e ID, setores por posição, lotes por posição), `version` = última versão, datas vindas de `occurredAt`, status do evento Publicado a partir da primeira `SessionPublished`

### CA-29 Resumos derivados na mesma transação
- **Given** um `event_detail` atualizado
- **When** a transação do evento termina
- **Then** `organizer_events` reflete título, categoria, status e contagens; `event_listing` existe só se houver sessão publicada e contém só as sessões publicadas; os três documentos têm a mesma `version`

### CA-30 Local comutativo
- **Given** os eventos de um local e de um evento que agenda sessão nele
- **When** são projetados nas ordens (a) local antes da sessão, (b) sessão antes do local, (c) `VenueDetailsUpdated` antes do `SessionScheduled` mais antigo
- **Then** os quatro read models ficam idênticos nas três ordens; enquanto o local não chega, a sessão fica com `venue: null` e não aparece nas leituras públicas

### CA-31 Fan-out da edição do local
- **Given** dois eventos com sessões no mesmo local
- **When** `VenueDetailsUpdated` é projetado
- **Then** nome, endereço, cidade, UF e chave de cidade mudam nas sessões dos dois eventos (detalhe e vitrine), o fuso das sessões não muda, e um `VenueDetailsUpdated` mais antigo reprocessado depois não sobrescreve o mais novo

### CA-32 Lápide do descarte
- **Given** um evento em Rascunho projetado
- **When** `EventDiscarded` é projetado
- **Then** `event_detail` vira `{ _id, version, status: 'discarded' }`, o evento sai de `organizer_events` e `event_listing`, e `GET /api/catalog/organizer/events/:id?min_version=<versão do descarte>` responde `404` com `minVersionReached: true`

### CA-33 Vitrine: visibilidade, busca, filtros, ordem e paginação
- **Given** eventos com sessões publicadas futuras, só passadas, só em Rascunho, em cidades e categorias diferentes
- **When** `GET /api/catalog/events` é chamado com e sem `q`, `city` e `category`, e com `page`/`pageSize`
- **Then** só aparecem eventos com sessão publicada não iniciada (RN-37); a busca acha palavra inteira do título sem acento nem caixa e não acha prefixo; o filtro de cidade normaliza o texto; a ordem segue a RN-45; `total` conta os filtrados; `pageSize` 49 dá `400`

### CA-34 Card da vitrine
- **Given** eventos com lote vigente, com vendas ainda não iniciadas e com vendas encerradas (relógio injetado)
- **When** a vitrine é lida
- **Then** cada card traz a próxima sessão com local e fuso, `otherUpcomingSessionsCount` e `price` `from` (menor preço vigente), `sales_start` (menor `salesStartsAt` futuro) ou `sales_ended`, conforme a RN-39; `asOf` = agora usado

### CA-35 Página pública do evento
- **Given** um evento publicado com uma sessão já iniciada, uma com vendas abertas, uma com vendas futuras, uma com todos os lotes vencidos e uma em Rascunho (relógio injetado)
- **When** `GET /api/catalog/events/:id` é chamado
- **Then** a sessão em Rascunho não aparece; a iniciada vem com `ended: true` e sem setores; as demais trazem por setor `open` com o lote vigente, `upcoming` com `salesStartsAt` ou `ended`; quando todas as publicadas começaram, `ended: true`; evento só com rascunhos ou descartado dá `404`

### CA-36 Leituras do produtor sobre eventos
- **Given** eventos do produtor seed (rascunho e publicado) e um documento de outro `organizerId`
- **When** `ListOrganizerEvents` e `GetOrganizerEvent` são chamados
- **Then** a lista traz só os do seed, do mais recente para o mais antigo, paginada; o detalhe traz sessões em Rascunho, todos os lotes com `badge` (I-1) e respeita `min_version` (espera até 3 s; no timeout, estado atual com `minVersionReached: false`)

### CA-37 Leituras de locais
- **Given** locais do produtor seed e de outro dono
- **When** `ListVenues` e `GetVenue` são chamados
- **Then** a lista traz só os do seed, em ordem alfabética (I-5), sem paginação; o detalhe traz a planta com capacidade calculada e respeita `min_version`

### CA-38 Espera do servidor extraída sem mudar o diagnóstico
- **Given** o helper comum de espera no read-service
- **When** `GetPing` usa o helper
- **Then** os testes da Fase 1 de `GetPing` (100 ms, 3 s, `minVersionReached: false`, `404`) continuam passando

### CA-39 Rotas e layout do web
- **Given** o web
- **When** o usuário abre `/`, `/diagnostico` e uma rota inexistente
- **Then** `/` mostra a vitrine dentro do layout (header com "Stubb" e "Área do produtor"; rodapé com "Diagnóstico"); `/diagnostico` mostra o diagnóstico da Fase 1 funcionando igual; a rota inexistente mostra "Página não encontrada"

### CA-40 Vitrine no web
- **Given** a API da vitrine simulada
- **When** o usuário abre `/`, busca por título, filtra por cidade e categoria e clica "Carregar mais"
- **Then** os filtros ficam na URL (`busca`, `cidade`, `categoria`); os cards mostram os campos da RN-38 formatados em pt-BR no fuso da sessão (I-7) e o placeholder da categoria quando não há imagem; "Carregar mais" acrescenta a próxima página e some quando todos foram carregados; sem resultados, "Nenhum evento encontrado."

### CA-41 Página do evento no web
- **Given** a API do evento simulada
- **When** o usuário abre `/eventos/:id`
- **Then** vê título, descrição com quebras de linha, categoria, classificação ("Livre" ou "N anos"), sessões com local e data no fuso delas, por setor o tipo e o lote vigente ou "Vendas a partir de dd/mm HH:mm" / "Vendas encerradas", "Sessão encerrada" e "Evento encerrado" quando for o caso, sem botão de compra; `404` mostra "Evento não encontrado"

### CA-42 Locais na área do produtor
- **Given** a área do produtor
- **When** o produtor cadastra um local, adiciona setores (pista e marcado, com filas dinâmicas), remove um setor e edita os dados
- **Then** cada submit envia um command, mostra "Aguardando projeção…" e, ao alcançar a versão, mostra o item atualizado; a lista de locais reflete o novo local

### CA-43 Eventos na área do produtor
- **Given** um local com planta
- **When** o produtor cria um evento, agenda uma sessão (datas digitadas no fuso do local), remove e adiciona setor da sessão, adiciona lotes, publica a sessão e descarta outro evento em Rascunho
- **Then** cada passo espera a projeção antes de mostrar o resultado; a gestão mostra status da sessão e selos dos lotes; o descarte volta para "Meus eventos" sem o evento; `422 VENUE_TIME_ZONE_CHANGED` recarrega o local e mostra "O fuso do local mudou. Confira os horários e envie de novo."

### CA-44 Edição com dado atrasado
- **Given** o formulário de dados do evento (ou do local) preenchido na versão n
- **When** o servidor responde `409`
- **Then** o web mostra "Os dados mudaram desde que você abriu o formulário. Carregamos a versão atual; confira e envie de novo.", recarrega a leitura e reabre o formulário com os dados e a versão novos

### CA-45 Erros no formulário
- **Given** respostas `400` com `issues` e `422` com `code`
- **When** chegam ao formulário
- **Then** cada `issue` aparece no campo do `path` (`aria-invalid`, mensagem anunciada); o `code` vira a mensagem PT-BR da tabela do Plan; o que não tem campo aparece em alerta no topo do formulário

### CA-46 Idempotency-Key por intenção
- **Given** um formulário aberto
- **When** o envio falha por rede e o usuário reenvia sem mudar nada, depois muda um campo e reenvia, depois o envio dá certo
- **Then** o primeiro reenvio usa a mesma chave; o envio com payload diferente usa chave nova; depois do sucesso a próxima intenção usa chave nova; os retries automáticos usam a mesma chave

### CA-47 Limite de espera pela projeção
- **Given** um command aceito cuja projeção não chega
- **When** passam 10 s desde o `202`
- **Then** o polling para e a tela mostra "Salvo. Os dados podem demorar a aparecer." com o botão "Atualizar", que reinicia a espera de 10 s; no diagnóstico a espera continua sem limite

### CA-48 Entrada de preço e de data
- **Given** os formulários de lote e de sessão
- **When** o produtor digita `1.234,56`, `0,29` e `abc` no preço, e datas em `datetime-local`
- **Then** o preço vira `123456`, `29` e erro "Informe um preço como 1.234,56"; as datas viram instantes no fuso do local (sessão) ou da sessão (lote)

### CA-49 Acessibilidade
- **Given** as telas novas
- **When** são testadas com RTL e Playwright
- **Then** todo campo tem label; erros usam `aria-invalid` e são anunciados; o foco vai ao primeiro campo inválido; o status da espera usa `aria-live`; cada página tem um `h1`; os testes usam `getByRole`/`getByLabelText`

### CA-50 Tópico, coleções e índices
- **Given** a stack recém-criada e uma já existente
- **When** sobe com `pnpm stack:up`
- **Then** `catalog.events` existe com 3 partições e `retention.ms=-1`; as coleções e índices do Plan existem no `stubb_read`; subir de novo não falha

### CA-51 Fluxo completo pelo gateway
- **Given** a stack de produção
- **When** o E2E de API cadastra local com planta, cria evento, agenda sessão, mexe em setores e lotes, publica, edita o local e descarta outro rascunho
- **Then** a vitrine e a página do evento refletem cada passo com `min_version`; o rascunho não aparece na vitrine e dá `404` na rota pública; a edição do local aparece na página; o descarte termina com `404` e `minVersionReached: true`

### CA-52 Replay
- **Given** read models do Catalog e do diagnóstico preenchidos
- **When** `pnpm replay` roda
- **Then** `event_listing`, `event_detail`, `organizer_events`, `venues` e `pings` voltam idênticos (ignorando `processedAt` de `processed_events`)

### CA-53 Playwright do Catalog
- **Given** a stack de produção
- **When** o Playwright faz o fluxo do produtor pela UI e abre a vitrine e a página do evento criado via API
- **Then** o produtor publica uma sessão e a vê na vitrine pela busca; a página mostra o lote vigente; o diagnóstico continua passando em `/diagnostico`

### CA-54 Seed de demonstração
- **Given** uma stack sem os eventos de demonstração
- **When** `pnpm seed:catalog` roda duas vezes
- **Then** a primeira cria os 3 locais e 4 eventos da OQ-8 (com os valores da OQ-99, tabela na T-52 do Plan) passando pela API com `Idempotency-Key` e `min_version`; a segunda não cria nada e avisa que o seed já existe

### CA-55 Documentação
- **Given** a fase implementada
- **When** os docs são lidos
- **Then** `docs/architecture/overview.md` lista os read models do Catalog, `docs/domain/glossary.md` descreve planta, setor da sessão e lote como decidido, e o `README.md` explica o seed, o replay depois da migração do Ping e o acesso por `127.0.0.1`

### CA-56 Qualidade
- **Given** o monorepo
- **When** rodam `pnpm lint`, `pnpm typecheck` e `pnpm test` na raiz
- **Then** os três terminam com código 0; o teste de arquitetura de cada app continua garantindo as fronteiras (write sem `mongodb`; read e projector sem `pg`/`typeorm`)

## Fora de escopo

- Disponibilidade, hold, vendas, "esgotado", mapa de assentos, `session_seat_map`, `sector_availability`, SSE, botão de compra (Fases 4 e 5).
- Virada de lote por quantidade com efeito real, meia-entrada, cota, taxa, limite por CPF, pedido e pagamento (Fase 5).
- Cancelar, remarcar e despublicar evento ou sessão; reembolso (Fase 7).
- Autenticação, papéis e validação de posse (Fase 3); nome do produtor.
- Edição de sessão, de lote e de setor-modelo; remoção de local; publicação agendada; copiar lotes entre sessões.
- Assentos de acessibilidade, evento online, passaporte, filtro de datas, ordenação escolhível, keyset.
- Upload de imagem; MongoDB Search (`mongot`); cache HTTP, rate limit e Redis (Fase 9).
- Internacionalização além de pt-BR.
