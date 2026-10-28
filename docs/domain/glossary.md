# Glossário do domínio

Linguagem ubíqua do Stubb. O termo em inglês é o usado no código.

| Termo | Código | Definição |
|---|---|---|
| Evento | `Event` | O espetáculo vendido (show, peça, jogo). Tem título, descrição, categoria e classificação indicativa, e zero ou mais sessões. Rascunho até a primeira sessão ser publicada; depois, Publicado. Só um evento em Rascunho pode ser descartado. Não confundir com evento de domínio. |
| Evento de domínio | `DomainEvent` | Fato ocorrido no sistema, no passado (`SeatsHeld`). Publicado via outbox. |
| Local | `Venue` | Lugar físico no Brasil onde o evento acontece. Cadastro próprio e reutilizável: nome, endereço, cidade, UF e fuso horário, mais a planta de setores. Pode existir sem setores, mas só recebe sessão com pelo menos um. Nunca é removido. |
| Planta | `Venue.sectors` | Lista de 0 a 20 setores-modelo do local, na ordem de cadastro. É o molde copiado para cada sessão; mudar a planta depois não altera sessões já agendadas. |
| Sessão | `Session` | Uma ocorrência do evento num local, com início (`startsAt`) e início das vendas (`salesStartsAt`). Nasce em Rascunho e é a unidade publicável: ao publicar, fica congelada. Copia a planta e o fuso do local ao ser agendada; datas são exibidas e digitadas nesse fuso. Até 50 por evento. |
| Setor | `Sector` | Área do local, de assento marcado ou de pista. Existe em duas formas: o **setor-modelo** na planta do local (não editável: para corrigir, remove e cadastra de novo) e o **setor da sessão**, uma cópia feita ao agendar (ID novo, mesma ordem), que é o que recebe lotes. Em rascunho, a sessão pode remover um setor copiado ou trazer de volta um da planta. |
| Assento | `Seat` | Lugar numerado (1 a N) dentro de uma fila de um setor de assento marcado. O setor marcado tem de 1 a 50 filas, cada uma com rótulo de 1 a 3 caracteres (`A-Z0-9`) e de 1 a 100 assentos; a capacidade é a soma dos assentos. |
| Pista | `GeneralAdmission` | Setor sem assento numerado; vendido por quantidade. Tem uma capacidade de 1 a 50.000. |
| Lote | `Batch` | Faixa de preço de um setor da sessão, em ordem de cadastro (até 10 por setor). A virada é sequencial: o lote vigente é o primeiro que ainda não terminou. Termina no seu `endsAt` ou ao vender a sua `quantity`, o que vier primeiro (na Fase 2 só a data tem efeito, porque ainda não há venda). `quantity` é teto do lote, e a capacidade do setor continua sendo o teto real; o último lote sem `quantity` nem `endsAt` vende até o início da sessão. |
| Lote vigente | — | O lote em que as vendas estão agora. Derivado do relógio na query, nunca gravado. Só existe depois da publicação e a partir de `salesStartsAt`. |
| Hold | `Hold` | Reserva temporária de assentos ou quantidade, com prazo de expiração, enquanto o cliente paga. |
| Pedido | `Order` | Intenção de compra de um cliente, ligada a um hold e a um pagamento. |
| Pagamento | `Payment` | Cobrança de um pedido, confirmada ou recusada pelo gateway (fake). |
| Ingresso | `Ticket` | Direito de entrada emitido após pedido confirmado, com QR code. |
| Titular | `Holder` | Pessoa (CPF) dona do ingresso; muda na transferência. |
| Transferência | `Transfer` | Troca de titularidade de um ingresso. |
| Check-in | `CheckIn` | Validação do ingresso na portaria; um ingresso só pode ser usado uma vez. |
| Meia-entrada | `HalfPrice` | Ingresso com 50% de desconto para públicos previstos em lei (Lei 12.933/2013). |
| Taxa de conveniência | `ConvenienceFee` | Valor cobrado pela venda online, além do preço do ingresso. |
| Produtor | `Organizer` | Quem cria e gerencia eventos e acompanha as vendas. Conta aprovada pelo admin a partir de um pedido de produtor; só gerencia os próprios locais e eventos. O produtor seed da Fase 2 é uma conta real, verificada e aprovada, com o mesmo ID, e os dados de demonstração continuam dele. |
| Cliente | `Customer` | Quem compra ingressos. Papel que toda conta tem ao se cadastrar. |
| Admin | `Admin` | Quem decide os pedidos de produtor. Criado por seed, nunca pela aplicação. Tem também os papéis produtor e cliente, mas no Catalog age só sobre o que é dele. |
| Pedido de produtor | `OrganizerRequest` | Solicitação de uma conta para virar produtor: nome da organização, CNPJ e motivo. Fica Pendente, Aprovado ou Recusado (com mensagem opcional); no máximo um pendente por conta. A recusa não é definitiva: a conta pode pedir de novo. Não confundir com `Order` (pedido de compra). |
| Verificação de e-mail | `EmailVerification` | Link de uso único, válido por 24 h, enviado no cadastro e no reenvio. Reenviar invalida os links anteriores. Conta não verificada não faz login. |
| Portaria | `GateStaff` | Quem faz o check-in no local. Papel `gate_staff` apenas reservado: sem cadastro, vínculo nem fluxo até a Fase 6. |

Os números e regras de Local, Sessão, Setor e Lote acima são as decididas na Fase 2 (Catalog). Valores, percentuais, prazos e limites associados a esses termos são regras de negócio a confirmar no pipeline SDD.
