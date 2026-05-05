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
