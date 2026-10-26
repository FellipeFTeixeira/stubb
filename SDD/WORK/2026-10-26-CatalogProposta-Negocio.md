---
feature: Catalog
fase: 2 — Catalog
date: 2026-10-26
status: proposta (não é decisão)
escopo: OQ-5 a OQ-59 (blocos N1 a N9) de SDD/RESEARCH/2026-10-25-CatalogResearch.md
---

# Catalog: proposta de respostas às Open Questions de negócio

Documento de trabalho do Gate 1. O usuário pediu ao planner uma **proposta** de resposta às OQs de negócio OQ-5 a OQ-59, com base em plataformas do mesmo ramo e na estrutura do Stubb. **Nada aqui é decisão.** A seção Decisões do Research continua sendo do thread principal, que registra só o que o usuário aprovar.

Premissas já decididas (Research, seção Decisões):
- OQ-1 = A: back-office mínimo no web (local e planta, evento, sessões, setores, lotes, publicação, lista dos próprios eventos com rascunhos).
- OQ-2 = C: criação, publicação, edição dos dados descritivos, remoção de sessão, setor e lote **enquanto rascunho**. Edição depois de publicar fica na OQ-50.
- OQ-3 = A: telas por entidade; um submit = um command, com espera pela projeção.
- OQ-4 = A: o produtor lista os próprios eventos (com rascunhos) e locais; leituras públicas até a Fase 3, risco aceito.

## Princípios usados nas propostas

- **P1. Começar restritivo.** Afrouxar uma regra depois (ex.: permitir editar lote de sessão publicada na Fase 5) é só acrescentar um command; apertar depois quebra dados e telas que já existem. Sem venda na Fase 2, toda dúvida sobre "pode mexer depois de publicar?" fica com "não".
- **P2. Uma fonte de verdade por dado.** Capacidade vem dos setores; o layout define a capacidade do setor marcado; o fuso vem do local.
- **P3. O tempo não é um command.** Tudo o que muda com o relógio (lote vigente, vendas abertas, sessão encerrada, próxima data, preço "a partir de") é derivado, nunca gravado pelo Catalog (alinhado à recomendação da OQ-70 A).
- **P4. O contrato precisa servir às Fases 4 a 7.** Sessão e setor com identidade estável, layout e capacidade no evento público, preço em centavos, e um evento de publicação por sessão, que é o gatilho natural para o Inventory criar os agregados sessão + setor.
- **P5. O menor conjunto de commands que cobre a OQ-2 C.** Cada command novo é um evento público, um caso de projeção e um formulário (R-20).

## Fontes de mercado consultadas

Os hosts de documentação oficial da Ticketmaster (`developer.ticketmaster.com`), da Eventbrite (`eventbrite.com`), do Planalto e do Mattos Filho estão **bloqueados** pelo proxy desta sessão. O conteúdo abaixo veio dos resumos do WebSearch (páginas oficiais e secundárias). Quando algo vem de memória e não foi conferido, está marcado "(de memória)".

| Fonte | O que mostra | Usado em |
|---|---|---|
| [Ticketmaster Discovery API, modelo de datas (SDK oficial)](https://code.ticketmaster.com/Android-Ignite-Retail-SDK/docs/discoveryAPI/-ticketmaster%20-discovery%20-a-p-i/com.ticketmaster.discoveryapi/-event-dates-response/index.html) | `dates` com `timezone`, `start` (`localDate`, `localTime`, `dateTime`), `end` opcional, `spanMultipleDays`, `status.code` | OQ-13, OQ-29 |
| [Ticketmaster Discovery API, detalhe do evento (SDK oficial)](https://code.ticketmaster.com/Android-Ignite-Retail-SDK/docs/discoveryAPI/-ticketmaster%20-discovery%20-a-p-i/com.ticketmaster.discoveryapi/-discovery-event-details-response/index.html) | Evento com `classifications` (segmento, gênero, subgênero), `venues`, `priceRanges` (mín./máx.), `onSaleStatusCode` | OQ-23, OQ-55 |
| [Eventbrite, status de evento](https://www.eventbrite.co/platform/docs/events) | Status `draft`, `live`, `started`, `ended`, `canceled`; `started`/`ended` dependem do relógio | OQ-43 |
| [Eventbrite, ticket classes](https://amp.eventbrite.es/platform/docs/ticket-classes) e [schema do conector Fivetran](https://fivetran.com/docs/connectors/applications/eventbrite/connector-schema) | Cada tipo de ingresso tem `sales_start`/`sales_end`; `sales_end` vazio = 1 h antes do início; `sales_start_after` = começa quando outro tipo esgota (virada por esgotamento) | OQ-33, OQ-41 |
| [Eventbrite, excluir evento](https://www.eventbrite.com/help/en-us/articles/172435/) e [despublicar](https://www.eventbrite.com/help/en-us/articles/895183/) | Despublicar volta a rascunho, mas com pedidos é preciso reembolsar antes; excluir exige despublicar e não ter pedidos; cancelar = status "Cancelled" + aviso + reembolso | OQ-46, OQ-47, OQ-49 |
| [Eventbrite, assento marcado](https://www.eventbrite.com/help/en-us/articles/683914/) e [página do recurso](https://www.eventbrite.com/features/reserved-seating/) | Mapa com seções de assento marcado ou pista; não dá para ligar assento marcado em evento que já tem ingressos | OQ-17, OQ-18, OQ-50 |
| [Sympla, vitrine por cidade](https://www.sympla.com.br/eventos/sao-paulo-sp/hoje) e [por categoria](https://www.sympla.com.br/eventos/infantil/este-mes) | Categorias fixas (Festas e Shows, Teatros e espetáculos, Stand up comedy, Esporte, Infantil, Cursos e workshops, Gastronomia, Grátis...); filtros por cidade e por período | OQ-23, OQ-57 |
| [Avaliação de produtores da Sympla (B2B Stack)](https://www.b2bstack.com.br/product/sympla/avaliacoes) | A virada de lote é recurso central para o produtor (sem detalhe da regra) | OQ-33 |
| [Rolling Stone: preços dos shows dos Jonas Brothers no Brasil](https://rollingstone.com.br/musica/quanto-custam-os-ingressos-para-o-show-do-jonas-brothers-no-brasil/) e [Mais Goiás: Bruno Mars](https://www.maisgoias.com.br/divirta-se/bruno-mars-venda-de-ingressos-para-o-show-do-cantor-no-brasil-comeca-nesta-quarta-feira-8-veja-precos-e-como-comprar/) | A Ticketmaster Brasil anuncia preço **por setor**, inteira e meia; taxa só na venda online; limite por CPF | OQ-39, OQ-42, OQ-56 |
| [CNJ: classificação indicativa (ECA art. 74; Portaria MJ 1.189/2018)](https://www.cnj.jus.br/wp-content/uploads/2019/09/Aspectos-protetivos-da-política-pública-da-Classificação-Indicativa-Eduardo-Nepomuceno.pdf) | Faixas Livre, 10, 12, 14, 16 e 18; o responsável pelo espetáculo deve informar a faixa em local visível na entrada | OQ-24 |
| [Decreto 13.108/2026 (Senado)](https://legis.senado.leg.br/norma/43734342/publicacao/43735985), [Consumidor Moderno](https://consumidormoderno.com.br/novo-decreto-compra-ingressos-regras/), [Rota Jurídica](https://www.rotajuridica.com.br/?p=178285) | **Novo, posterior ao Research:** regulamenta o CDC na venda de ingressos (publicado em 01/09/2026). Exige preço total com taxas discriminadas desde a oferta; em alteração relevante, adiamento ou cancelamento, o consumidor tem devolução integral (inclusive taxas) ou escolhe nova data ou crédito; não vale para eventos esportivos (Lei 14.597/2023) | OQ-42, OQ-48, OQ-50, OQ-55 |
| [MP-MA sobre meia-entrada (2026)](https://cdn-0.mpma.mp.br/publicacoes/20342/7b596b4eeb3a6ccc74aaeaa89afb5c1e.pdf) | Cota de 40% de meia **por noite** do evento; total e saldo de meias informados nos pontos de venda | OQ-32, OQ-42 |

Sugestão ao thread principal: incluir as fontes do Decreto 13.108/2026 em "Fontes externas" do Research quando registrar as decisões.

## Modelo que resulta das propostas

Este é o desenho que sai das propostas abaixo, para o usuário ver o conjunto antes de ler item por item. Os nomes de commands são da camada de negócio; os nomes finais são da OQ-61.

```
Organizer (seed; só um organizerId, sem cadastro no Catalog)
 ├── Venue                 nome, endereço, cidade, UF, fuso IANA          [editável sempre]
 │     └── VenueSector     nome, tipo (seated | general_admission),        [adicionar/remover sempre;
 │                         capacidade (pista) ou filas (marcado)             não afeta sessões existentes]
 └── Event                 título, descrição, categoria, classificação,     [editável sempre]
       │                   imagem?, status Rascunho | Publicado
       └── Session         local, fuso (copiado), início, início das vendas, status Rascunho | Publicada
             └── SessionSector  cópia de um VenueSector (nome, tipo, capacidade ou filas)
                   └── Batch    nome, preço (centavos), quantidade?, fim?, ordem
```

Ciclo de vida proposto: a **sessão** é a unidade publicável (Rascunho → Publicada). O evento vira Publicado quando a primeira sessão é publicada. Sessão publicada fica **congelada**; o que é do evento (textos, categoria, classificação, imagem) continua editável. Cancelar, remarcar e despublicar ficam para a Fase 7.

Capacidades de negócio (14), insumo para a OQ-61:

| Agregado | Capacidade | Quando é permitida |
|---|---|---|
| Venue | cadastrar local | sempre |
| Venue | editar dados do local (nome, endereço, cidade, UF, fuso) | sempre |
| Venue | adicionar setor à planta | sempre |
| Venue | remover setor da planta | sempre (sessões já criadas não mudam) |
| Event | criar evento (nasce Rascunho) | sempre |
| Event | editar dados do evento | sempre (Rascunho ou Publicado) |
| Event | descartar evento | só com o evento em Rascunho (nenhuma sessão publicada) |
| Event | agendar sessão (copia a planta e o fuso do local) | sempre; a sessão nasce Rascunho |
| Event | remover sessão | só com a sessão em Rascunho |
| Event | adicionar setor da planta à sessão | só com a sessão em Rascunho |
| Event | remover setor da sessão (com os lotes) | só com a sessão em Rascunho |
| Event | adicionar lote a um setor da sessão | só com a sessão em Rascunho |
| Event | remover lote | só com a sessão em Rascunho |
| Event | publicar sessão | só com a sessão em Rascunho e completa (OQ-44) |

---

## Bloco N1 — Escopo e atores

### OQ-5 Produtor seed: quantos e com quais dados?
- **Proposta:** A. Um produtor seed, identificado só por um UUID fixo, sem nome nem outros dados.
- **Valores:** `organizerId = 0193a4f0-0000-7000-8000-000000000001` (UUID v7 válido para o `z.uuid()` de `libs/contracts/src/shared/schemas.ts:3`). O valor só precisa ser fixo e documentado; qualquer UUID válido serve.
- **Justificativa:** o roadmap pede "produtor via usuário seed" (`docs/roadmap.md:13`). Gravar o `organizerId` em `Venue` e `Event` desde já deixa o contrato pronto para a Fase 3, que só troca **de onde** vem o ID (JWT). Um segundo produtor só ajudaria a testar posse, que fica para a Fase 3 (OQ-6).
- **Impacto:** OQ-6 (A), OQ-7 (B: sem nome, nada a exibir), OQ-10 (locais com dono), OQ-73 (valor do default do `SEED_ORGANIZER_ID`).
- **Confiança:** alta.

### OQ-6 Regra de propriedade e quem pode chamar os commands na Fase 2
- **Proposta:** A. Todo command é executado em nome do produtor seed; `organizerId` é gravado no local e no evento; as leituras do produtor filtram por `organizerId` do seed. A validação de posse entra na Fase 3, documentada como limitação conhecida.
- **Regras que ficam para a Fase 3 (registradas agora para não se perderem):** (1) só o dono altera um local ou evento; (2) uma sessão só pode usar local do mesmo produtor do evento.
- **Justificativa:** sem Identity, qualquer identificação é forjável (B, C e D criariam autenticação provisória descartada na Fase 3). Eventbrite e Sympla associam evento e local a uma organização; o Stubb grava o dono, que é a parte do contrato que não muda.
- **Impacto:** OQ-73 (A + a: o web não envia `organizerId`).
- **Confiança:** alta.

### OQ-7 O nome do produtor aparece na página do evento?
- **Proposta:** B. Não aparece na Fase 2.
- **Justificativa:** Sympla mostra "Fale com o produtor" e Eventbrite mostra o organizador, mas esse dado é da Identity (perfil do produtor, Fase 3). Copiar um nome fictício agora criaria no Catalog um cadastro que não é dele. Na Fase 3, o nome entra no read model por um evento da Identity, sem mudar os eventos do Catalog (é só uma projeção a mais, reconstruível por replay).
- **Impacto:** nenhum contrato do Catalog carrega nome de produtor.
- **Confiança:** alta.

### OQ-8 O seed cria locais e eventos de demonstração?
- **Proposta:** A. Um script cria, **via commands pela API** (OQ-76), o conjunto abaixo. Datas relativas ao momento da execução (`D` = dia em que o script roda), porque sessão precisa estar no futuro (OQ-30). Horários no fuso do local. Sem imagem (a vitrine usa o placeholder por categoria; nenhuma dependência de host externo).
- **Locais (3):**

| Local | Endereço | Cidade/UF | Fuso | Planta |
|---|---|---|---|---|
| Teatro Aurora | Rua das Acácias, 120 - Centro | São Paulo/SP | `America/Sao_Paulo` | Plateia (marcado: filas A a J, 20 assentos cada = 200); Balcão (marcado: filas A a E, 16 assentos cada = 80) |
| Arena Horizonte | Avenida Horizonte, 1000 - Centro | Belo Horizonte/MG | `America/Sao_Paulo` | Pista (pista, 3.000); Pista Premium (pista, 500); Cadeira Superior (marcado: filas A a T, 50 assentos cada = 1.000) |
| Casa Rio Negro | Rua do Porto, 200 - Centro | Manaus/AM | `America/Manaus` | Pista (pista, 600); Mezanino (marcado: filas A a D, 25 assentos cada = 100) |

- **Eventos (4):**

| Evento | Categoria / classificação | Sessões | Setores e lotes | Estado final |
|---|---|---|---|---|
| Hamlet | Teatro / 14 | 4 no Teatro Aurora: D+30 20:00, D+31 20:00, D+32 18:00 (publicadas) e D+33 20:00 (rascunho, sem lotes) | Plateia: "1º lote" R$ 80,00, 100 ingressos, fim em D+15; "2º lote" R$ 100,00, sem limite. Balcão: "Lote único" R$ 50,00. Vendas a partir do momento do seed | Publicado, com uma sessão em rascunho (só aparece na área do produtor) |
| Horizonte Rock Festival | Festival / 16 | 2 na Arena Horizonte: D+60 16:00 e D+61 16:00 (publicadas) | Pista: "1º lote" R$ 150,00, 1.000, fim em D+20; "2º lote" R$ 190,00, 1.000, fim em D+40; "3º lote" R$ 230,00, sem limite. Pista Premium: "1º lote" R$ 350,00, 200; "2º lote" R$ 420,00. Cadeira Superior: "Lote único" R$ 280,00 | Publicado; exercita a virada por data |
| Riso Solto: a turnê | Stand-up / 16 | D+45 21:00 no Teatro Aurora e D+52 21:00 na Casa Rio Negro (horário de Manaus), ambas publicadas | São Paulo: só Plateia (Balcão removido da sessão), "Lote único" R$ 70,00, vendas a partir do seed. Manaus: Pista R$ 60,00 e Mezanino R$ 90,00, vendas a partir de D+10 | Publicado; exercita sessões em locais e fusos diferentes, setor removido e "vendas a partir de" |
| Bolhas de Sabão | Infantil / Livre | 1 no Teatro Aurora, D+40 15:00, rascunho | Plateia e Balcão copiados da planta, sem lotes | Rascunho; não aparece na vitrine |

- **Justificativa:** cobre assento marcado e pista, rascunho e publicado, sessão em rascunho dentro de evento publicado, dois fusos, virada por data, setor removido, "vendas em breve" e preço "a partir de" diferente entre eventos. Nomes e endereços são fictícios, para não sugerir eventos reais. C (escrever direto no Mongo) viola a regra 6.
- **Impacto:** OQ-76 (script via API, rodado uma vez; com datas relativas o script pode ser rodado de novo numa stack limpa); OQ-95 (os E2E não devem depender deste seed: criam os próprios dados).
- **Confiança:** média no conteúdo (é gosto do usuário); alta no formato.

## Bloco N2 — Local

### OQ-9 Local é cadastro próprio e reutilizável?
- **Proposta:** A. Local é cadastro próprio, criado uma vez e escolhido ao agendar cada sessão.
- **Justificativa:** bate com o glossário ("lugar físico com sua planta de setores", `docs/domain/glossary.md:9`). Ticketmaster e Eventbrite tratam o local (venue) como entidade com ID própria, referenciada pelos eventos (de memória). Evita redigitar a planta, que é a parte mais trabalhosa do cadastro.
- **Impacto:** OQ-14, OQ-60 (agregado `Venue`).
- **Confiança:** alta.

### OQ-10 Quem cria e quem enxerga os locais?
- **Proposta:** A. Cada produtor cadastra os próprios locais (`Venue` com `organizerId`); a lista de locais da área do produtor mostra só os dele. Nas páginas públicas, nome e endereço do local aparecem como parte do evento.
- **Justificativa:** na Eventbrite o local pertence à organização que o criou (de memória). Com um único seed, A e B são iguais na prática, mas A grava o dono agora, pelo mesmo argumento do `organizerId` do evento. Um catálogo global de locais (Ticketmaster) pressupõe um administrador da plataforma, papel que o roadmap não prevê (`docs/roadmap.md:14`).
- **Impacto:** OQ-6 (regra "sessão só usa local do mesmo produtor" na Fase 3); OQ-69 (`ListVenues` filtrado por dono).
- **Confiança:** alta.

### OQ-11 Campos do local e validações
- **Proposta:** A, com o fuso da OQ-13. Só locais no Brasil.
- **Valores:**

| Campo | Regra |
|---|---|
| `name` | obrigatório; trim; 1 a 100 caracteres; **não** precisa ser único |
| `address` | obrigatório; texto livre (logradouro, número, complemento, bairro); trim; 1 a 200 caracteres |
| `city` | obrigatório; trim; 1 a 100 caracteres |
| `state` (UF) | obrigatório; uma das 27 siglas (AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO) |
| `timeZone` | obrigatório; lista da OQ-13; padrão no formulário `America/Sao_Paulo` |

- **Justificativa:** endereço estruturado (Eventbrite: `address_1`, `address_2`, `city`, `region`, `postal_code`; de memória) não acrescenta aprendizado de CQRS. Nome repetido é aceito: tornar único exigiria uma validação de conjunto entre agregados (unique por produtor) sem regra de negócio que peça isso; a lista mostra a cidade ao lado do nome. "Trim" aqui = remover espaços no início e no fim, como no precedente da Fase 1.
- **Impacto:** OQ-57 (cidade é o filtro da vitrine); schemas Zod compartilhados em `libs/contracts`.
- **Confiança:** alta no formato; média nos tamanhos.

### OQ-12 O local tem capacidade total que limita os setores?
- **Proposta:** B. Não existe capacidade do local; a capacidade total é a soma dos setores, derivada.
- **Justificativa:** P2. A capacidade vendável é sempre a do setor (o Inventory da Fase 4 é por sessão + setor).
- **Impacto:** nenhum campo novo.
- **Confiança:** alta.

### OQ-13 Fuso horário das sessões
- **Proposta:** B, com uma regra extra: a sessão **copia o fuso do local** quando é agendada (como copia a planta, OQ-16).
- **Valores:**
  - Gravação: instante (`timestamptz`, ISO 8601 com offset na API) para início da sessão, início das vendas e fim de lote.
  - Fuso: nome IANA, escolhido no cadastro do local entre os 16 fusos brasileiros do tzdb: `America/Noronha`, `America/Belem`, `America/Fortaleza`, `America/Recife`, `America/Araguaina`, `America/Maceio`, `America/Bahia`, `America/Sao_Paulo`, `America/Campo_Grande`, `America/Cuiaba`, `America/Santarem`, `America/Porto_Velho`, `America/Boa_Vista`, `America/Manaus`, `America/Eirunepe`, `America/Rio_Branco`. Padrão: `America/Sao_Paulo`. Nenhuma validação de coerência entre UF e fuso.
  - Exibição: sempre no fuso da sessão (o do local), sem converter para o fuso do navegador, na vitrine, na página e na área do produtor.
  - Entrada: datas e horas digitadas pelo produtor são interpretadas no fuso do local escolhido para a sessão.
- **Justificativa:** a Ticketmaster guarda o instante e o fuso no objeto de datas (`dates.timezone`, `start.dateTime` + `localDate`/`localTime`, [SDK oficial](https://code.ticketmaster.com/Android-Ignite-Retail-SDK/docs/discoveryAPI/-ticketmaster%20-discovery%20-a-p-i/com.ticketmaster.discoveryapi/-event-dates-response/index.html)) e exibe o horário local do evento. A lista completa do tzdb custa o mesmo que quatro fusos "representativos" e continua certa se uma região voltar a ter horário de verão. Copiar o fuso para a sessão permite editar o fuso do local sem mover o horário exibido de sessões já criadas, e sem validação entre agregados ("o local tem sessões?").
- **Impacto:** OQ-11; OQ-30 (comparação com "agora" usa o instante); OQ-57 (sem filtro de datas, nenhum cálculo de "dia" no fuso); OQ-75 (ver conflitos: converter `datetime-local` no fuso do local exige cálculo de fuso fora do fuso do navegador).
- **Confiança:** alta em B; média na cópia do fuso para a sessão.

## Bloco N3 — Setores, planta e assentos

### OQ-14 Onde vivem os setores?
- **Proposta:** A, com cópia (OQ-16 = A). A planta (setores-modelo) fica no local; ao agendar uma sessão, ela recebe uma cópia de todos os setores da planta, com IDs novos; os lotes pertencem ao setor da sessão.
- **Justificativa:** concilia as duas linhas do glossário (`:9` planta no local; `:11` setor "para uma sessão"). A Ticketmaster mantém o mapa (manifesto) ligado ao local e configurado por evento; a Eventbrite monta o mapa dentro do evento (de memória e pela [ajuda de assento marcado](https://www.eventbrite.com/help/en-us/articles/683914/)). Com a cópia, tudo o que é vendável vive dentro do agregado `Event`, o que dá ao Inventory (Fase 4) identidade estável de sessão + setor.
- **Impacto:** OQ-15, OQ-16, OQ-60 (A), OQ-62 (o local continua sendo outro agregado para nome e endereço).
- **Confiança:** alta.

### OQ-15 A sessão pode usar só parte da planta?
- **Proposta:** variante de B, em termos de presença em vez de flag. A sessão nasce com cópia de **todos** os setores da planta. Enquanto a sessão está em Rascunho, o produtor pode **remover** um setor da sessão (os lotes dele vão junto) e **adicionar** à sessão um setor da planta que não esteja nela (nova cópia, ID novo). Capacidade e layout da cópia não são editáveis. Depois de publicada, nada muda (OQ-50).
- **Justificativa:** a OQ-2 C já decidiu "remover setor enquanto rascunho"; com cópia, remover é o jeito natural de não vender um setor. Um flag ativo/inativo deixaria setores "mortos" no contrato e no Inventory. "Adicionar setor da planta" desfaz uma remoção por engano e permite usar um setor criado na planta depois do agendamento, com a mesma lógica de cópia.
- **Valores:** a sessão não pode ter duas cópias do mesmo setor da planta, nem dois setores com o mesmo nome (sem diferenciar maiúsculas, após trim).
- **Impacto:** OQ-61 (sem `SetSessionSectorActive`; entram adicionar e remover setor da sessão); OQ-44 (publicação exige pelo menos um setor).
- **Confiança:** média (troca a recomendação "desativar" por "remover/adicionar").

### OQ-16 O que acontece com as sessões quando a planta muda?
- **Proposta:** A. A sessão copia a planta quando é agendada (e cada setor, quando adicionado à sessão). Mudanças posteriores na planta (adicionar ou remover setor-modelo) não afetam sessões existentes.
- **Justificativa:** P1 e R-16. A Eventbrite não deixa ligar assento marcado num evento que já tem ingressos ([ajuda](https://www.eventbrite.com/help/en-us/articles/683914/)), o mesmo espírito de "o vendável não muda por baixo".
- **Impacto:** a planta pode ser editada sempre, sem validação entre agregados; OQ-62 (planta não precisa de fan-out para eventos).
- **Confiança:** alta.

### OQ-17 Campos do setor
- **Proposta:** A, sem descrição nem atributos visuais. Sem edição de setor-modelo: para corrigir, remove e adiciona de novo (a cópia isola as sessões).
- **Valores:**

| Campo | Regra |
|---|---|
| `name` | obrigatório; trim; 1 a 50 caracteres; único na planta, sem diferenciar maiúsculas |
| `kind` | `seated` (assento marcado) ou `general_admission` (pista) |
| `capacity` | só pista; inteiro, limites da OQ-21 |
| `rows` | só assento marcado; formato da OQ-19; capacidade = soma dos assentos |

  Ordem de exibição = ordem de cadastro na planta; a cópia na sessão mantém essa ordem.
- **Justificativa:** Eventbrite distingue seção de assento marcado e de pista no mesmo mapa ([ajuda](https://www.eventbrite.com/help/en-us/articles/683914/)). Cor e posição no mapa são do mapa visual da Fase 4.
- **Impacto:** OQ-61 (sem command de edição de setor-modelo).
- **Confiança:** alta.

### OQ-18 Layout dos assentos já na Fase 2?
- **Proposta:** A, com a grade simples da OQ-19.
- **Justificativa:** P2 e P4. O Catalog é dono do que existe (`docs/architecture/overview.md:53`); quem define quais assentos existem é o dono do local, não o Inventory. Em B, a capacidade numérica de agora teria de ser reconciliada com o layout da Fase 4 (duas fontes para o mesmo número), e o evento público mudaria de versão. O custo é um editor de filas no formulário de setor marcado (lista de "rótulo + quantidade").
- **Impacto:** OQ-19, OQ-21; OQ-61 (os eventos de setor carregam as filas); trilha de frontend (`useFieldArray`).
- **Confiança:** média (Backend e Frontend preferiam B; a escolha pesa no formulário).

### OQ-19 Formato do layout
- **Proposta:** A. Lista ordenada de filas; cada fila tem rótulo e quantidade de assentos, numerados de 1 a N. Assento = (fila, número).
- **Valores:** rótulo da fila com trim, 1 a 3 caracteres, só letras sem acento e dígitos (`A-Z`, `0-9`), gravado em maiúsculas, único no setor; quantidade por fila nos limites da OQ-21; a ordem das filas é a informada.
- **Justificativa:** cobre teatro e arena sem desenhar mapa. Assentos inexistentes, numeração par/ímpar e coordenadas ficam para a Fase 4 se o mapa pedir; acrescentar campo opcional depois não quebra o contrato.
- **Impacto:** a unique `(session_id, seat_id)` da Fase 4 (regra 4) pode usar `fila + número` como identidade estável, porque o layout de sessão publicada não muda (OQ-50).
- **Confiança:** alta.

### OQ-20 Assentos de acessibilidade
- **Proposta:** A. Fora da Fase 2, registrado como lacuna consciente.
- **Justificativa:** a Lei 13.146/2015 exige espaços reservados, mas a regra de venda (reserva, acompanhante) é de Inventory e Ordering. Marcar assento como acessível depois é um campo opcional nas filas, sem quebrar o contrato.
- **Impacto:** nenhum agora; candidato a fase futura no roadmap.
- **Confiança:** alta.

### OQ-21 Limites numéricos de setores e capacidade
- **Proposta:** A, com valores menores que os sugeridos no Research, para manter pequeno o agregado `Event` (carregado inteiro a cada command) e o documento `session_seat_map` da Fase 4 (limite de 16 MB).
- **Valores:**

| Limite | Valor |
|---|---|
| Setores por planta | 1 a 20 (o local pode ser cadastrado sem setores, mas só pode receber sessão com pelo menos 1) |
| Capacidade de pista | 1 a 50.000 |
| Filas por setor marcado | 1 a 50 |
| Assentos por fila | 1 a 100 (até 5.000 por setor marcado) |
| Sessões por evento | até 50 (OQ-31) |
| Lotes por setor da sessão | 1 a 10 (OQ-34) |

  Pior caso de assento marcado numa sessão: 20 × 5.000 = 100.000 assentos, ordem de grandeza de alguns MB por documento, abaixo dos 16 MB.
- **Justificativa:** um estádio grande cabe com vários setores; os limites existem para o estudo, não para o mercado.
- **Impacto:** OQ-31, OQ-34; R-17.
- **Confiança:** média (números são escolha do usuário).

## Bloco N4 — Evento

### OQ-22 Campos do evento e limites
- **Proposta:** A, com **todos os campos obrigatórios já na criação** (exceto imagem). O rascunho nunca fica com campo obrigatório vazio, e a publicação não precisa checar campos do evento.
- **Valores:**

| Campo | Regra |
|---|---|
| `title` | obrigatório; trim; 1 a 120 caracteres; títulos repetidos permitidos |
| `description` | obrigatório; texto puro com quebras de linha preservadas (sem markdown nem HTML); trim; 1 a 5.000 caracteres |
| `category` | obrigatório; OQ-23 |
| `ageRating` | obrigatório; OQ-24 |
| `imageUrl` | opcional; OQ-25 |

- **Justificativa:** menos estados (não existe "rascunho incompleto"); texto puro evita sanitização de HTML. Atrações, tags e políticas (C) não acrescentam aprendizado.
- **Impacto:** OQ-44 (o requisito "campos preenchidos" vale sempre); OQ-57 (busca no título).
- **Confiança:** alta no formato; média nos tamanhos.

### OQ-23 Categoria
- **Proposta:** A. Lista fixa, com código em inglês no contrato e rótulo em PT-BR no web.
- **Valores:** `show` (Shows), `theater` (Teatro e espetáculos), `stand_up` (Stand-up), `sports` (Esportes), `festival` (Festivais), `kids` (Infantil), `other` (Outros).
- **Justificativa:** a Sympla usa categorias fixas na vitrine (Festas e Shows, Teatros e espetáculos, Stand up comedy, Esporte, Infantil...; [vitrine por categoria](https://www.sympla.com.br/eventos/infantil/este-mes)); a Ticketmaster usa classificação fixa (segmento e gênero, [SDK](https://code.ticketmaster.com/Android-Ignite-Retail-SDK/docs/discoveryAPI/-ticketmaster%20-discovery%20-a-p-i/com.ticketmaster.discoveryapi/-discovery-event-details-response/index.html)). A lista cobre o que o Stubb vende (presencial, com setor e lote); cursos, congressos e gastronomia ficam em "Outros".
- **Impacto:** OQ-57 (filtro por categoria); OQ-25 (placeholder por categoria). Acrescentar categoria depois muda o enum do contrato e o projector ao mesmo tempo.
- **Confiança:** média (a lista é gosto do usuário).

### OQ-24 Classificação indicativa
- **Proposta:** A. Obrigatória, com as faixas oficiais; nenhum controle de idade na compra.
- **Valores:** `L` (Livre), `10`, `12`, `14`, `16`, `18`, com rótulos "Livre" e "N anos" no web. Exibida na página do evento.
- **Justificativa:** o ECA (art. 74, parágrafo único) obriga o responsável pelo espetáculo a informar a faixa etária em local visível; a Portaria MJ 1.189/2018 regulamenta as faixas ([CNJ](https://www.cnj.jus.br/wp-content/uploads/2019/09/Aspectos-protetivos-da-política-pública-da-Classificação-Indicativa-Eduardo-Nepomuceno.pdf)). Custa um campo.
- **Impacto:** OQ-54 (não entra no card; entra na página).
- **Confiança:** alta.

### OQ-25 Imagem do evento
- **Proposta:** A. URL externa opcional; sem upload.
- **Valores:** só `https://`; até 2.048 caracteres; o servidor não baixa nem verifica a imagem. Sem imagem, ou se ela não carregar, o web mostra um placeholder por categoria (arquivos estáticos do `apps/web`). O texto alternativo da imagem é o título do evento.
- **Justificativa:** não adiciona infraestrutura (upload exigiria storage novo, fora da stack). O seed não usa imagem para não depender de host externo.
- **Impacto:** OQ-54 (B: card com imagem).
- **Confiança:** alta.

### OQ-26 Todo evento é presencial?
- **Proposta:** A. Sim; toda sessão tem local.
- **Justificativa:** evento online não tem setor nem assento, e o foco do estudo é a concorrência por lugar (Fase 4).
- **Impacto:** `venueId` obrigatório na sessão.
- **Confiança:** alta.

### OQ-27 Festival de vários dias e passaporte
- **Proposta:** A. Fora. Cada dia de festival é uma sessão vendida separadamente.
- **Justificativa:** um passaporte reservaria lugar em vários agregados de inventário de uma vez e mudaria a concorrência da Fase 4. A Ticketmaster marca evento de vários dias com `spanMultipleDays`, mas vende por data.
- **Impacto:** nenhum.
- **Confiança:** alta.

## Bloco N5 — Sessão

### OQ-28 Sessões do mesmo evento em locais diferentes?
- **Proposta:** A. Sim; o local é da sessão.
- **Justificativa:** turnês (o seed tem uma, OQ-8). Com OQ-14 = A, os setores já são por sessão. A vitrine mostra o local da próxima sessão (OQ-54) e o filtro de cidade acha o evento se qualquer sessão futura publicada for na cidade (OQ-57).
- **Impacto:** OQ-54, OQ-57; OQ-62 (um evento referencia vários locais).
- **Confiança:** alta.

### OQ-29 Horários da sessão
- **Proposta:** A, mais o início das vendas da OQ-41. Campos de tempo da sessão: `startsAt` (início) e `salesStartsAt` (início das vendas). Sem término e sem abertura dos portões.
- **Justificativa:** nenhuma regra proposta usa o término (a sessão sai da vitrine quando começa, OQ-53). Término e abertura dos portões são acréscimos opcionais futuros, sem quebrar o contrato. A Ticketmaster também trata o término como opcional ([SDK](https://code.ticketmaster.com/Android-Ignite-Retail-SDK/docs/discoveryAPI/-ticketmaster%20-discovery%20-a-p-i/com.ticketmaster.discoveryapi/-event-dates-response/index.html)).
- **Impacto:** OQ-41, OQ-75.
- **Confiança:** alta.

### OQ-30 Quando uma sessão pode acontecer?
- **Proposta:** A. Ao agendar, `startsAt` precisa ser posterior ao "agora" do write-service; sem limite máximo. A mesma checagem se repete ao publicar (OQ-44), porque a sessão pode ficar em rascunho até a data passar.
- **Justificativa:** nenhuma fonte pede antecedência mínima. Como sessão não é editável (OQ-49), não há "editar para o passado".
- **Impacto:** OQ-44; o relógio do write-service decide (regra 1: decisão no write side).
- **Confiança:** alta.

### OQ-31 Quantidade de sessões e conflitos
- **Proposta:** A, com até **50** sessões por evento (em vez de 100). Rascunho pode ter zero sessões. Duas sessões do mesmo evento não podem ter o mesmo local e o mesmo `startsAt`. Conflito de agenda do local com outros eventos não é validado.
- **Justificativa:** 50 temporadas de teatro cabem; o limite segura o tamanho do agregado (OQ-21). Conflito com outros eventos seria validação entre agregados sem ganho de aprendizado.
- **Impacto:** OQ-21, OQ-60.
- **Confiança:** média no número.

## Bloco N6 — Lote e preço

### OQ-32 A que o lote pertence?
- **Proposta:** A. Ao setor de uma sessão; cada sessão tem os próprios lotes. "Copiar lotes de outra sessão" fica fora da Fase 2 (o seed faz por script).
- **Justificativa:** casa com o agregado de inventário por sessão + setor (`CLAUDE.md:44`) e com o entendimento de que a cota de meia-entrada vale por noite ([MP-MA](https://cdn-0.mpma.mp.br/publicacoes/20342/7b596b4eeb3a6ccc74aaeaa89afb5c1e.pdf)), o que a Fase 5 vai precisar por sessão.
- **Impacto:** OQ-34 a OQ-38.
- **Confiança:** alta.

### OQ-33 Como funciona a virada de lote?
- **Proposta:** A (sequencial), com D explícita: na Fase 2 só a virada por data tem efeito; a virada por quantidade passa a valer quando houver venda (Fase 5).
- **Regra proposta:**
  1. Os lotes de um setor da sessão têm ordem (a ordem de cadastro).
  2. As vendas do setor começam em `salesStartsAt` da sessão (OQ-41), e só depois da publicação.
  3. O 1º lote começa quando as vendas começam; cada lote seguinte começa quando o anterior termina.
  4. Um lote termina quando chega o seu `endsAt` (se tiver) **ou** quando vende a sua `quantity` (se tiver), o que vier primeiro.
  5. Lote vigente = o primeiro, na ordem, que ainda não terminou. Se um lote termina por data antes de outro anterior acabar, ele é pulado.
  6. Quando o último lote termina, as vendas do setor acabam ("vendas encerradas"), mesmo com capacidade sobrando. Se o último lote não tem `quantity` nem `endsAt`, vende até o início da sessão ou até a capacidade do setor acabar.
- **Justificativa:** a Eventbrite modela exatamente as duas viradas: janela por data (`sales_start`/`sales_end`) e "começa quando o outro esgota" (`sales_start_after`) ([ticket classes](https://amp.eventbrite.es/platform/docs/ticket-classes), [schema](https://fivetran.com/docs/connectors/applications/eventbrite/connector-schema)); a Sympla tem virada de lote como recurso central do produtor. Sequencial não deixa intervalo sem venda entre lotes (diferente de B).
- **Impacto:** OQ-34, OQ-36, OQ-37; OQ-70 (o vigente é derivado na query, com o `now` do read-service).
- **Confiança:** média (é a regra de negócio mais densa; o usuário deve conferir os itens 5 e 6).

### OQ-34 Campos do lote
- **Proposta:** variante de A. Nenhum lote tem data de início própria (o início vem da sessão e do lote anterior, OQ-33).
- **Valores:**

| Campo | Regra |
|---|---|
| `name` | obrigatório; trim; 1 a 50 caracteres; único no setor da sessão, sem diferenciar maiúsculas (ex.: "1º lote", "Promocional") |
| `priceCents` | obrigatório; OQ-39 |
| `quantity` | opcional; inteiro de 1 até a capacidade do setor; OQ-36 |
| `endsAt` | opcional; instante; depois de `salesStartsAt` e antes de `startsAt` da sessão; depois do `endsAt` de qualquer lote anterior que tenha data |
| ordem | implícita (ordem de cadastro); sem reordenação |

  Validação ao adicionar um lote: o lote que era o último precisa ter `quantity` ou `endsAt`; senão o novo lote nunca ficaria vigente. Limite de 10 lotes por setor (OQ-21).
- **Justificativa:** um campo de data a menos que a opção A do Research, e "início das vendas" fica num lugar só (a sessão). Como a OQ-2 C não prevê edição de lote, corrigir é remover e cadastrar de novo; o nome único ajuda o produtor a não duplicar.
- **Impacto:** OQ-41; OQ-74 e OQ-75 (formulário do lote: preço, quantidade e data opcionais).
- **Confiança:** média.

### OQ-35 Mais de um lote vigente no mesmo setor?
- **Proposta:** A. Não; no máximo um lote vigente por setor da sessão (decorre da regra sequencial).
- **Justificativa:** lotes paralelos ("promocional" e "regular" ao mesmo tempo) são tipos de ingresso, outro conceito, que a Fase 5 pode trazer junto com a meia-entrada.
- **Impacto:** nenhum.
- **Confiança:** alta.

### OQ-36 Quantidade dos lotes x capacidade do setor
- **Proposta:** variante entre A e C. `quantity` é **teto do próprio lote** e é opcional em qualquer lote; a soma das quantidades informadas no setor não pode passar da capacidade do setor; a capacidade do setor continua sendo o teto real (controlado pelo Inventory na Fase 4).
- **Justificativa:** com o teto por lote, a Fase 5 conta vendas por lote (o `organizer_sales` da Fase 7 já é "vendas por lote", `docs/architecture/overview.md:101`), sem somatórios acumulados. Exigir quantidade em todos menos o último (A) obrigaria o produtor a apagar e recriar lotes quando acrescenta um novo, já que lote não é editável (OQ-2 C).
- **Impacto:** OQ-33 (item 6), OQ-37.
- **Confiança:** média.

### OQ-37 Sobra de lote virado por data
- **Proposta:** A, na forma que decorre do teto por lote: o que não foi vendido num lote encerrado por data continua na capacidade do setor e é vendido pelos lotes seguintes, ao preço deles. O teto do lote seguinte não aumenta.
- **Justificativa:** a capacidade do setor nunca diminui por causa da virada; fechar agora deixa estável o significado de `quantity` no contrato ("máximo vendido neste lote").
- **Impacto:** Fase 5 (contagem por lote).
- **Confiança:** média.

### OQ-38 Lote em setor marcado vale para qualquer assento?
- **Proposta:** A. Sim; o lote conta assentos vendidos no setor, qualquer que seja a posição.
- **Justificativa:** preço por região se resolve com setores diferentes (como a Ticketmaster anuncia preço por setor).
- **Impacto:** nenhum.
- **Confiança:** alta.

### OQ-39 Preço
- **Proposta:** A. Só BRL; inteiro em centavos; o preço cadastrado é o da **inteira**, sem taxa.
- **Valores:** `priceCents` inteiro de 1 a 10.000.000 (R$ 0,01 a R$ 100.000,00). Sem ingresso gratuito na Fase 2.
- **Justificativa:** a Ticketmaster Brasil anuncia por setor o preço da inteira e da meia, e a taxa à parte ([Rolling Stone](https://rollingstone.com.br/musica/quanto-custam-os-ingressos-para-o-show-do-jonas-brothers-no-brasil/)); meia e taxa são calculadas sobre a inteira na Fase 5 (arredondamento de centavo ímpar é assunto de lá). Permitir preço zero depois é afrouxar a regra (P1), sem quebrar nada.
- **Impacto:** OQ-74 (entrada `1.234,56` → centavos); OQ-55.
- **Confiança:** alta no formato; média no teto.

### OQ-40 Preço precisa crescer entre lotes?
- **Proposta:** A. Não validar.
- **Justificativa:** nenhuma fonte exige; lote promocional mais barato depois de um lote regular é decisão do produtor.
- **Impacto:** nenhum.
- **Confiança:** alta.

### OQ-41 Período de vendas da sessão
- **Proposta:** C, com o início das vendas **na sessão** (não no 1º lote): `salesStartsAt` obrigatório, anterior a `startsAt`, podendo estar no passado (significa "assim que publicar"). Vendas abertas = sessão publicada **e** `salesStartsAt` ≤ agora < `startsAt` **e** existe lote vigente. As vendas terminam no início da sessão; nenhum `endsAt` de lote pode passar de `startsAt`.
- **Justificativa:** "publicar é o que expõe à venda" (C) evita venda de rascunho. Um único início por sessão deixa a regra num lugar só e permite anunciar a sessão antes de abrir as vendas, como a "venda geral a partir de" da Ticketmaster Brasil. Encerrar no início da sessão é mais simples que o padrão da Eventbrite (1 h antes, [ticket classes](https://amp.eventbrite.es/platform/docs/ticket-classes)).
- **Impacto:** OQ-34 (lote sem data de início); OQ-56 ("vendas a partir de"); OQ-70 ("vendas abertas" derivado); OQ-75 (dois campos de data e hora no formulário de sessão).
- **Confiança:** média (muda onde fica o início das vendas em relação ao Research).

### OQ-42 Meia-entrada, cota, taxa e limite por CPF fora da Fase 2?
- **Proposta:** A. Totalmente fora; nenhum campo agora.
- **Justificativa:** campo sem regra é suposição sobre a Fase 5. Duas notas para a Fase 5: (1) o Decreto 13.108/2026 exige preço total com taxas discriminadas desde a oferta ([Senado](https://legis.senado.leg.br/norma/43734342/publicacao/43735985)), o que vai afetar o "a partir de R$ X" da vitrine; (2) a cota de 40% de meia vale por evento e, segundo o MP-MA, por noite, o que encaixa no lote por sessão (OQ-32).
- **Impacto:** OQ-55 (sem taxa na Fase 2).
- **Confiança:** alta.

## Bloco N7 — Ciclo de vida

### OQ-43 Estados do evento
- **Proposta:** A, ajustada à publicação por sessão (OQ-51 = B):
  - Evento: **Rascunho → Publicado**. O evento passa a Publicado quando a **primeira sessão é publicada**; não existe command separado de publicar evento. Não volta a Rascunho.
  - Sessão: **Rascunho → Publicada**.
  - "Sessão encerrada" (já começou) e "evento encerrado" (todas as sessões publicadas já começaram) são **derivados do relógio**, nunca gravados (P3).
  - Sem Cancelado na Fase 2 (OQ-47).
- **Justificativa:** a Eventbrite separa status gravados (`draft`, `live`, `canceled`) de status que dependem do relógio (`started`, `ended`) ([status](https://www.eventbrite.co/platform/docs/events)). Publicar por sessão dá um único command de publicação, uma única invariante de "sessão completa" e um evento público por sessão, que é o gatilho do Inventory na Fase 4 (P4). Um `PublishEvent` que publica várias sessões de uma vez exigiria que todas estivessem completas, ou regras para as incompletas.
- **Alternativa, se o usuário preferir publicação explícita do evento:** `PublishEvent` publica o evento e todas as sessões, exigindo todas completas; sessões novas depois disso se publicam uma a uma. Custa um command e uma regra a mais.
- **Impacto:** OQ-44, OQ-46, OQ-49, OQ-51, OQ-53; OQ-61 e OQ-63 (ver conflitos: como o evento fica "Publicado" sem um segundo evento de domínio no mesmo command).
- **Confiança:** média (desvio em relação à opção A do Research, que previa publicação do evento).

### OQ-44 O que é exigido para publicar?
- **Proposta:** A, aplicada à **sessão**. Para publicar uma sessão:
  1. a sessão está em Rascunho;
  2. `startsAt` é posterior a agora;
  3. a sessão tem pelo menos 1 setor;
  4. cada setor da sessão tem pelo menos 1 lote;
  5. nenhum lote tem `endsAt` no passado (a sessão ficou em rascunho e a data venceu: o produtor remove o lote e cadastra de novo);
  6. as regras de lote da OQ-34 e da OQ-36 continuam valendo (já checadas no cadastro, checadas de novo aqui).
  Os campos do evento já são obrigatórios na criação (OQ-22).
- **Justificativa:** toda sessão visível na vitrine fica vendável quando houver venda; a invariante vive inteira dentro do agregado `Event` (OQ-60 A).
- **Impacto:** OQ-82 (cada item vira um `code` de erro de regra de negócio).
- **Confiança:** alta.

### OQ-45 Publicação agendada?
- **Proposta:** A. Só imediata.
- **Justificativa:** o momento em que as vendas abrem já é controlado por `salesStartsAt` (OQ-41); agendar a publicação exigiria scheduler.
- **Impacto:** nenhum.
- **Confiança:** alta.

### OQ-46 Despublicar?
- **Proposta:** A. Não; nem evento nem sessão voltam a rascunho.
- **Justificativa:** na Eventbrite, despublicar um evento com pedidos exige reembolsar antes ([ajuda](https://www.eventbrite.com/help/en-us/articles/895183/)), ou seja, é uma regra que depende de venda (Fase 5/7). P1: liberar depois é só acrescentar.
- **Impacto:** nenhum.
- **Confiança:** alta.

### OQ-47 Cancelar evento na Fase 2?
- **Proposta:** C. Não; entra na Fase 7.
- **Justificativa:** na Fase 7 o cancelamento ganha reembolso e aviso aos compradores (Eventbrite: status "Cancelled" + e-mail + reembolso; Decreto 13.108/2026: devolução integral, inclusive taxas). Na Fase 2 seria só um estado.
- **Impacto:** nenhum.
- **Confiança:** alta.

### OQ-48 Cancelar ou remarcar sessão na Fase 2?
- **Proposta:** A. Não; fica com a Fase 7.
- **Justificativa:** mudança de data ou local é "alteração relevante" pelo Decreto 13.108/2026 e dá ao consumidor direito a reembolso, nova data ou crédito ([Consumidor Moderno](https://consumidormoderno.com.br/novo-decreto-compra-ingressos-regras/)): é um fluxo com efeitos sobre compradores, tema da Fase 7.
- **Impacto:** OQ-50 (data e local de sessão publicada não mudam).
- **Confiança:** alta.

### OQ-49 O que pode ser excluído?
- **Proposta:** A, ajustada à OQ-2 C e à publicação por sessão:

| O quê | Quando | Efeito |
|---|---|---|
| Evento | só em Rascunho (nenhuma sessão publicada) | descartado em definitivo: sai das listas do produtor e de todos os read models; a página pública já dava 404 e continua |
| Sessão | só em Rascunho (mesmo com o evento publicado) | sai junto com setores e lotes |
| Setor da sessão | só com a sessão em Rascunho | sai junto com os lotes |
| Lote | só com a sessão em Rascunho | os demais mantêm a ordem relativa |
| Setor da planta | sempre | sessões já agendadas não mudam (OQ-16) |
| Local | nunca na Fase 2 | evita checar "nenhuma sessão usa este local" entre agregados |

- **Justificativa:** corrige erro de cadastro sem apagar nada que já foi público. A Eventbrite também só exclui evento despublicado e sem pedidos ([ajuda](https://www.eventbrite.com/help/en-us/articles/172435/)). Excluir local não está na OQ-2 C.
- **Interpretação a confirmar:** a OQ-2 C fala em "edição dos dados descritivos". Esta proposta lê isso como (1) dados do evento e (2) dados do local, e **não** inclui editar sessão (horários) nem lote (preço, quantidade, data): para corrigir, remove e cadastra de novo. Se o usuário quiser editar sessão e lote em rascunho, são dois commands a mais, sem impacto no contrato das Fases 4 e 5.
- **Impacto:** OQ-61 (lista de capacidades no topo); OQ-80 (`DELETE` nas rotas); OQ-62 (descarte apaga o documento do read model).
- **Confiança:** média (por causa da interpretação).

## Bloco N8 — Edição depois da publicação

### OQ-50 O que pode ser editado depois de publicar?
- **Proposta:** variante mais restrita que B. **Sessão publicada fica congelada**: não muda data, início das vendas, local, setores nem lotes; não é removida.
  - Sempre editável, publicado ou não: dados do evento (título, descrição, categoria, classificação, imagem) e dados do local (nome, endereço, cidade, UF, fuso).
  - Evento publicado pode receber **sessões novas**, que nascem em Rascunho e são publicadas uma a uma (OQ-51).
  - A edição do local aparece em todas as sessões que o usam (é correção do mesmo lugar físico); o fuso, por ser copiado, não muda sessões já agendadas (OQ-13).
- **Justificativa:** P1. Na Fase 5, regras como "não altera lote já iniciado" dependem de vendas (o lote pode ter começado por esgotamento do anterior), dado que é do Inventory/Ordering e que o Catalog não pode ler (regra 10). Congelar agora não depende de nada, e afrouxar na Fase 5 ("pode acrescentar lote" ou "pode abrir setor") é só acrescentar um command. Data e local são "alteração relevante" pelo Decreto 13.108/2026 (Fase 7).
- **Impacto:** OQ-64 (só edição de evento e de local leva versão esperada vinda do cliente); OQ-62 (edição de local precisa chegar aos documentos de evento: lookup ou fan-out).
- **Confiança:** média (mais restritivo que a recomendação do Research, que permitia lotes e setores novos em sessão publicada).

### OQ-51 Sessão adicionada a evento publicado nasce publicada?
- **Proposta:** B. A sessão tem estado próprio (Rascunho/Publicada) e é publicada separadamente, com os requisitos da OQ-44. Com a OQ-43 proposta, isso vale para **todas** as sessões, inclusive as do evento ainda em rascunho.
- **Justificativa:** permite montar a sessão aos poucos sem expor sessão incompleta, e é a base da publicação por sessão.
- **Impacto:** OQ-43, OQ-44, OQ-53 (página pública mostra só sessões publicadas).
- **Confiança:** alta em B.

## Bloco N9 — Vitrine e página do evento

### OQ-52 A vitrine lista eventos ou sessões?
- **Proposta:** A. Um card por evento; a página do evento lista as sessões.
- **Justificativa:** padrão de Sympla e Eventbrite; um documento por evento no `event_listing`.
- **Impacto:** OQ-54, OQ-57.
- **Confiança:** alta.

### OQ-53 O que aparece e quando some
- **Proposta:**
  - (a) A: a vitrine mostra eventos com **pelo menos uma sessão publicada que ainda não começou**.
  - (b) ii: na página, sessão publicada que já começou aparece como "Sessão encerrada", sem lotes nem preço. Sessões em rascunho nunca aparecem na página pública.
  - (c) 1: o evento sai da vitrine quando começa a última sessão publicada.
  - (d) x: a página de evento encerrado continua acessível pela URL, com "Evento encerrado".
  - (e) p: evento em Rascunho (nenhuma sessão publicada) ou descartado dá 404 na rota pública.
- **Justificativa:** P3: tudo o que depende de "já começou" é calculado na query com o `now` do read-service (R-10). Manter a página do encerrado acessível preserva links compartilhados.
- **Impacto:** OQ-66 e OQ-69 (o read model público precisa do status de cada sessão); OQ-70 (A).
- **Confiança:** alta.

### OQ-54 O que o card mostra
- **Proposta:** B. Imagem (ou placeholder por categoria), título, rótulo da categoria, nome do local + cidade/UF da **próxima sessão** publicada não iniciada, data e hora dessa sessão (no fuso dela), "+N datas" quando houver outras sessões futuras publicadas, e o preço da OQ-55.
- **Justificativa:** mostra a desnormalização (local e preço dentro do documento do evento). Classificação fica na página (OQ-24), para o card não crescer.
- **Impacto:** OQ-62 (nome e cidade do local no `event_listing`), OQ-70.
- **Confiança:** alta.

### OQ-55 Qual preço a vitrine mostra
- **Proposta:** A. "A partir de R$ X", com X = menor `priceCents` entre os lotes **vigentes agora**, em todos os setores das sessões publicadas não iniciadas com vendas abertas. Sem lote vigente: "Vendas a partir de dd/mm" (o menor `salesStartsAt` futuro entre essas sessões) ou, se as vendas já acabaram em todas, "Vendas encerradas". Sem taxa (Fase 5).
- **Justificativa:** é o preço que o comprador pagaria agora; a Ticketmaster também expõe faixa mínima e máxima de preço no evento (`priceRanges`, [SDK](https://code.ticketmaster.com/Android-Ignite-Retail-SDK/docs/discoveryAPI/-ticketmaster%20-discovery%20-a-p-i/com.ticketmaster.discoveryapi/-discovery-event-details-response/index.html)). Na Fase 5, o Decreto 13.108/2026 vai exigir preço total com taxa desde a oferta.
- **Impacto:** OQ-70 (cálculo na query); OQ-57 (sem ordenação por preço).
- **Confiança:** alta.

### OQ-56 O que a página mostra de setores e lotes
- **Proposta:** consolidada do Research. Página pública: por sessão publicada (ordem de `startsAt`) e por setor (ordem da planta), o tipo do setor ("Assento marcado" ou "Pista") e **só o lote vigente** (nome e preço); sem lote vigente, "Vendas a partir de dd/mm HH:mm" ou "Vendas encerradas". Sem capacidade nem disponibilidade (Fase 4). Área do produtor: a sequência completa de lotes de cada setor, com selo derivado (Encerrado, Vigente, Em breve), mais o status da sessão (Rascunho, Publicada).
- **Justificativa:** a Ticketmaster Brasil anuncia preço por setor; o comprador precisa do preço atual, e o histórico serve ao produtor (e mostra a virada de lote, que é didática).
- **Impacto:** OQ-66/OQ-69 (o documento de gestão precisa de todos os lotes e do status da sessão); OQ-70.
- **Confiança:** alta.

### OQ-57 Busca, filtros e ordenação
- **Proposta:**
  - Busca: b) palavra no título do evento, sem diferenciar maiúsculas e acentos, por palavra inteira (sem prefixo: "roc" não acha "rock").
  - Filtros: i) cidade e iii) categoria, combináveis com a busca. Cidade digitada em texto livre e comparada por igualdade depois de normalizar (trim, minúsculas, sem acento): "sao paulo" acha "São Paulo". O evento entra se **qualquer** sessão publicada não iniciada for na cidade. Sem filtro de datas.
  - Ordenação: 1) fixa, pela próxima sessão publicada não iniciada, mais cedo primeiro; desempate por título e depois pelo ID (ordem estável para paginar).
- **Justificativa:** a Sympla filtra a vitrine por cidade e por categoria ([vitrine](https://www.sympla.com.br/eventos/sao-paulo-sp/hoje)). Cidade em texto livre evita uma query extra só para listar cidades; a alternativa mais simples ainda é um filtro por UF (27 valores fixos).
- **Impacto:** OQ-71 (índice de texto só no título); OQ-86 (índices de cidade normalizada e categoria); OQ-70 (a ordenação depende de "agora"; ver conflitos).
- **Confiança:** média (forma do filtro de cidade).

### OQ-58 Paginação
- **Proposta:** A na API (`page`, `pageSize`; resposta com `items`, `page`, `pageSize`, `total`) + y na UI ("Carregar mais" com `useInfiniteQuery`).
- **Valores:** `pageSize` padrão **12**, máximo **48**; `page` começa em 1. A mesma regra vale para a lista de eventos do produtor (ordenada do mais recente para o mais antigo, com rascunhos). A lista de locais do produtor não pagina (alimenta o select do formulário de sessão; um produtor só).
- **Justificativa:** 12 e 48 dividem por 1, 2, 3 e 4 colunas de cards sem deixar a última linha quebrada. Offset combina com ordenação calculada na query; keyset fica para a Fase 9.
- **Impacto:** OQ-69, OQ-93 (sem componente `pagination`, porque a UI é "carregar mais").
- **Confiança:** média nos números.

### OQ-59 Botão de compra nesta fase?
- **Proposta:** A. Sem botão.
- **Justificativa:** o botão entra com o `HoldSeats` na Fase 4; botão desabilitado é UI sem comportamento.
- **Impacto:** nenhum.
- **Confiança:** alta.

---

## Conflitos e pontos de atenção com as OQs técnicas (OQ-60 a OQ-97)

Para o thread principal cruzar com a proposta técnica feita em paralelo.

| OQ técnica | Ponto | O que esta proposta exige ou muda |
|---|---|---|
| OQ-60 | Fronteira | Compatível com A (`Venue` + `Event`). A publicação por sessão mantém a invariante dentro do `Event` |
| OQ-61 | Lista de commands e eventos | **Muda a lista candidata do Research:** sai `PublishEvent` (entra publicar sessão), sai `SetSessionSectorActive` (entram adicionar e remover setor da sessão), saem `UpdateSession`, `UpdateBatch` e edição de setor-modelo, entram editar local, adicionar e remover setor da planta, descartar evento. São 14 capacidades (tabela no topo) |
| OQ-61 / OQ-63 | Evento vira Publicado | Na primeira publicação de sessão, o evento muda de estado. Se a OQ-63 fixar "um evento de domínio por command", o status Publicado do evento precisa ser derivado do evento de publicação de sessão (pelo projector e pelo agregado), sem um `EventPublished` separado. Se a técnica preferir emitir os dois, contraria a convenção da OQ-63 A |
| OQ-61 (payload) | O que o Inventory vai precisar | O evento de publicação de sessão deve carregar o retrato completo da sessão (fuso, `startsAt`, `salesStartsAt`, setores com tipo, capacidade ou filas, lotes com ordem, preço, quantidade e `endsAt`) para inicializar o Inventory na Fase 4 sem consultar o Catalog |
| OQ-62 | Local no read side | Esta proposta diz que a **edição do local aparece nas sessões existentes** (OQ-50). Isso exige lookup + merge (A) ou fan-out (B). Se a proposta técnica escolher "cópia do local na sessão, sem propagação", há conflito: o negócio teria de aceitar que renomear o local não muda sessões já agendadas |
| OQ-64 | Versão esperada vinda do cliente | Só há dois commands de edição: dados do evento e dados do local. Os demais só adicionam ou removem filhos (versão lida no servidor) |
| OQ-66 / OQ-69 | Read models | O documento público precisa do status de cada sessão (filtrar rascunho) e das janelas de venda; o de gestão precisa de todos os lotes e do status. O descarte de evento precisa apagar os documentos |
| OQ-68 | `min_version` | A edição do local afeta a página do evento, mas a versão é do `Venue`: o read-your-writes da edição de local só é garantido na leitura própria do local (C do Research) |
| OQ-70 | Estados do relógio | Tudo derivado na query (A): lote vigente, vendas abertas, sessão e evento encerrados, próxima data, preço "a partir de", visibilidade na vitrine. **Atenção:** a ordenação da vitrine pela próxima sessão não iniciada também depende de "agora", então não usa índice simples; exige agregação na query |
| OQ-71 | Busca | Índice de texto só no título (um por coleção, sem conflito) |
| OQ-72 | Persistência | Descartar evento e remover filhos são exclusões de verdade no negócio; se a técnica preferir soft delete, o read side precisa tratar o descarte do mesmo jeito |
| OQ-73 | Seed | Valor proposto para o default: `0193a4f0-0000-7000-8000-000000000001` |
| OQ-74 | Preço | Faixa R$ 0,01 a R$ 100.000,00 |
| OQ-75 | Data e hora | **Atenção:** `datetime-local` é interpretado no **fuso do local**, não no do navegador. Converter "20:00 em Manaus" para instante no browser exige cálculo de fuso (Intl sozinho não faz a conversão inversa); a alternativa é a API receber data e hora locais e o write-service converter com o fuso do local. Decisão técnica, mas a regra de negócio (fuso do local) não muda |
| OQ-76 | Seed de demonstração | O conteúdo da OQ-8 usa datas relativas a "agora"; com A (script manual, uma vez) não há duplicação |
| OQ-80 | Rotas | Publicar fica em `.../sessions/:sessionId/publish`; adicionar setor à sessão recebe o ID do setor da planta; exclusões por `DELETE`; edições por `PATCH`. O helper do E2E precisa de `PATCH` e `DELETE` (R-38) |
| OQ-82 | Erros | Cada regra das OQ-15, 17, 19, 21, 30, 31, 34, 36, 41, 44, 49 e 50 vira um `code` estável de erro de regra de negócio |
| OQ-86 | Índices | Texto no título, cidade normalizada das sessões e categoria |
| OQ-93 | Componentes | `badge` para os selos de lote e de status; `native-select` para categoria, classificação, UF, fuso e local; sem `pagination` (UI "carregar mais") |
| OQ-95 | Dados de teste | Os E2E criam os próprios eventos com datas futuras relativas e não dependem do seed |

## Reconciliação com `SDD/WORK/2026-10-26-CatalogProposta-Tecnico.md`

A proposta técnica foi escrita antes desta e assumiu as recomendações do Research como premissas (P-1 a P-20, na seção "Premissas de negócio assumidas" dela). Onde esta proposta diverge, a técnica precisa ser ajustada se o usuário aprovar a versão de negócio:

| Premissa técnica | Esta proposta | Efeito na proposta técnica |
|---|---|---|
| P-7: a sessão desativa setores (`DeactivateSessionSector`/`ActivateSessionSector`, campo `active` na cópia) | Remover e adicionar setor da sessão; sem campo `active` (OQ-15) | Trocar os dois commands por adicionar e remover setor da sessão; tirar `active` do payload de `SessionScheduled` |
| P-9: até 50 setores por planta, 100 sessões por evento, 10.000 assentos por setor | 20 setores, 50 sessões, 5.000 assentos por setor (50 × 100), pista até 50.000, 10 lotes por setor (OQ-21, OQ-31) | Só valores nos schemas Zod e nos testes |
| P-11 e P-13: lote com início próprio (opção A do Research) | Início das vendas na sessão (`salesStartsAt`, obrigatório); lote só com `quantity` e `endsAt` opcionais (OQ-34, OQ-41) | `SessionScheduled` ganha `salesStartsAt`; as funções puras da OQ-70 usam o início da sessão para o 1º lote |
| P-14 e P-18, com `PublishEvent` + `PublishSession` | Só publicar sessão; o evento vira Publicado na primeira sessão publicada (OQ-43) | Sai `PublishEvent`/`EventPublished`; o "Risco" da OQ-61 técnica ("publicar evento publica quais sessões?") deixa de existir. O status Publicado do evento é derivado de `SessionPublished` no agregado e no projector (um evento por command, OQ-63 A) |
| P-16: local removível (`RemoveVenue`, lápide `VenueRemoved`) | Local nunca é removido na Fase 2 (OQ-49) | Saem `RemoveVenue`/`VenueRemoved` e a lápide de `venues`; a lápide de `EventDiscarded` (OQ-68 técnica) continua necessária, porque o descarte de evento é exclusão |
| P-17: edição restrita (B do Research), com `UpdateSessionSchedule`, `UpdateBatch` e `UpdateVenueSector` | Sessão publicada congelada; sem edição de sessão, de lote nem de setor-modelo; corrigir = remover e cadastrar de novo (OQ-49, OQ-50) | Saem os três commands de edição e os eventos correspondentes. Sobram só dois commands de edição (dados do evento e do local), os únicos com `expectedVersion` do cliente (OQ-64) |
| P-5: dados do local editáveis | Igual, e o fuso do local também é editável, porque a sessão copia o fuso (OQ-13) | Coerente com a OQ-62 A (lookup + merge) e com a OQ-75 técnica (cópia do fuso em `SessionScheduled`) |

Pontos em que as duas propostas já concordam: OQ-60 A; payload com o estado completo da entidade; `SessionScheduled` com o fuso copiado; OQ-62 A com o local editável; OQ-70 A com ordenação por agregação; OQ-71 só no título; seed `organizerId` fixo e o web sem enviar dono (OQ-73).

Risco que a técnica já aponta e que esta proposta mantém: paginação por offset com ordenação que muda com o tempo pode repetir ou pular um card entre dois "Carregar mais" (OQ-70 técnica, risco 2). Para o estudo, é aceitável.
