const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");

const JSON_PATH = path.join(__dirname, "..", "data", "database.json");

function normalizePrice(value) {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number") return value;

  const cleaned = String(value)
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

async function migrate() {
  const db = await getDb();

  if (!fs.existsSync(JSON_PATH)) {
    console.log("database.json não encontrado. Banco SQLite criado vazio.");
    return;
  }

  const raw = fs.readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);

  const categories = data.categories || data.categorias || [];
  const products = data.products || data.produtos || [];

  const categoryMap = new Map();

  for (const category of categories) {
    const name = category.name || category.nome || category.title || "Categoria";

    const result = await db.run(
      `
      INSERT INTO categories (name, active, sort_order)
      VALUES (?, ?, ?)
      `,
      [
        name,
        category.active === false ? 0 : 1,
        category.sort_order || category.ordem || 0
      ]
    );

    if (category.id !== undefined && category.id !== null) {
      categoryMap.set(String(category.id), result.lastID);
    }
  }

  for (const product of products) {
    const oldCategoryId =
      product.category_id ||
      product.categoryId ||
      product.categoria_id ||
      product.categoriaId;

    const newCategoryId =
      oldCategoryId !== undefined && oldCategoryId !== null
        ? categoryMap.get(String(oldCategoryId)) || null
        : null;

    await db.run(
      `
      INSERT INTO products (
        category_id,
        name,
        description,
        price,
        image_url,
        active,
        featured,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        newCategoryId,
        product.name || product.nome || "Produto sem nome",
        product.description || product.descricao || "",
        normalizePrice(product.price || product.preco || product.valor),
        product.image_url || product.image || product.imagem || "",
        product.active === false ? 0 : 1,
        product.featured === true || product.destaque === true ? 1 : 0,
        product.sort_order || product.ordem || 0
      ]
    );
  }

  if (data.admin) {
    const username = data.admin.username || data.admin.usuario || "admin";
    const passwordHash =
      data.admin.passwordHash ||
      data.admin.password_hash ||
      data.admin.senhaHash ||
      null;

    const finalHash = passwordHash || await bcrypt.hash("admin123", 10);

    await db.run(
      `
      INSERT OR REPLACE INTO admin_user (id, username, password_hash)
      VALUES (1, ?, ?)
      `,
      [username, finalHash]
    );
  } else {
    const hash = await bcrypt.hash("admin123", 10);

    await db.run(
      `
      INSERT OR IGNORE INTO admin_user (id, username, password_hash)
      VALUES (1, 'admin', ?)
      `,
      [hash]
    );
  }

  console.log("Migração concluída com sucesso.");
  console.log(`Categorias migradas: ${categories.length}`);
  console.log(`Produtos migrados: ${products.length}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erro na migração:", error);
    process.exit(1);
  });