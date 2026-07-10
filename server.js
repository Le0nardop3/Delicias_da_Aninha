const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('./src/db');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

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


function requireCustomerAuth(req, res, next) {
  if (req.session && req.session.customerId) return next();
  return res.status(401).json({ error: 'Cliente não autenticado' });
}

function isValidCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d){10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i), 10) * (11 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf.substring(9, 10), 10)) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i), 10) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(cpf.substring(10, 11), 10);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}


function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function appUrl(req) {
  const configured = String(process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}



async function sendPasswordResetEmail({
  to,
  customerName,
  resetLink,
  storeName,
  logoUrl,
  primaryColor
}) {

  const html = `
    <div style="margin:0;padding:0;background:#f8f2ec;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee;">

        <div style="background:${primaryColor || '#9b2242'};padding:30px;text-align:center;color:#fff;">
          ${logoUrl
      ? `<img src="${logoUrl}" style="max-width:120px;margin-bottom:15px;">`
      : ""
    }

          <h1 style="margin:0;">
            ${storeName || "Delícias da Aninha"}
          </h1>

          <p style="margin-top:10px;">
            Recuperação de senha
          </p>
        </div>

        <div style="padding:35px;">

          <p>Olá <strong>${customerName}</strong>,</p>

          <p>
            Recebemos uma solicitação para redefinir a senha da sua conta.
          </p>

          <p>
            Clique no botão abaixo para criar uma nova senha.
          </p>

          <div style="text-align:center;margin:35px 0;">

            <a
              href="${resetLink}"
              style="
                background:${primaryColor || "#9b2242"};
                color:white;
                padding:15px 28px;
                text-decoration:none;
                border-radius:10px;
                display:inline-block;
                font-weight:bold;
            ">
              Redefinir minha senha
            </a>

          </div>

          <p>
            Caso o botão não funcione, copie o link abaixo:
          </p>

          <p style="word-break:break-all;color:#666;">
            ${resetLink}
          </p>

          <hr>

          <small>
            Este link expira em 15 minutos.
          </small>

        </div>

      </div>
    </div>
  `;

  try {

    const { data, error } = await resend.emails.send({

      from: process.env.EMAIL_FROM,

      to: [to],

      subject: `Recuperação de senha - ${storeName || "Delícias da Aninha"}`,

      html

    });

    if (error) {
      console.error("Erro Resend:", error);
      throw new Error(error.message);
    }

    console.log("======================================");
    console.log("EMAIL ENVIADO COM SUCESSO");
    console.log(data);
    console.log("======================================");

    return true;

  } catch (err) {

    console.error("Erro ao enviar email:", err);

    throw err;

  }

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


// ================= CLIENTES AUTH =================

app.post('/api/customer/register', async (req, res) => {
  try {
    const db = await getDb();

    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const email = String(req.body.email || '').trim().toLowerCase();
    const cpf = String(req.body.cpf || '').replace(/\D/g, '');
    const birth_date = String(req.body.birth_date || '').trim();
    const password = String(req.body.password || '');

    if (!name || name.length < 3) return res.status(400).json({ error: 'Informe seu nome completo.' });
    if (!phone || phone.length < 10) return res.status(400).json({ error: 'Informe um telefone válido.' });
    if (!isValidCPF(cpf)) return res.status(400).json({ error: 'Informe um CPF válido.' });
    if (!birth_date) return res.status(400).json({ error: 'Informe sua data de nascimento.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });

    const exists = await db.get(`
      SELECT id
      FROM customers
      WHERE phone = $1
         OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
         OR cpf = $3
      LIMIT 1
    `, [phone, email || null, cpf]);

    if (exists) return res.status(400).json({ error: 'Já existe uma conta com este telefone, e-mail ou CPF.' });

    const passwordHash = bcrypt.hashSync(password, 10);

    const customer = await db.get(`
      INSERT INTO customers (name, phone, password, email, cpf, birth_date, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $3, TRUE)
      RETURNING id, name, phone, email
    `, [name, phone, passwordHash, email || null, cpf, birth_date]);

    req.session.customerId = customer.id;
    res.json({ ok: true, customer });
  } catch (error) {
    console.error('Erro ao cadastrar cliente:', error);
    res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
  }
});

app.post('/api/customer/login', async (req, res) => {
  try {
    const db = await getDb();
    const login = String(req.body.login || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!login || !password) return res.status(400).json({ error: 'Informe login e senha.' });

    const cleanPhone = login.replace(/\D/g, '');
    const customer = await db.get(`
      SELECT *
      FROM customers
      WHERE LOWER(email) = LOWER($1)
         OR phone = $2
      LIMIT 1
    `, [login, cleanPhone]);

    if (!customer || !bcrypt.compareSync(password, customer.password_hash || '')) {
      return res.status(401).json({ error: 'Login ou senha inválidos.' });
    }

    if (!customer.is_active) return res.status(403).json({ error: 'Conta desativada.' });

    req.session.customerId = customer.id;
    res.json({
      ok: true,
      customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }
    });
  } catch (error) {
    console.error('Erro login cliente:', error);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

app.post('/api/customer/logout', requireCustomerAuth, async (req, res) => {
  req.session.customerId = null;
  res.json({ ok: true });
});

app.get('/api/customer/me', requireCustomerAuth, async (req, res) => {
  try {
    const db = await getDb();
    const customer = await db.get(`
      SELECT id, name, phone, email, cpf, birth_date, is_active, created_at
      FROM customers
      WHERE id = $1
    `, [req.session.customerId]);

    if (!customer) {
      req.session.customerId = null;
      return res.status(401).json({ error: 'Cliente não encontrado.' });
    }

    res.json({ ok: true, customer });
  } catch (error) {
    console.error('Erro customer/me:', error);
    res.status(500).json({ error: 'Erro ao carregar cliente.' });
  }
});


// ================= RECUPERAÇÃO DE SENHA =================

app.post('/api/customer/forgot-password', async (req, res) => {
  try {
    const db = await getDb();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    const customer = await db.get(`
      SELECT id, name, email, is_active
      FROM customers
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `, [email]);

    const genericMessage = 'Se existir uma conta vinculada a este e-mail, enviaremos um link para redefinição de senha.';

    if (!customer || customer.is_active === false) {
      return res.json({ ok: true, message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);

    await db.run(`
      UPDATE customers
      SET reset_token = $1,
          reset_token_expires = NOW() + INTERVAL '15 minutes',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [tokenHash, customer.id]);

    const settings = await db.get(`SELECT store_name, logo_url, primary_color FROM settings WHERE id = 1`);
    const resetLink = `${appUrl(req)}/redefinir-senha.html?token=${rawToken}`;

    await sendPasswordResetEmail({
      to: customer.email,
      customerName: customer.name,
      resetLink,
      storeName: settings?.store_name || 'Delícias da Aninha',
      logoUrl: settings?.logo_url || '',
      primaryColor: settings?.primary_color || '#8b1e3f'
    });

    res.json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error('Erro forgot-password:', error);
    res.status(500).json({ error: 'Erro ao solicitar redefinição de senha.' });
  }
});

app.get('/api/customer/reset-password/:token', async (req, res) => {
  try {
    const db = await getDb();
    const rawToken = String(req.params.token || '').trim();

    if (!rawToken) return res.status(400).json({ error: 'Token inválido.' });

    const customer = await db.get(`
      SELECT id
      FROM customers
      WHERE reset_token = $1
        AND reset_token_expires > NOW()
      LIMIT 1
    `, [sha256(rawToken)]);

    if (!customer) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro validar token:', error);
    res.status(500).json({ error: 'Erro ao validar link.' });
  }
});

app.post('/api/customer/reset-password', async (req, res) => {
  try {
    const db = await getDb();
    const rawToken = String(req.body.token || '').trim();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!rawToken) return res.status(400).json({ error: 'Token inválido.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'A confirmação da senha não confere.' });

    const customer = await db.get(`
      SELECT id
      FROM customers
      WHERE reset_token = $1
        AND reset_token_expires > NOW()
      LIMIT 1
    `, [sha256(rawToken)]);

    if (!customer) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    const passwordHash = bcrypt.hashSync(password, 10);

    await db.run(`
      UPDATE customers
      SET password = $1,
          password_hash = $1,
          reset_token = NULL,
          reset_token_expires = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [passwordHash, customer.id]);

    res.json({ ok: true, message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Erro reset-password:', error);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

app.get('/api/customer/orders', requireCustomerAuth, async (req, res) => {
  try {
    const db = await getDb();
    const orders = await db.all(`
      SELECT
        id,
        customer_name,
        customer_phone,
        address,
        payment,
        note,
        total,
        status,
        payment_status,
        paid_at,
        created_at
      FROM orders
      WHERE customer_id = $1
      ORDER BY id DESC
    `, [req.session.customerId]);

    for (const order of orders) {
      order.items = await db.all(`
  SELECT
    id,
    product_name,
    quantity,
    price,
    unit_price,
    selected_options,
    item_note
  FROM order_items
  WHERE order_id = $1
  ORDER BY id ASC
`, [order.id]);
    }

    res.json({ ok: true, orders });
  } catch (error) {
    console.error('Erro ao carregar pedidos do cliente:', error);
    res.status(500).json({ error: 'Erro ao carregar seus pedidos.' });
  }
});

// ================= ENDEREÇOS DOS CLIENTES =================

// LISTAR ENDEREÇOS DO CLIENTE
app.get('/api/customer/addresses', requireCustomerAuth, async (req, res) => {
  try {
    const db = await getDb();

    const addresses = await db.all(`
      SELECT
        id,
        label,
        street,
        neighborhood,
        city,
        state,
        number,
        complement,
        reference,
        full_address,
        latitude,
        longitude,
        is_default,
        created_at,
        updated_at
      FROM customer_addresses
      WHERE customer_id = $1
      ORDER BY is_default DESC, id DESC
    `, [req.session.customerId]);

    res.json({
      ok: true,
      addresses
    });

  } catch (error) {
    console.error('Erro ao carregar endereços:', error);

    res.status(500).json({
      error: 'Erro ao carregar endereços.'
    });
  }
});


// CADASTRAR NOVO ENDEREÇO
app.post('/api/customer/addresses', requireCustomerAuth, async (req, res) => {
  try {
    const db = await getDb();

    const customerId = req.session.customerId;

    const label = String(req.body.label || 'Meu endereço').trim();

    const street = String(req.body.street || '').trim();

    const neighborhood = String(
      req.body.neighborhood || ''
    ).trim();

    const city = String(
      req.body.city || 'João Pessoa'
    ).trim();

    const state = String(
      req.body.state || 'PB'
    ).trim();

    const number = String(req.body.number || '').trim();

    const complement = String(
      req.body.complement || ''
    ).trim();

    const reference = String(
      req.body.reference || ''
    ).trim();

    const fullAddress = String(
      req.body.full_address || ''
    ).trim();

    const latitude = req.body.latitude
      ? Number(req.body.latitude)
      : null;

    const longitude = req.body.longitude
      ? Number(req.body.longitude)
      : null;


    // ================= VALIDAÇÕES =================

    if (!street) {
      return res.status(400).json({
        error: 'Selecione um endereço válido.'
      });
    }

    if (!number) {
      return res.status(400).json({
        error: 'Informe o número do endereço.'
      });
    }

    if (!fullAddress) {
      return res.status(400).json({
        error: 'Endereço completo inválido.'
      });
    }


    // VERIFICA QUANTOS ENDEREÇOS O CLIENTE POSSUI

    const countResult = await db.get(`
      SELECT COUNT(*)::int AS total
      FROM customer_addresses
      WHERE customer_id = $1
    `, [customerId]);

    const totalAddresses = Number(countResult?.total || 0);


    // PRIMEIRO ENDEREÇO É AUTOMATICAMENTE O PADRÃO

    const isDefault = totalAddresses === 0;


    // SALVAR ENDEREÇO

    const address = await db.get(`
      INSERT INTO customer_addresses (
        customer_id,
        label,
        street,
        neighborhood,
        city,
        state,
        number,
        complement,
        reference,
        full_address,
        latitude,
        longitude,
        is_default
      )

      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13
      )

      RETURNING *
    `, [
      customerId,
      label,
      street,
      neighborhood || null,
      city,
      state,
      number,
      complement || null,
      reference || null,
      fullAddress,
      latitude,
      longitude,
      isDefault
    ]);


    res.json({
      ok: true,
      address
    });

  } catch (error) {
    console.error('Erro ao cadastrar endereço:', error);

    res.status(500).json({
      error: 'Erro ao cadastrar endereço.'
    });
  }
});


// DEFINIR ENDEREÇO PADRÃO
app.put(
  '/api/customer/addresses/:id/default',
  requireCustomerAuth,
  async (req, res) => {

    try {
      const db = await getDb();

      const customerId = req.session.customerId;
      const addressId = Number(req.params.id);


      if (!addressId) {
        return res.status(400).json({
          error: 'Endereço inválido.'
        });
      }


      // VERIFICA SE O ENDEREÇO PERTENCE AO CLIENTE

      const address = await db.get(`
        SELECT id
        FROM customer_addresses
        WHERE id = $1
          AND customer_id = $2
      `, [
        addressId,
        customerId
      ]);


      if (!address) {
        return res.status(404).json({
          error: 'Endereço não encontrado.'
        });
      }


      // REMOVE PADRÃO DOS OUTROS ENDEREÇOS

      await db.run(`
        UPDATE customer_addresses
        SET
          is_default = FALSE,
          updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = $1
      `, [customerId]);


      // DEFINE O NOVO ENDEREÇO PADRÃO

      await db.run(`
        UPDATE customer_addresses
        SET
          is_default = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND customer_id = $2
      `, [
        addressId,
        customerId
      ]);


      res.json({
        ok: true
      });

    } catch (error) {
      console.error(
        'Erro ao definir endereço padrão:',
        error
      );

      res.status(500).json({
        error: 'Erro ao definir endereço padrão.'
      });
    }
  }
);


// EXCLUIR ENDEREÇO
app.delete(
  '/api/customer/addresses/:id',
  requireCustomerAuth,
  async (req, res) => {

    try {
      const db = await getDb();

      const customerId = req.session.customerId;
      const addressId = Number(req.params.id);


      if (!addressId) {
        return res.status(400).json({
          error: 'Endereço inválido.'
        });
      }


      // BUSCA O ENDEREÇO ANTES DE EXCLUIR

      const address = await db.get(`
        SELECT id, is_default
        FROM customer_addresses
        WHERE id = $1
          AND customer_id = $2
      `, [
        addressId,
        customerId
      ]);


      if (!address) {
        return res.status(404).json({
          error: 'Endereço não encontrado.'
        });
      }


      // EXCLUI

      await db.run(`
        DELETE FROM customer_addresses
        WHERE id = $1
          AND customer_id = $2
      `, [
        addressId,
        customerId
      ]);


      // SE ERA PADRÃO, ESCOLHE OUTRO

      if (address.is_default) {

        const nextAddress = await db.get(`
          SELECT id
          FROM customer_addresses
          WHERE customer_id = $1
          ORDER BY id DESC
          LIMIT 1
        `, [customerId]);


        if (nextAddress) {

          await db.run(`
            UPDATE customer_addresses
            SET
              is_default = TRUE,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [nextAddress.id]);

        }
      }


      res.json({
        ok: true
      });

    } catch (error) {
      console.error(
        'Erro ao excluir endereço:',
        error
      );

      res.status(500).json({
        error: 'Erro ao excluir endereço.'
      });
    }
  }
);

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
  try {
    const db = await getDb();

    // ================= BUSCAR PRODUTOS =================

    const products = await db.all(`
      SELECT 
        p.*,
        p.image_url AS image,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active = 1
      ORDER BY p.featured DESC, p.name ASC
    `);

    // ================= BUSCAR GRUPOS DE OPÇÕES =================

    const optionGroups = await db.all(`
      SELECT
        id,
        product_id,
        name,
        required,
        min_selections,
        max_selections,
        sort_order
      FROM product_option_groups
      WHERE active = TRUE
      ORDER BY sort_order ASC, id ASC
    `);

    // ================= BUSCAR OPÇÕES =================

    const options = await db.all(`
      SELECT
        id,
        group_id,
        name,
        price_adjustment,
        sort_order
      FROM product_options
      WHERE active = TRUE
      ORDER BY sort_order ASC, id ASC
    `);

    // ================= ORGANIZAR OPÇÕES NOS GRUPOS =================

    const groupsMap = new Map();

    for (const group of optionGroups) {
      groupsMap.set(group.id, {
        ...group,
        required: Boolean(group.required),
        min_selections: Number(group.min_selections || 0),
        max_selections: Number(group.max_selections || 1),
        options: []
      });
    }

    for (const option of options) {
      const group = groupsMap.get(option.group_id);

      if (!group) continue;

      group.options.push({
        ...option,
        price_adjustment: Number(option.price_adjustment || 0)
      });
    }

    // ================= ORGANIZAR GRUPOS NOS PRODUTOS =================

    const productGroupsMap = new Map();

    for (const group of groupsMap.values()) {
      if (!productGroupsMap.has(group.product_id)) {
        productGroupsMap.set(group.product_id, []);
      }

      productGroupsMap.get(group.product_id).push(group);
    }

    // ================= MONTAR RESPOSTA FINAL =================

    const result = products.map(product => ({
      ...product,

      price: Number(product.price || 0),

      option_groups: productGroupsMap.get(product.id) || []
    }));

    res.json(result);

  } catch (error) {
    console.error('Erro ao carregar produtos:', error);

    res.status(500).json({
      error: 'Erro ao carregar produtos.'
    });
  }
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
    ORDER BY p.name ASC
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


app.delete('/api/admin/categories/:id', requireAuth, async (req, res) => {
  const db = await getDb();

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Categoria inválida.' });

  const category = await db.get(`
    SELECT id, name FROM categories WHERE id = $1
  `, [id]);

  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const productsUsing = await db.get(`
    SELECT COUNT(*)::int AS total
    FROM products
    WHERE category_id = $1
  `, [id]);

  await db.run(`
    UPDATE products
    SET category_id = NULL
    WHERE category_id = $1
  `, [id]);

  await db.run(`
    DELETE FROM categories
    WHERE id = $1
  `, [id]);

  await logAudit(req, 'excluiu categoria', {
    id,
    categoria: category.name,
    produtos_afetados: Number(productsUsing?.total || 0)
  });

  res.json({ ok: true, productsAffected: Number(productsUsing?.total || 0) });
});

// ================= PEDIDOS =================

app.post('/api/orders', async (req, res) => {
  try {
    const db = await getDb();

    if (!req.session?.customerId) {
      return res.status(401).json({
        error: 'Faça login para finalizar o pedido.'
      });
    }

    const {
      items,
      customer_name,
      customer_phone,
      address,
      payment,
      note
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Pedido vazio.'
      });
    }

    let customerId = req.session.customerId;
    let total = 0;
    const validatedItems = [];

    for (const item of items) {
      const productId = Number(item.id || 0);
      const quantity = Number(item.quantity || 0);

      if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
        return res.status(400).json({
          error: 'Item inválido no pedido.'
        });
      }

      const product = await db.get(`
        SELECT id, name, price, active
        FROM products
        WHERE id = $1
      `, [productId]);

      if (!product || !product.active) {
        return res.status(400).json({
          error: 'Produto inválido ou indisponível.'
        });
      }

      const groups = await db.all(`
        SELECT
          id,
          name,
          required,
          min_selections,
          max_selections
        FROM product_option_groups
        WHERE product_id = $1
          AND active = TRUE
        ORDER BY sort_order ASC, id ASC
      `, [productId]);

      const requestedOptions = Array.isArray(item.selected_options)
        ? item.selected_options
        : [];

      const requestedOptionIds = requestedOptions
        .map(option => Number(option.id || 0))
        .filter(id => Number.isInteger(id) && id > 0);

      if (requestedOptionIds.length !== requestedOptions.length) {
        return res.status(400).json({
          error: `Há uma opção inválida no produto "${product.name}".`
        });
      }

      if (new Set(requestedOptionIds).size !== requestedOptionIds.length) {
        return res.status(400).json({
          error: `Há opções repetidas no produto "${product.name}".`
        });
      }

      let canonicalOptions = [];

      if (requestedOptionIds.length > 0) {
        const placeholders = requestedOptionIds
          .map((_, index) => `$${index + 2}`)
          .join(', ');

        canonicalOptions = await db.all(`
          SELECT
            po.id,
            po.group_id,
            po.name,
            po.price_adjustment
          FROM product_options po
          INNER JOIN product_option_groups pog
            ON pog.id = po.group_id
          WHERE pog.product_id = $1
            AND pog.active = TRUE
            AND po.active = TRUE
            AND po.id IN (${placeholders})
          ORDER BY pog.sort_order ASC, po.sort_order ASC, po.id ASC
        `, [productId, ...requestedOptionIds]);

        if (canonicalOptions.length !== requestedOptionIds.length) {
          return res.status(400).json({
            error: `Uma das opções escolhidas para "${product.name}" não é válida.`
          });
        }
      }

      for (const group of groups) {
        const selectedCount = canonicalOptions.filter(
          option => Number(option.group_id) === Number(group.id)
        ).length;

        const minSelections = Number(group.min_selections || 0);
        const maxSelections = Number(group.max_selections || 1);
        const required = Boolean(group.required);

        if (required && selectedCount < Math.max(1, minSelections)) {
          return res.status(400).json({
            error: `Selecione uma opção em "${group.name}" para o produto "${product.name}".`
          });
        }

        if (!required && selectedCount < minSelections) {
          return res.status(400).json({
            error: `Selecione pelo menos ${minSelections} opção(ões) em "${group.name}".`
          });
        }

        if (selectedCount > maxSelections) {
          return res.status(400).json({
            error: `Selecione no máximo ${maxSelections} opção(ões) em "${group.name}".`
          });
        }
      }

      if (!groups.length && canonicalOptions.length) {
        return res.status(400).json({
          error: `O produto "${product.name}" não possui opções disponíveis.`
        });
      }

      const selectedOptions = canonicalOptions.map(option => ({
        id: Number(option.id),
        group_id: Number(option.group_id),
        name: String(option.name || '').trim(),
        price_adjustment: Number(option.price_adjustment || 0)
      }));

      const optionsTotal = selectedOptions.reduce(
        (sum, option) => sum + option.price_adjustment,
        0
      );

      const basePrice = Number(product.price || 0);
      const unitPrice = basePrice + optionsTotal;
      const itemNote = String(item.item_note || '').trim().slice(0, 200);

      if (!product.name || unitPrice <= 0) {
        return res.status(400).json({
          error: 'Item inválido no pedido.'
        });
      }

      total += unitPrice * quantity;

      validatedItems.push({
        name: product.name,
        price: unitPrice,
        unit_price: unitPrice,
        quantity,
        selected_options: selectedOptions,
        item_note: itemNote
      });
    }

    let finalCustomerName = String(customer_name || '').trim();
    let finalCustomerPhone = String(customer_phone || '').trim();

    const customer = await db.get(`
      SELECT id, name, phone
      FROM customers
      WHERE id = $1
        AND is_active = TRUE
    `, [customerId]);

    if (!customer) {
      req.session.customerId = null;

      return res.status(401).json({
        error: 'Sua sessão expirou. Entre novamente para finalizar o pedido.'
      });
    }

    finalCustomerName = customer.name || finalCustomerName;
    finalCustomerPhone = customer.phone || finalCustomerPhone;

    const result = await db.get(`
      INSERT INTO orders (
        customer_id,
        customer_name,
        customer_phone,
        address,
        payment,
        note,
        total
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      customerId,
      finalCustomerName,
      finalCustomerPhone,
      String(address || '').trim(),
      String(payment || '').trim(),
      String(note || '').trim(),
      total
    ]);

    const orderId = result.id;

    for (const item of validatedItems) {
      await db.run(`
        INSERT INTO order_items (
          order_id,
          product_name,
          quantity,
          price,
          unit_price,
          selected_options,
          item_note
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `, [
        orderId,
        item.name,
        item.quantity,
        item.price,
        item.unit_price,
        JSON.stringify(item.selected_options),
        item.item_note || null
      ]);
    }

    res.json({
      ok: true,
      orderId,
      customerId
    });

  } catch (error) {
    console.error('Erro ao salvar pedido:', error);

    res.status(500).json({
      error: 'Erro ao salvar pedido.'
    });
  }
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

// ================= IMPRESSÃO DE PEDIDOS =================

function requirePrintAgent(req, res, next) {
  const expectedToken = process.env.PRINT_AGENT_TOKEN;

  if (!expectedToken) {
    return res.status(500).json({
      error: 'PRINT_AGENT_TOKEN não configurado no servidor.'
    });
  }

  const receivedToken = req.headers['x-print-agent-token'];

  if (receivedToken !== expectedToken) {
    return res.status(401).json({
      error: 'Agente de impressão não autorizado.'
    });
  }

  next();
}

app.get('/api/admin/orders/to-print', requirePrintAgent, async (req, res) => {
  try {
    const db = await getDb();

    const orders = await db.all(`
      SELECT *
      FROM orders
      WHERE
        status NOT IN ('cancelado', 'expirado')
        AND (
          COALESCE(is_printed, FALSE) = FALSE
          OR COALESCE(reprint_requested, FALSE) = TRUE
        )
      ORDER BY id ASC
      LIMIT 10
    `);

    for (const order of orders) {
      order.items = await db.all(`
        SELECT *
        FROM order_items
        WHERE order_id = $1
        ORDER BY id ASC
      `, [order.id]);
    }

    res.json({ ok: true, orders });
  } catch (error) {
    console.error('Erro ao buscar pedidos para impressão:', error);
    res.status(500).json({
      error: 'Erro ao buscar pedidos para impressão.'
    });
  }
});

app.post('/api/admin/orders/:id/printed', requirePrintAgent, async (req, res) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: 'Pedido inválido.'
      });
    }

    await db.run(`
      UPDATE orders
      SET
        is_printed = TRUE,
        printed_at = CURRENT_TIMESTAMP,
        reprint_requested = FALSE,
        reprint_requested_at = NULL
      WHERE id = $1
    `, [id]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao marcar pedido como impresso:', error);
    res.status(500).json({
      error: 'Erro ao marcar pedido como impresso.'
    });
  }
});

app.post('/api/admin/orders/:id/reprint', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: 'Pedido inválido.'
      });
    }

    const order = await db.get(`
      SELECT id
      FROM orders
      WHERE id = $1
    `, [id]);

    if (!order) {
      return res.status(404).json({
        error: 'Pedido não encontrado.'
      });
    }

    await db.run(`
      UPDATE orders
      SET
        reprint_requested = TRUE,
        reprint_requested_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    await logAudit(req, 'solicitou reimpressão de pedido', {
      pedido: id
    });

    res.json({
      ok: true,
      message: 'Pedido enviado para reimpressão.'
    });
  } catch (error) {
    console.error('Erro ao solicitar reimpressão:', error);
    res.status(500).json({
      error: 'Erro ao solicitar reimpressão.'
    });
  }
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