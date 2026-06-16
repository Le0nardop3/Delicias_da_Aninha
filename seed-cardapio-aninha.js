// create_customers_table_seed.js

const { getDb } = require('./src/db.js');  // Certifique-se que o caminho está correto
const bcrypt = require('bcrypt');

async function main() {
  const db = await getDb();

  // Criação da tabela customers
  await db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Tabela customers criada com sucesso!');

  // Inserir cliente de teste (opcional)
  const hashedPassword = await bcrypt.hash('123456', 10);
  try {
    await db.run(`
      INSERT INTO customers (name, phone, password)
      VALUES ($1, $2, $3)
    `, ['Cliente Teste', '11999999999', hashedPassword]);

    console.log('Cliente de teste inserido!');
  } catch(err) {
    if(err.message.includes('unique')) {
      console.log('Cliente de teste já existe, pulando inserção.');
    } else {
      console.error('Erro ao inserir cliente de teste:', err);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Erro ao criar tabela customers:', err);
  process.exit(1);
});