# Implementação — Tela Operacional

## O que foi implementado

### Nova tela
- `/admin/operacao.html`
- Kanban com:
  - Aguardando WhatsApp
  - Confirmados
  - Em preparo
  - Prontos
- Visualização em lista.
- Atualização automática a cada 5 segundos.
- Contador por etapa.
- Tempo desde a criação do pedido.
- Aviso visual e sonoro para novos pedidos aguardando WhatsApp.
- Modal com detalhes completos do pedido.
- Botões de avanço de etapa.
- Link para falar com o cliente pelo WhatsApp.
- Atalho para a tela de pedidos detalhados e para o painel.

### Fluxo operacional
O pedido novo passa por:

1. `aguardando_whatsapp`
2. `confirmado`
3. `preparando`
4. `pronto`
5. `entregue`

Também existe `cancelado`.

O botão **Confirmar pedido** exige confirmação do operador de que a mensagem do cliente realmente chegou pelo WhatsApp.

### Cliente
Na sacola foi adicionado um aviso explicando que:
- o pedido é registrado no sistema;
- ele fica aguardando confirmação;
- o cliente precisa enviar a mensagem preparada no WhatsApp;
- fechar o WhatsApp ou não enviar a mensagem não confirma o pedido.

Depois do registro, o WhatsApp é aberto com a mensagem do pedido.

### Banco
Foi adicionada a coluna:
- `orders.operation_status`
- `orders.whatsapp_confirmed_at`

A migração é executada automaticamente pelo `src/db.js`.

Pedidos antigos recebem um status operacional compatível com o status legado.

### Compatibilidade
A tela antiga `/admin/pedidos.html` foi mantida. O novo fluxo operacional usa uma API própria e também sincroniza o `status` antigo para não quebrar as funcionalidades existentes.

## Como testar

1. Suba o projeto normalmente.
2. Faça login no admin.
3. Acesse `/admin/operacao.html` ou clique em **Operação** no painel.
4. Em outra aba/celular, faça um pedido pelo site.
5. Confira se ele aparece em **Aguardando WhatsApp**.
6. Não envie a mensagem no WhatsApp: o pedido deve continuar aguardando.
7. Simule o recebimento da mensagem e clique em **Confirmar pedido**.
8. Avance para **Em preparo**, **Pronto** e **Entregue**.
9. Abra `/admin/pedidos.html` e confirme que a tela antiga continua funcionando.
10. Acesse a conta do cliente e confirme que o status operacional aparece no histórico.

## Observação importante

O sistema não consegue saber automaticamente se o cliente realmente apertou "Enviar" no WhatsApp. Por isso, a confirmação é feita pelo operador quando a mensagem chega.

Antes do lançamento, vale testar o fluxo completo com um pedido real de teste e confirmar que o responsável pela operação consegue perceber rapidamente os novos pedidos.


## Ajustes adicionais
- O botão de cancelamento foi renomeado para **Cancelar pedido** e agora exige confirmação explícita.
- Pedidos em `aguardando_whatsapp` expiram automaticamente após `ORDER_WHATSAPP_EXPIRATION_MINUTES` minutos; padrão: 60.
- Pedidos expirados saem da operação ativa para não poluir o Kanban.
- No painel antigo de Pedidos, pedidos cancelados/expirados podem ser retornados para a operação pelo botão **Voltar para operação**.

### Impressão após confirmação do WhatsApp

A fila da impressora foi ajustada para não aceitar pedidos em `aguardando_whatsapp`. O pedido só entra na fila de impressão quando o operador confirma o recebimento da mensagem no WhatsApp, passando para `confirmado`.

A resposta da fila de impressão também passou a incluir `print_lines` e `print_text`, com:
- produtos e quantidades;
- opções/adicionais escolhidos;
- observações específicas de cada item;
- observação geral do pedido;
- total;
- cliente, telefone, entrega/retirada e forma de pagamento.

A reimpressão também foi bloqueada para pedidos que ainda não foram confirmados pelo WhatsApp.

> Observação: o código do agente físico de impressão não está neste projeto. O backend agora entrega os detalhes completos na fila; se o agente local tiver um formatador próprio, ele deve usar `order.items[].selected_options`, `order.items[].item_note` ou os campos `print_lines`/`print_text` para colocar esses detalhes no ticket.
