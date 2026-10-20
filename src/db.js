const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config(); // garante leitura do .env

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // necessário para Render
  }
});

function createAsyncAdapter() {
  return {
    exec: async (sql) => {
      await pool.query(sql);
    },

    get: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result.rows[0];
    },

    all: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result.rows;
    },

    run: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount
      };
    }
  };
}

let db = null;
let initialization = null;

// Compartilha a mesma promessa durante a criação/migração do banco.
// Assim nenhuma rota consulta colunas antes da migração terminar.
async function getDb() {
  if (!initialization) {
    initialization = initializeDb().catch(error => {
      initialization = null;
      db = null;
      throw error;
    });
  }
  return initialization;
}

async function initializeDb() {
  db = createAsyncAdapter();

  // Criação das tabelas (se não existirem)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      store_name TEXT,
      whatsapp_number TEXT,
      logo_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      delivery_enabled INTEGER,
      pickup_enabled INTEGER,
      is_open INTEGER
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT,
      active INTEGER,
      sort_order INTEGER
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER,
      name TEXT,
      description TEXT,
      price REAL,
      image_url TEXT,
      active INTEGER,
      featured INTEGER,
      sort_order INTEGER
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      cpf TEXT UNIQUE,
      birth_date DATE,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      customer_phone TEXT,
      address TEXT,
      payment TEXT,
      note TEXT,
      total REAL,
      status TEXT DEFAULT 'novo',
      operation_status TEXT DEFAULT 'aguardando_whatsapp',
      whatsapp_confirmed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      product_name TEXT,
      quantity INTEGER,
      price REAL,
      unit_price REAL,
      selected_options JSONB DEFAULT '[]'::jsonb,
      item_note TEXT
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id SERIAL PRIMARY KEY,
      ip TEXT,
      user_agent TEXT,
      route TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      action TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_user (
      id INTEGER PRIMARY KEY,
      username TEXT,
      password_hash TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Compatibilidade com tabelas admin_user criadas por versões antigas.
  // CREATE TABLE IF NOT EXISTS não cria colunas ausentes numa tabela existente.
  await db.exec(`
    ALTER TABLE admin_user ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE admin_user ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  // Permissões por administrador; mantém os usuários já existentes.
  await db.exec(`
    ALTER TABLE admin_user ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_user ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE admin_user ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{"loja":true,"painel":true,"operacao":true,"pedidos":true,"admin":false}'::jsonb;
    CREATE SEQUENCE IF NOT EXISTS admin_user_id_seq;
    ALTER TABLE admin_user ALTER COLUMN id SET DEFAULT nextval('admin_user_id_seq');
    SELECT setval('admin_user_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM admin_user),1), true);
  `);
  // Léo é o titular inicial do gerenciamento. Essa atribuição é feita uma vez,
  // apenas se ainda não existir titular. Não sobrescreve permissões já salvas.
  await db.run(`
    UPDATE admin_user SET is_superadmin = TRUE
    WHERE id = (SELECT id FROM admin_user
                WHERE lower(username) IN ('léo', 'leo') ORDER BY id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM admin_user WHERE is_superadmin = TRUE)
  `);

  // Inserções iniciais
  await db.run(`
    INSERT INTO settings (
      id, store_name, whatsapp_number, logo_url, primary_color, secondary_color,
      delivery_enabled, pickup_enabled, is_open
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO NOTHING
  `, [
    1,
    'Delícias da Aninha',
    '5583988061752',
    '',
    '#9b2242',
    '#006b9c',
    1,
    1,
    1
  ]);

  await db.run(`
    INSERT INTO admin_user (id, username, password_hash)
    VALUES ($1,$2,$3)
    ON CONFLICT (id) DO NOTHING
  `, [
    1,
    'admin',
    bcrypt.hashSync('admin123', 10)
  ]);


  // Migrações para login/cadastro de clientes
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      cpf TEXT UNIQUE,
      birth_date DATE,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf TEXT UNIQUE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date DATE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'entrega';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT FALSE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_pending BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS printed_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS reprint_requested BOOLEAN DEFAULT FALSE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS reprint_requested_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'aguardando_pagamento';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price REAL;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_options JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_note TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS operation_status TEXT DEFAULT 'aguardando_whatsapp';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at TIMESTAMP;

    UPDATE orders
    SET operation_status = CASE
      WHEN status = 'producao' THEN 'preparando'
      WHEN status = 'finalizado' THEN 'entregue'
      WHEN status = 'cancelado' THEN 'cancelado'
      ELSE 'aguardando_whatsapp'
    END
    WHERE operation_status = 'aguardando_whatsapp'
      AND status IN ('producao', 'finalizado', 'cancelado');
      
  
    `);

  return db;
}

module.exports = { getDb };