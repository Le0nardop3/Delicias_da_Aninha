# Mini Loja de Lanches - WhatsApp

Versão ajustada para Windows/Node sem `better-sqlite3`.

## Como rodar

```bash
npm install
npm start
```

Acesse:

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin/login.html

Login inicial:

- Usuário: admin
- Senha: admin123

## Onde os dados ficam salvos

Os produtos e categorias ficam em:

```txt
data/database.json
```

As imagens dos produtos ficam em:

```txt
public/uploads
```

## WhatsApp

No arquivo `server.js`, altere:

```js
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5583988061752';
```


## Conta admin

O login inicial é admin / admin123 apenas para o primeiro acesso.
Depois de entrar no painel, use a seção "Conta admin" para trocar usuário e senha.
Por segurança, a tela de login não mostra mais as credenciais.


## Expiração de pedidos aguardando WhatsApp

Pedidos que permanecem em **Aguardando WhatsApp** expiram automaticamente após 60 minutos por padrão. Isso evita acumular pedidos que foram iniciados no site, mas cuja mensagem não foi enviada no WhatsApp.

No Render, você pode ajustar o tempo pela variável de ambiente:

```txt
ORDER_WHATSAPP_EXPIRATION_MINUTES=60
```

Se um pedido expirar ou for cancelado por engano, o painel antigo de **Pedidos** possui o botão **Voltar para operação**, que o devolve para **Aguardando WhatsApp**.

## Ajustes de lançamento - frete e WhatsApp

- O total exibido na sacola agora é identificado como **Total dos produtos**.
- A sacola avisa que a taxa de entrega não está incluída e será confirmada pelo WhatsApp conforme o endereço.
- A mensagem enviada ao WhatsApp informa **Taxa de entrega: a confirmar pelo WhatsApp**.
- O fluxo já existente de registro do pedido como `aguardando_whatsapp` e redirecionamento ao WhatsApp foi preservado.
- Em **Minha Conta > Meus pedidos**, pedidos ainda em `aguardando_whatsapp` exibem aviso e botão **Reenviar pelo WhatsApp**.
- O reenvio reutiliza o mesmo número do pedido e não cria um novo pedido.
- Quando o pedido deixa de estar em `aguardando_whatsapp` (confirmado, expirado, cancelado etc.), o botão deixa de aparecer.
