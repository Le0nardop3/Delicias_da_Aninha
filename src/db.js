const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "database.sqlite");

let db = null;

async function getDb() {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA foreign_keys = ON");


  

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT NOT NULL DEFAULT 'Delícias da Aninha',
      whatsapp_number TEXT NOT NULL DEFAULT '5583988061752',
      logo_url TEXT DEFAULT '',
      primary_color TEXT DEFAULT '#9b2242',
      secondary_color TEXT DEFAULT '#006b9c',
      delivery_enabled INTEGER NOT NULL DEFAULT 1,
      pickup_enabled INTEGER NOT NULL DEFAULT 1,
      is_open INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      image_url TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS admin_user (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity TEXT DEFAULT '',
      entity_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      route TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT,
      customer_phone TEXT,
      address TEXT,
      payment TEXT,
      note TEXT,
      total REAL,
      status TEXT DEFAULT 'novo',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_name TEXT,
      quantity INTEGER,
      price REAL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );
  `);
  
  await addColumnIfNotExists(db, 'orders', 'address', 'TEXT');
  await addColumnIfNotExists(db, 'orders', 'payment', 'TEXT');
  await addColumnIfNotExists(db, 'orders', 'note', 'TEXT');

  await db.run(`
    INSERT OR IGNORE INTO settings (id)
    VALUES (1)
  `);

  return db;
}


async function addColumnIfNotExists(db, table, column, type) {
  const columns = await db.all(`PRAGMA table_info(${table})`);
  const exists = columns.some(c => c.name === column);

  if (!exists) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

module.exports = { getDb };