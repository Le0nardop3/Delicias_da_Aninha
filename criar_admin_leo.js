const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const USERNAME = 'Léo';
const PASSWORD = 'Akbidkh132leo!';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não encontrada no arquivo .env');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Verifica se o usuário já existe
    const existing = await pool.query(
      `
      SELECT id, username
      FROM admin_user
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
      `,
      [USERNAME]
    );

    if (existing.rows.length > 0) {
      console.log(
        `O usuário "${existing.rows[0].username}" já existe (ID ${existing.rows[0].id}).`
      );
      console.log('Nenhuma alteração foi feita.');
      return;
    }

    // Descobre o próximo ID
    const nextIdResult = await pool.query(`
      SELECT COALESCE(MAX(id), 0) + 1 AS next_id
      FROM admin_user
    `);

    const nextId = Number(nextIdResult.rows[0].next_id);

    // Cria o hash da senha
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    // Insere o novo administrador
    await pool.query(
      `
      INSERT INTO admin_user
        (id, username, password_hash)
      VALUES
        ($1, $2, $3)
      `,
      [nextId, USERNAME, passwordHash]
    );

    console.log('');
    console.log('======================================');
    console.log(' ADMINISTRADOR CRIADO COM SUCESSO');
    console.log('======================================');
    console.log(`Usuário: ${USERNAME}`);
    console.log(`ID: ${nextId}`);
    console.log('Senha inicial configurada.');
    console.log('======================================');
    console.log('');
    console.log('Agora você pode apagar este arquivo.');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('ERRO ao criar o usuário administrativo:');
    console.error(error.message);
    console.error('');
  } finally {
    await pool.end();
  }
}

main();