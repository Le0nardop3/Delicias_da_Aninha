const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
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

async function getDb() {
  if (db) return db;

  db = createAsyncAdapter();

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





  return db;
}

module.exports = { getDb };