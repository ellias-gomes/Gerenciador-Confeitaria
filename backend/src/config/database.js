const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const env = require('./env');

let dbInstance = null;

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'confeiteira', 'atendente', 'visualizador')) DEFAULT 'visualizador',
      phone TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Ingrediente',
      kind TEXT NOT NULL CHECK(kind IN ('ingrediente', 'embalagem')) DEFAULT 'ingrediente',
      purchase_unit TEXT NOT NULL DEFAULT 'un',
      package_size REAL NOT NULL DEFAULT 1,
      current_price REAL NOT NULL DEFAULT 0,
      stock_quantity REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      supplier TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS ingredient_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      package_size REAL NOT NULL DEFAULT 1,
      purchase_unit TEXT NOT NULL DEFAULT 'un',
      supplier TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Bolo',
      description TEXT DEFAULT '',
      yield_quantity REAL NOT NULL DEFAULT 1,
      yield_unit TEXT NOT NULL DEFAULT 'un',
      prep_time_minutes INTEGER NOT NULL DEFAULT 60,
      instructions TEXT DEFAULT '',
      pricing_mode TEXT NOT NULL CHECK(pricing_mode IN ('margin', 'markup')) DEFAULT 'margin',
      target_margin_pct REAL DEFAULT NULL,
      markup_factor REAL NOT NULL DEFAULT 2.2,
      indirect_cost_pct REAL DEFAULT NULL,
      extra_cost REAL NOT NULL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      neighborhood TEXT DEFAULT '',
      reference_point TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT DEFAULT '',
      delivery_date TEXT NOT NULL,
      delivery_time TEXT DEFAULT '14:00',
      delivery_type TEXT NOT NULL CHECK(delivery_type IN ('retirada', 'entrega')) DEFAULT 'retirada',
      delivery_fee REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      deposit_paid REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'Pix',
      payment_status TEXT NOT NULL CHECK(payment_status IN ('pendente', 'sinal_pago', 'pago')) DEFAULT 'pendente',
      status TEXT NOT NULL CHECK(status IN ('orcamento', 'confirmado', 'em_producao', 'pronto', 'entregue', 'cancelado')) DEFAULT 'orcamento',
      theme_description TEXT DEFAULT '',
      flavor_notes TEXT DEFAULT '',
      allergy_notes TEXT DEFAULT '',
      general_notes TEXT DEFAULT '',
      total_cost REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS simulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      total_ingredients_cost REAL NOT NULL DEFAULT 0,
      total_services_cost REAL NOT NULL DEFAULT 0,
      total_estimated_spend REAL NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_ing ON ingredient_price_history(ingredient_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date, status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);
}

function seedDefaults(db, options = {}) {
  const defaultSettings = {
    bakery_name: env.BAKERY_NAME,
    labor_hour_rate: '22.00',
    default_indirect_cost_pct: '10',
    default_profit_margin_pct: '40',
    card_fee_pct: '3.5',
    daily_order_limit: '8',
    whatsapp_greeting: 'Olá! Segue o resumo do seu pedido na nossa confeitaria:',
  };

  const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, value);
  }

  const usersCount = db.prepare('SELECT COUNT(*) as total FROM users').get().total;
  let adminId = null;

  if (usersCount === 0) {
    const hash = bcrypt.hashSync(env.ADMIN_PASSWORD, 10);
    const info = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, active)
      VALUES (?, ?, ?, 'admin', '', 1)
    `).run(env.ADMIN_NAME, env.ADMIN_EMAIL.toLowerCase(), hash);
    adminId = info.lastInsertRowid;
  } else {
    const firstAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    adminId = firstAdmin?.id || null;
  }

  if (options.seedDemoData === false) {
    return;
  }

  const ingredientsCount = db.prepare('SELECT COUNT(*) as total FROM ingredients').get().total;
  if (ingredientsCount > 0) {
    return;
  }

  // Dados iniciais de exemplo para facilitar o início imediato da confeitaria
  const insertIng = db.prepare(`
    INSERT INTO ingredients (
      name, category, kind, purchase_unit, package_size, current_price,
      stock_quantity, min_stock, supplier, brand, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHist = db.prepare(`
    INSERT INTO ingredient_price_history (
      ingredient_id, price, package_size, purchase_unit, supplier, brand, notes, recorded_by, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleIngredients = [
    {
      name: 'Leite Condensado Integral',
      category: 'Laticínios',
      kind: 'ingrediente',
      purchase_unit: 'g',
      package_size: 395,
      current_price: 6.49,
      stock_quantity: 2370,
      min_stock: 1185,
      supplier: 'Atacadão Doce Lar',
      brand: 'Moça / Piracanjuba',
      notes: 'Caixinha 395g (8% gordura)',
      history: [
        { price: 5.49, daysAgo: 45, supplier: 'Atacadão Doce Lar' },
        { price: 5.89, daysAgo: 25, supplier: 'Supermercado Central' },
        { price: 6.19, daysAgo: 10, supplier: 'Atacadão Doce Lar' },
        { price: 6.49, daysAgo: 1, supplier: 'Atacadão Doce Lar' },
      ],
    },
    {
      name: 'Creme de Leite UHT 20%',
      category: 'Laticínios',
      kind: 'ingrediente',
      purchase_unit: 'g',
      package_size: 200,
      current_price: 3.79,
      stock_quantity: 1200,
      min_stock: 600,
      supplier: 'Atacadão Doce Lar',
      brand: 'Italac',
      notes: 'Caixinha 200g',
      history: [
        { price: 3.99, daysAgo: 40, supplier: 'Supermercado Central' },
        { price: 3.85, daysAgo: 15, supplier: 'Atacadão Doce Lar' },
        { price: 3.79, daysAgo: 2, supplier: 'Atacadão Doce Lar' },
      ],
    },
    {
      name: 'Chocolate em Pó 50% Cacau',
      category: 'Chocolates',
      kind: 'ingrediente',
      purchase_unit: 'g',
      package_size: 500,
      current_price: 26.90,
      stock_quantity: 1000,
      min_stock: 500,
      supplier: 'Casa da Confeiteira',
      brand: 'Melken / Sicao',
      notes: 'Pacote 500g',
      history: [
        { price: 22.50, daysAgo: 50, supplier: 'Casa da Confeiteira' },
        { price: 24.90, daysAgo: 20, supplier: 'Casa da Confeiteira' },
        { price: 26.90, daysAgo: 3, supplier: 'Casa da Confeiteira' },
      ],
    },
    {
      name: 'Manteiga Sem Sal Extra',
      category: 'Laticínios',
      kind: 'ingrediente',
      purchase_unit: 'g',
      package_size: 200,
      current_price: 11.90,
      stock_quantity: 600,
      min_stock: 400,
      supplier: 'Supermercado Central',
      brand: 'Itambé',
      notes: 'Tablete 200g',
      history: [
        { price: 11.50, daysAgo: 35, supplier: 'Supermercado Central' },
        { price: 11.80, daysAgo: 14, supplier: 'Atacadão Doce Lar' },
        { price: 11.90, daysAgo: 2, supplier: 'Supermercado Central' },
      ],
    },
    {
      name: 'Farinha de Trigo Tipo 1',
      category: 'Secos',
      kind: 'ingrediente',
      purchase_unit: 'kg',
      package_size: 1,
      current_price: 5.40,
      stock_quantity: 4,
      min_stock: 2,
      supplier: 'Atacadão Doce Lar',
      brand: 'Dona Benta',
      notes: 'Pacote 1kg',
      history: [
        { price: 5.90, daysAgo: 40, supplier: 'Supermercado Central' },
        { price: 5.60, daysAgo: 18, supplier: 'Atacadão Doce Lar' },
        { price: 5.40, daysAgo: 4, supplier: 'Atacadão Doce Lar' },
      ],
    },
    {
      name: 'Açúcar Refinado',
      category: 'Secos',
      kind: 'ingrediente',
      purchase_unit: 'kg',
      package_size: 1,
      current_price: 4.80,
      stock_quantity: 5,
      min_stock: 2,
      supplier: 'Atacadão Doce Lar',
      brand: 'União',
      notes: 'Pacote 1kg',
      history: [
        { price: 4.75, daysAgo: 30, supplier: 'Atacadão Doce Lar' },
        { price: 4.80, daysAgo: 5, supplier: 'Atacadão Doce Lar' },
      ],
    },
    {
      name: 'Ovos Brancos Grandes',
      category: 'Ovos e Frescos',
      kind: 'ingrediente',
      purchase_unit: 'un',
      package_size: 30,
      current_price: 21.00,
      stock_quantity: 30,
      min_stock: 12,
      supplier: 'Granja Bom Ovo',
      brand: 'Pente 30 un',
      notes: 'Pente com 30 unidades',
      history: [
        { price: 18.50, daysAgo: 35, supplier: 'Granja Bom Ovo' },
        { price: 19.90, daysAgo: 15, supplier: 'Supermercado Central' },
        { price: 21.00, daysAgo: 1, supplier: 'Granja Bom Ovo' },
      ],
    },
    {
      name: 'Granulado Belga ao Leite',
      category: 'Confeitos',
      kind: 'ingrediente',
      purchase_unit: 'g',
      package_size: 400,
      current_price: 19.50,
      stock_quantity: 800,
      min_stock: 400,
      supplier: 'Casa da Confeiteira',
      brand: 'Callebaut / Sicao',
      notes: 'Pacote 400g',
      history: [
        { price: 18.00, daysAgo: 30, supplier: 'Casa da Confeiteira' },
        { price: 19.50, daysAgo: 4, supplier: 'Casa da Confeiteira' },
      ],
    },
    {
      name: 'Forminha nº 4 Kraft/Branca',
      category: 'Embalagens',
      kind: 'embalagem',
      purchase_unit: 'un',
      package_size: 100,
      current_price: 7.50,
      stock_quantity: 300,
      min_stock: 100,
      supplier: 'Casa das Embalagens',
      brand: 'Ultrafest',
      notes: 'Pacote com 100 forminhas',
      history: [
        { price: 7.20, daysAgo: 25, supplier: 'Casa das Embalagens' },
        { price: 7.50, daysAgo: 3, supplier: 'Casa das Embalagens' },
      ],
    },
    {
      name: 'Caixa para Bolo 25cm c/ Visor',
      category: 'Embalagens',
      kind: 'embalagem',
      purchase_unit: 'un',
      package_size: 10,
      current_price: 38.00,
      stock_quantity: 12,
      min_stock: 5,
      supplier: 'Casa das Embalagens',
      brand: 'Ideia Embalagens',
      notes: 'Pacote com 10 caixas',
      history: [
        { price: 36.00, daysAgo: 30, supplier: 'Casa das Embalagens' },
        { price: 38.00, daysAgo: 6, supplier: 'Casa das Embalagens' },
      ],
    },
  ];

  const ingredientIds = {};
  for (const ing of sampleIngredients) {
    const res = insertIng.run(
      ing.name,
      ing.category,
      ing.kind,
      ing.purchase_unit,
      ing.package_size,
      ing.current_price,
      ing.stock_quantity,
      ing.min_stock,
      ing.supplier,
      ing.brand,
      ing.notes,
      adminId
    );
    const id = res.lastInsertRowid;
    ingredientIds[ing.name] = id;

    for (const h of ing.history) {
      const dateStr = new Date(Date.now() - h.daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      insertHist.run(id, h.price, ing.package_size, ing.purchase_unit, h.supplier, ing.brand, 'Registro histórico', adminId, dateStr);
    }
  }

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (
      name, category, description, yield_quantity, yield_unit, prep_time_minutes,
      instructions, pricing_mode, target_margin_pct, markup_factor, indirect_cost_pct,
      extra_cost, sale_price, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRecipeItem = db.prepare(`
    INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const brigadeiroId = insertRecipe.run(
    'Brigadeiro Gourmet Tradicional',
    'Docinho',
    'Brigadeiro cremoso enrolado de 18g com granulado nobre.',
    25,
    'un',
    45,
    '1. Misturar leite condensado, creme de leite, chocolate 50% e manteiga em fogo médio.\n2. Mexer até ponto de enrolar (soltando do fundo da panela).\n3. Descansar 6h em plástico filme, bolear 18g e passar no granulado.',
    'margin',
    40,
    2.2,
    10,
    0,
    85.00,
    adminId
  ).lastInsertRowid;

  insertRecipeItem.run(brigadeiroId, ingredientIds['Leite Condensado Integral'], 395, 'g', '1 caixinha');
  insertRecipeItem.run(brigadeiroId, ingredientIds['Creme de Leite UHT 20%'], 100, 'g', '1/2 caixinha');
  insertRecipeItem.run(brigadeiroId, ingredientIds['Chocolate em Pó 50% Cacau'], 45, 'g', '3 colheres de sopa cheias');
  insertRecipeItem.run(brigadeiroId, ingredientIds['Manteiga Sem Sal Extra'], 15, 'g', '1 colher de sopa rasa');
  insertRecipeItem.run(brigadeiroId, ingredientIds['Granulado Belga ao Leite'], 120, 'g', 'Para finalizar');
  insertRecipeItem.run(brigadeiroId, ingredientIds['Forminha nº 4 Kraft/Branca'], 25, 'un', '1 por unidade');

  const boloId = insertRecipe.run(
    'Bolo Vulcão de Chocolate (Aro 20cm)',
    'Bolo',
    'Massa fofinha de chocolate com cobertura generosa de brigadeiro cremoso.',
    1,
    'bolo',
    75,
    '1. Bater ovos, açúcar e manteiga.\n2. Intercalar farinha e chocolate 50% com água morna.\n3. Assar a 180°C por 35 minutos.\n4. Cobrir com brigadeiro cremoso no centro.',
    'margin',
    40,
    2.2,
    10,
    0,
    95.00,
    adminId
  ).lastInsertRowid;

  insertRecipeItem.run(boloId, ingredientIds['Ovos Brancos Grandes'], 3, 'un', 'Temperatura ambiente');
  insertRecipeItem.run(boloId, ingredientIds['Açúcar Refinado'], 250, 'g', '');
  insertRecipeItem.run(boloId, ingredientIds['Farinha de Trigo Tipo 1'], 240, 'g', 'Peneirada');
  insertRecipeItem.run(boloId, ingredientIds['Chocolate em Pó 50% Cacau'], 90, 'g', 'Massa + cobertura');
  insertRecipeItem.run(boloId, ingredientIds['Manteiga Sem Sal Extra'], 80, 'g', '');
  insertRecipeItem.run(boloId, ingredientIds['Leite Condensado Integral'], 395, 'g', 'Cobertura vulcão');
  insertRecipeItem.run(boloId, ingredientIds['Creme de Leite UHT 20%'], 200, 'g', 'Cobertura vulcão');
  insertRecipeItem.run(boloId, ingredientIds['Caixa para Bolo 25cm c/ Visor'], 1, 'un', 'Embalagem de entrega');

  // Cliente e Pedido de exemplo
  const customerId = db.prepare(`
    INSERT INTO customers (name, phone, whatsapp, email, address, neighborhood, reference_point, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Mariana Souza',
    '(11) 99876-5432',
    '5511998765432',
    'mariana@exemplo.com',
    'Rua das Flores, 145 - Apto 22',
    'Centro',
    'Próximo à praça matriz',
    'Prefere doces menos doces (chocolate 50%)',
    adminId
  ).lastInsertRowid;

  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const orderId = db.prepare(`
    INSERT INTO orders (
      order_code, customer_id, customer_name, customer_phone, customer_address,
      delivery_date, delivery_time, delivery_type, delivery_fee, discount,
      deposit_paid, payment_method, payment_status, status, theme_description,
      flavor_notes, allergy_notes, general_notes, total_cost, total_amount, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'PED-0001',
    customerId,
    'Mariana Souza',
    '(11) 99876-5432',
    'Rua das Flores, 145 - Apto 22, Centro',
    tomorrow,
    '16:00',
    'entrega',
    12.00,
    0,
    90.00,
    'Pix',
    'sinal_pago',
    'confirmado',
    'Aniversário intimista - Laço dourado na caixa e tag "Parabéns!"',
    'Bolo Vulcão Chocolate + 25 Brigadeiros Gourmet',
    'Sem restrições informadas',
    'Confirmar saída da entrega 30 min antes via WhatsApp',
    76.50,
    192.00,
    adminId
  ).lastInsertRowid;

  db.prepare(`
    INSERT INTO order_items (order_id, recipe_id, item_name, quantity, unit_price, unit_cost, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, boloId, 'Bolo Vulcão de Chocolate (Aro 20cm)', 1, 95.00, 44.50, 'Com laço dourado');

  db.prepare(`
    INSERT INTO order_items (order_id, recipe_id, item_name, quantity, unit_price, unit_cost, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, brigadeiroId, 'Brigadeiro Gourmet Tradicional (lote 25 un)', 1, 85.00, 32.00, 'Forminhas kraft');
}

function initDatabase(customPath = null, options = {}) {
  const targetPath = customPath || env.DB_PATH;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createSchema(db);
  seedDefaults(db, options);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

function getDb() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

function getSettingsMap(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

module.exports = {
  initDatabase,
  getDb,
  getSettingsMap,
};
