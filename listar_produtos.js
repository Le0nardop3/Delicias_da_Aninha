const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false
});

async function listarProdutos() {
  try {
    console.log('========================================');
    console.log('PRODUTOS CADASTRADOS');
    console.log('========================================');

    const resultado = await pool.query(`
      SELECT *
      FROM products
      ORDER BY id ASC
    `);

    if (resultado.rows.length === 0) {
      console.log('Nenhum produto cadastrado.');
      return;
    }

    console.table(resultado.rows);

    console.log('');
    console.log(`TOTAL DE PRODUTOS: ${resultado.rows.length}`);
    console.log('========================================');

  } catch (error) {
    console.error('ERRO AO LISTAR PRODUTOS:');
    console.error(error);

  } finally {
    await pool.end();
  }
}

listarProdutos();