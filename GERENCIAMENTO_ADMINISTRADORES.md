# Gerenciamento de administradores

- Acesse o painel com a conta **Léo** e clique no botão **Admin**.
- A tela permite criar, listar, editar, desativar e excluir administradores, além de alterar suas senhas e definir permissões: Ver loja, Painel, Operação, Pedidos e Admin.
- As contas existentes são mantidas. Ao iniciar o servidor, a migração marca como titular a conta cujo nome de usuário é `Léo` ou `Leo`, caso ainda não exista titular.
- Se sua conta tiver outro nome, **não crie um usuário chamado Léo** para tentar obter a titularidade. Solicite ajuste seguro no banco de dados. A opção Admin não será concedida automaticamente a outros usuários.
- A conta titular fica protegida contra exclusão ou desativação pela tela de gestão.
- O controle de **Ver loja** esconde o atalho: a loja pública continua acessível ao público, por definição. As demais páginas e APIs administrativas recebem controle de permissão no servidor.
- Ao desativar uma conta, o login e as próximas requisições dessa conta serão bloqueados.
- Para produção, configure SESSION_SECRET forte e HTTPS; as sessões continuam usando o mecanismo original em memória, portanto reiniciar o servidor pode desconectar usuários.

**Importante:** não foi possível executar testes integrados no banco real do Render. Antes da publicação definitiva, faça um backup do PostgreSQL e teste com a conta Léo e um usuário secundário.

## Correção de compatibilidade (19/10/2026)
- Migração automática de `created_at` e `updated_at` para tabelas `admin_user` antigas.
- Inicialização do banco compartilhada entre todas as requisições (espera as migrações terminarem).
- Botão Admin exibido quando a permissão é confirmada, e oculto em outros casos.
- CSS respeita o atributo `hidden`.
- Reinicie o servidor com `node .` e atualize o navegador com Ctrl+F5.
