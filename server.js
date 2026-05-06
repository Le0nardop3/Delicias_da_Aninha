const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { getDb } = require('./src/db');

const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5583988061752';
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-essa-chave-em-producao';

const uploadsDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

// ================= UPLOAD =================

// ================= UPLOAD CLOUDINARY =================

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato inválido'), ok);
  },
  limits: { fileSize: 3 * 1024 * 1024 }
});

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'delicias-da-aninha/produtos',
        resource_type: 'image'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// ================= AUTH =================

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Não autorizado' });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

async function logAudit(req, action, details = {}) {
  try {
    const db = await getDb();

    const user = req.session?.userId
      ? await db.get(`SELECT username FROM admin_user WHERE id = $1`, [req.session.userId])
      : null;

    await db.run(`
      INSERT INTO audit_logs (action, details)
      VALUES ($1, $2)
    `, [
      action,
      JSON.stringify({
        ...details,
        user: user ? user.username : 'sistema',
        ip: clientIp(req)
      })
    ]);
  } catch (err) {
    console.error('Erro auditoria:', err.message);
  }
}

async function logAccess(req, page = 'loja') {
  try {
    const db = await getDb();

    const ip = clientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    const recent = await db.get(`
      SELECT id
      FROM access_logs
      WHERE ip = $1
        AND user_agent = $2
        AND route = $3
        AND created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY id DESC
      LIMIT 1
    `, [ip, userAgent, page]);

    if (recent) return;

    await db.run(`
      INSERT INTO access_logs (ip, user_agent, route)
      VALUES ($1, $2, $3)
    `, [ip, userAgent, page]);

  } catch (err) {
    console.error('Erro access log:', err.message);
  }
}

// ================= ROTAS PUBLICAS =================

app.get('/', async (req, res) => {
  await logAccess(req, 'loja');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', async (req, res) => {
  const db = await getDb();

  const settings = await db.get(`
    SELECT *
    FROM settings
    WHERE id = 1
  `);

  res.json({
    storeName: settings?.store_name || 'Delícias da Aninha',
    whatsappNumber: settings?.whatsapp_number || WHATSAPP_NUMBER,
    logoUrl: settings?.logo_url || '',
    primaryColor: settings?.primary_color || '#8b1e3f',
    secondaryColor: settings?.secondary_color || '#145f7a',
    deliveryEnabled: Number(settings?.delivery_enabled ?? 1),
    pickupEnabled: Number(settings?.pickup_enabled ?? 1),
    isOpen: Number(settings?.is_open ?? 1)
  });
});

// ================= CATEGORIAS =================

app.get('/api/categories', async (req, res) => {
  const db = await getDb();

  const rows = await db.all(`
    SELECT * FROM categories
    WHERE active = 1
    ORDER BY sort_order ASC, name ASC
  `);

  res.json(rows);
});

// ================= PRODUTOS =================

app.get('/api/products', async (req, res) => {
  const db = await getDb();

  const rows = await db.all(`
    SELECT 
      p.*,
      p.image_url AS image,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1
    ORDER BY p.featured DESC, p.id DESC
  `);

  res.json(rows);
});

// ================= LOGIN =================

app.post('/api/login', async (req, res) => {
  const db = await getDb();

  const { username, password } = req.body;

  const user = await db.get(`
    SELECT * FROM admin_user WHERE username = $1
  `, [username]);

  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    await logAudit(req, 'tentativa de login falhou', { username });
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  req.session.userId = user.id;
  await logAudit(req, 'login realizado', { username: user.username });

  res.json({ ok: true });
});

app.post('/api/logout', async (req, res) => {
  await logAudit(req, 'logout realizado');
  req.session.destroy(() => res.json({ ok: true }));
});

// ================= ADMIN =================

app.get('/api/admin/me', requireAuth, async (req, res) => {
  const db = await getDb();

  const user = await db.get(`
    SELECT username FROM admin_user WHERE id = $1
  `, [req.session.userId]);

  res.json({ ok: true, username: user ? user.username : 'admin' });
});

app.put('/api/admin/account', requireAuth, async (req, res) => {
  const db = await getDb();

  const currentPassword = String(req.body.currentPassword || '');
  const newUsername = String(req.body.username || '').trim();
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  const user = await db.get(`
    SELECT * FROM admin_user WHERE id = 1
  `);

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }

  if (!newUsername || newUsername.length < 3) {
    return res.status(400).json({ error: 'O usuário deve ter pelo menos 3 caracteres.' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'A confirmação da senha não confere.' });
  }

  await db.run(`
    UPDATE admin_user
    SET username = $1, password_hash = $2
    WHERE id = 1
  `, [newUsername, bcrypt.hashSync(newPassword, 10)]);
  await logAudit(req, 'alterou usuário/senha do admin', { novo_usuario: newUsername });

  req.session.destroy(() => res.json({ ok: true }));
});

// ================= PRODUTOS ADMIN =================

app.get('/api/admin/products', requireAuth, async (req, res) => {
  const db = await getDb();

  const rows = await db.all(`
    SELECT 
      p.*,
      p.image_url AS image,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.id DESC
  `);

  res.json(rows);
});

app.post('/api/admin/products', requireAuth, upload.single('image'), async (req, res) => {
  const db = await getDb();

  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const price = Number(req.body.price || 0);
  const category_id = Number(req.body.category_id || 0) || null;
  const active = req.body.active === '0' ? 0 : 1;
  const featured = req.body.featured === '1' ? 1 : 0;
  let image = '';

  if (req.file) {
    image = await uploadToCloudinary(req.file.buffer);
  }

  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  if (!price || price <= 0) return res.status(400).json({ error: 'Preço inválido' });

  const result = await db.get(`
    INSERT INTO products (
      name, description, price, category_id, image_url, active, featured
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [name, description, price, category_id, image, active, featured]);

  await logAudit(req, 'criou produto', {
    id: result.id,
    nome: name,
    preco: price
  });

  res.json({ ok: true, id: result.id });
});

app.put('/api/admin/products/:id', requireAuth, upload.single('image'), async (req, res) => {
  const db = await getDb();

  const id = Number(req.params.id);

  const current = await db.get(`SELECT * FROM products WHERE id = $1`, [id]);
  if (!current) return res.status(404).json({ error: 'Produto não encontrado' });

  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const price = Number(req.body.price || 0);
  const category_id = Number(req.body.category_id || 0) || null;
  const active = req.body.active === '1' ? 1 : 0;
  const featured = req.body.featured === '1' ? 1 : 0;
  let image = current.image_url;

  if (req.file) {
    image = await uploadToCloudinary(req.file.buffer);
  }

  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  if (!price || price <= 0) return res.status(400).json({ error: 'Preço inválido' });

  await db.run(`
    UPDATE products
    SET 
      name = $1,
      description = $2,
      price = $3,
      category_id = $4,
      image_url = $5,
      active = $6,
      featured = $7
    WHERE id = $8
  `, [name, description, price, category_id, image, active, featured, id]);

  await logAudit(req, 'editou produto', {
    id,
    nome: name,
    preco: price,
    disponivel: active
  });

  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  const db = await getDb();

  const id = Number(req.params.id);
  const product = await db.get(`SELECT name FROM products WHERE id = $1`, [id]);

  await db.run(`DELETE FROM products WHERE id = $1`, [id]);

  await logAudit(req, 'excluiu produto', {
    id,
    nome: product ? product.name : 'produto não encontrado'
  });

  res.json({ ok: true });
});

// ================= CATEGORIAS ADMIN =================

app.post('/api/admin/categories', requireAuth, async (req, res) => {
  const db = await getDb();

  const name = String(req.body.name || '').trim();

  if (!name) return res.status(400).json({ error: 'Informe o nome da categoria.' });

  const exists = await db.get(`
    SELECT id FROM categories WHERE LOWER(name) = LOWER($1)
  `, [name]);

  if (exists) return res.status(400).json({ error: 'Essa categoria já existe.' });

  const result = await db.get(`
    INSERT INTO categories (name, active, sort_order)
    VALUES ($1, 1, 99)
    RETURNING id
  `, [name]);

  await logAudit(req, 'criou categoria', {
    id: result.id,
    categoria: name
  });

  res.json({ id: result.id, name, active: 1, sort_order: 99 });
});

// ================= PEDIDOS =================

app.post('/api/orders', async (req, res) => {
  const db = await getDb();

  const { items, customer_name, customer_phone, address, payment, note } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Pedido vazio' });
  }

  let total = 0;

  for (const item of items) {
    total += Number(item.price || 0) * Number(item.quantity || 0);
  }

  const result = await db.get(`
    INSERT INTO orders (customer_name, customer_phone, address, payment, note, total)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    customer_name || '',
    customer_phone || '',
    address || '',
    payment || '',
    note || '',
    total
  ]);

  const orderId = result.id;

  for (const item of items) {
    await db.run(`
      INSERT INTO order_items (order_id, product_name, quantity, price)
      VALUES ($1, $2, $3, $4)
    `, [
      orderId,
      item.name,
      Number(item.quantity || 0),
      Number(item.price || 0)
    ]);
  }

  res.json({ ok: true, orderId });
});

// ================= PEDIDOS ADMIN =================

app.get('/api/admin/orders', requireAuth, async (req, res) => {
  const db = await getDb();

  const orders = await db.all(`
    SELECT *
    FROM orders
    ORDER BY 
      CASE status
        WHEN 'novo' THEN 1
        WHEN 'producao' THEN 2
        WHEN 'finalizado' THEN 3
        WHEN 'cancelado' THEN 4
        ELSE 5
      END,
      id DESC
  `);

  for (const order of orders) {
    order.items = await db.all(`
      SELECT *
      FROM order_items
      WHERE order_id = $1
    `, [order.id]);
  }

  res.json(orders);
});

app.put('/api/admin/orders/:id/status', requireAuth, async (req, res) => {
  const db = await getDb();

  const id = Number(req.params.id);
  const status = String(req.body.status || '').trim();

  const allowed = ['novo', 'producao', 'finalizado', 'cancelado'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  await db.run(`
    UPDATE orders
    SET status = $1
    WHERE id = $2
  `, [status, id]);

  await logAudit(req, 'alterou status do pedido', {
    pedido: id,
    status
  });

  res.json({ ok: true });
});

// ================= AUDITORIA =================

app.get('/api/admin/audit', requireAuth, async (req, res) => {
  const db = await getDb();

  const logs = await db.all(`
    SELECT *
    FROM audit_logs
    ORDER BY id DESC
    LIMIT 200
  `);

  const formatted = logs.map(log => {
    let details = {};

    try {
      details = log.details ? JSON.parse(log.details) : {};
    } catch {
      details = {};
    }

    return {
      id: log.id,
      action: log.action,
      details,
      user: details.user || 'sistema',
      ip: details.ip || '-',
      created_at: log.created_at
    };
  });

  res.json(formatted);
});

// ================= ACESSOS =================

app.get('/api/admin/access-logs', requireAuth, async (req, res) => {
  const db = await getDb();

  const logs = await db.all(`
    SELECT *
    FROM access_logs
    ORDER BY id DESC
    LIMIT 1000
  `);

  const today = new Date().toISOString().slice(0, 10);
  const uniqueIps = new Set(logs.map(l => l.ip)).size;

  const todayCount = logs.filter(l => {
    if (!l.created_at) return false;
    const date = new Date(l.created_at).toISOString().slice(0, 10);
    return date === today;
  }).length;

  res.json({
    total: logs.length,
    today: todayCount,
    uniqueIps,
    logs: logs.slice(0, 200).map(log => ({
      id: log.id,
      page: log.route || 'loja',
      path: log.route || '/',
      ip: log.ip || '-',
      user_agent: log.user_agent || '',
      created_at: log.created_at
    }))
  });
});

// ================= CONFIGURAÇÕES DA LOJA ADMIN =================

app.get('/api/admin/settings', requireAuth, async (req, res) => {
  const db = await getDb();

  const settings = await db.get(`
    SELECT *
    FROM settings
    WHERE id = 1
  `);

  res.json(settings);
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  const db = await getDb();

  const current = await db.get(`SELECT * FROM settings WHERE id = 1`);

  const whatsappNumber = String(req.body.whatsapp_number || '').replace(/\D/g, '');
  const isOpen = req.body.is_open ? 1 : 0;

  if (!whatsappNumber || whatsappNumber.length < 10) {
    return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
  }

  await db.run(`
    UPDATE settings
    SET
      whatsapp_number = $1,
      is_open = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `, [
    whatsappNumber,
    isOpen
  ]);

  await logAudit(req, 'alterou configurações da loja', {
    loja: current?.store_name || 'Delícias da Aninha',
    whatsapp: whatsappNumber,
    loja_aberta: isOpen
  });

  res.json({ ok: true });
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`Rodando em http://localhost:${PORT}`);
  console.log(`Loja: http://localhost:${PORT}`);
  console.log(`Painel admin: http://localhost:${PORT}/admin/login.html`);
});