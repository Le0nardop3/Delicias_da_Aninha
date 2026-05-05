const { Pool } = require('pg');

let pool = null;

function createAdapter(pool) {
  return {
    exec: async (sql) => {
      await pool.query(sql);
    },

    get: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },

    all: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result.rows;
    },

    run: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return {
        lastID: result.rows?.[0]?.id || null,
        changes: result.rowCount
      };
    }
  };
}

async function getDb() {
  if (pool) return createAdapter(pool);

  pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const db = createAdapter(pool);

  // ⚠️ CREATE TABLES (adaptado pro postgres)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      store_name TEXT DEFAULT 'Delícias da Aninha',
      whatsapp_number TEXT DEFAULT '5583988061752',
      logo_url TEXT DEFAULT '',
      primary_color TEXT DEFAULT '#9b2242',
      secondary_color TEXT DEFAULT '#006b9c',
      delivery_enabled INTEGER DEFAULT 1,
      pickup_enabled INTEGER DEFAULT 1,
      is_open INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL DEFAULT 0,
      image_url TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_user (
      id INTEGER PRIMARY KEY,
      username TEXT,
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT,
      customer_phone TEXT,
      address TEXT,
      payment TEXT,
      note TEXT,
      total REAL,
      status TEXT DEFAULT 'novo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      product_name TEXT,
      quantity INTEGER,
      price REAL
    );
  `);

  await db.run(`
    INSERT INTO settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);

  return db;
}

module.exports = { getDb };