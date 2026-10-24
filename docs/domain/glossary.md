# Glossário do domínio

Linguagem ubíqua do Stubb. O termo em inglês é o usado no código.

| Termo | Código | Definição |
|---|---|---|
| Evento | `Event` | O espetáculo vendido (show, peça, jogo). Tem uma ou mais sessões. Não confundir com evento de domínio. |
| Evento de domínio | `DomainEvent` | Fato ocorrido no sistema, no passado (`SeatsHeld`). Publicado via outbox. |
| Local | `Venue` | Lugar físico onde o evento acontece, com sua planta de setores. |
| Sessão | `Session` | Uma ocorrência do evento em data e horário específicos. |
| Setor | `Sector` | Área do local para uma sessão. Pode ser de assento marcado ou de pista. |
| Assento | `Seat` | Lugar numerado dentro de um setor de assento marcado. |
| Pista | `GeneralAdmission` | Setor sem assento numerado; vendido por quantidade. |
| Lote | `Batch` | Faixa de preço de um setor válida por período ou até esgotar. |
| Hold | `Hold` | Reserva temporária de assentos ou quantidade, com prazo de expiração, enquanto o cliente paga. |
| Pedido | `Order` | Intenção de compra de um cliente, ligada a um hold e a um pagamento. |
| Pagamento | `Payment` | Cobrança de um pedido, confirmada ou recusada pelo gateway (fake). |
| Ingresso | `Ticket` | Direito de entrada emitido após pedido confirmado, com QR code. |
| Titular | `Holder` | Pessoa (CPF) dona do ingresso; muda na transferência. |
| Transferência | `Transfer` | Troca de titularidade de um ingresso. |
| Check-in | `CheckIn` | Validação do ingresso na portaria; um ingresso só pode ser usado uma vez. |
| Meia-entrada | `HalfPrice` | Ingresso com 50% de desconto para públicos previstos em lei (Lei 12.933/2013). |
| Taxa de conveniência | `ConvenienceFee` | Valor cobrado pela venda online, além do preço do ingresso. |
| Produtor | `Organizer` | Quem cria e gerencia eventos e acompanha as vendas. |
| Cliente | `Customer` | Quem compra ingressos. |
| Portaria | `GateStaff` | Quem faz o check-in no local. |

Valores, percentuais, prazos e limites associados a esses termos são regras de negócio a confirmar no pipeline SDD.
