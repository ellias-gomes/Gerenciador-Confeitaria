process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const env = require('../src/config/env');
const { initDatabase } = require('../src/config/database');
const createApp = require('../src/app');

let db;
let server;
let baseUrl;
let adminToken;
let viewerToken;
let viewerId;

async function req(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

test.before(async () => {
  db = initDatabase(':memory:', { seedDemoData: false });
  const app = createApp(db);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

test('GET /api/health responde ok sem autenticação', async () => {
  const { status, data } = await req('/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.bakery_name);
});

test('Autenticação e RBAC: bloqueio anônimo, login admin e cadastro seguro', async () => {
  const unauth = await req('/api/ingredients');
  assert.equal(unauth.status, 401);

  const loginRes = await req('/api/auth/login', {
    method: 'POST',
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.data.user.role, 'admin');
  adminToken = loginRes.data.token;

  const regRes = await req('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Irmã Atendente',
      email: 'irma@confeitaria.local',
      password: 'senha123',
      role: 'admin', // tentativa de escalação deve ser ignorada
    },
  });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.data.user.role, env.DEFAULT_REGISTER_ROLE);
  viewerToken = regRes.data.token;
  viewerId = regRes.data.user.id;

  // Visualizador não pode criar insumo nem listar usuários
  const forbiddenIng = await req('/api/ingredients', {
    method: 'POST',
    token: viewerToken,
    body: { name: 'Teste', purchase_unit: 'g', package_size: 100, current_price: 5 },
  });
  assert.equal(forbiddenIng.status, 403);

  const forbiddenUsers = await req('/api/users', { token: viewerToken });
  assert.equal(forbiddenUsers.status, 403);
});

test('Insumos, histórico de preços e detecção de tendência de alta', async () => {
  const createRes = await req('/api/ingredients', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Açúcar Especial',
      category: 'Secos',
      kind: 'ingrediente',
      purchase_unit: 'kg',
      package_size: 1,
      current_price: 5.0,
      stock_quantity: 1,
      min_stock: 2,
      supplier: 'Mercado A',
    },
  });
  assert.equal(createRes.status, 201);
  const ingId = createRes.data.ingredient.id;

  const p1 = await req(`/api/ingredients/${ingId}/prices`, {
    method: 'POST',
    token: adminToken,
    body: { price: 5.5, supplier: 'Mercado B', add_to_stock_qty: 1 },
  });
  assert.equal(p1.status, 201);

  const p2 = await req(`/api/ingredients/${ingId}/prices`, {
    method: 'POST',
    token: adminToken,
    body: { price: 6.5, supplier: 'Mercado A', add_to_stock_qty: 0 },
  });
  assert.equal(p2.status, 201);
  assert.equal(p2.data.analysis.trend, 'subindo');
  assert.equal(p2.data.analysis.records_count, 3);
  assert.equal(p2.data.ingredient.stock_quantity, 2);

  const analysisRes = await req(`/api/ingredients/${ingId}/analysis`, { token: adminToken });
  assert.equal(analysisRes.status, 200);
  assert.equal(analysisRes.data.suppliers.length, 2);
});

test('Receitas com conversão de unidades (kg <-> g) e cálculo automático de custo', async () => {
  const listIng = await req('/api/ingredients', { token: adminToken });
  const sugar = listIng.data.ingredients.find((i) => i.name === 'Açúcar Especial');
  assert.ok(sugar);

  // 500g de um saco de 1kg a R$ 6,50 -> custo direto = R$ 3,25
  const recRes = await req('/api/recipes', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Calda de Caramelo',
      category: 'Recheio',
      yield_quantity: 1,
      yield_unit: 'lote',
      prep_time_minutes: 30,
      pricing_mode: 'margin',
      target_margin_pct: 40,
      indirect_cost_pct: 10,
      items: [{ ingredient_id: sugar.id, quantity: 500, unit: 'g' }],
    },
  });
  assert.equal(recRes.status, 201);
  const metrics = recRes.data.recipe.metrics;
  assert.equal(metrics.direct_cost, 3.25);
  assert.equal(metrics.indirect_cost, 0.33); // 10% de 3.25 = 0.325 -> 0.33
  assert.ok(metrics.suggested_price > metrics.total_cost);

  const dupRes = await req(`/api/recipes/${recRes.data.recipe.id}/duplicate`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(dupRes.status, 201);
  assert.match(dupRes.data.recipe.name, /\(Cópia\)/);
});

test('Admin promove usuária para atendente, cria pedido e calcula lista de compras + serviços', async () => {
  const promoteRes = await req(`/api/users/${viewerId}`, {
    method: 'PUT',
    token: adminToken,
    body: { role: 'atendente' },
  });
  assert.equal(promoteRes.status, 200);
  assert.equal(promoteRes.data.user.role, 'atendente');

  const recList = await req('/api/recipes', { token: viewerToken });
  const recipe = recList.data.recipes[0];

  const orderRes = await req('/api/orders', {
    method: 'POST',
    token: viewerToken,
    body: {
      customer_name: 'Ana Paula',
      customer_phone: '(11) 98888-7777',
      delivery_date: '2026-12-20',
      delivery_type: 'entrega',
      delivery_fee: 15,
      deposit_paid: 30,
      theme_description: 'Festa infantil tema jardim',
      items: [{ recipe_id: recipe.id, quantity: 6, unit_price: 50 }],
    },
  });
  assert.equal(orderRes.status, 201);
  assert.equal(orderRes.data.order.order_code, 'PED-0001');
  assert.equal(orderRes.data.order.total_amount, 315); // 6*50 + 15
  assert.equal(orderRes.data.order.remaining_amount, 285);
  assert.equal(orderRes.data.order.payment_status, 'sinal_pago');

  // Calculadora de produção: pedido precisa de 6 * 500g = 3kg de açúcar; estoque tem 2kg -> falta comprar 1kg!
  const calcRes = await req('/api/planner/calculate', {
    method: 'POST',
    token: viewerToken,
    body: {
      order_ids: [orderRes.data.order.id],
      services: [{ name: 'Topo de bolo', cost: 25 }],
      consider_stock: true,
    },
  });
  assert.equal(calcRes.status, 200);
  assert.equal(calcRes.data.shopping_list.length, 1);
  assert.equal(calcRes.data.shopping_list[0].needed_qty, 3);
  assert.equal(calcRes.data.shopping_list[0].missing_qty, 1);
  assert.equal(calcRes.data.shopping_list[0].packages_to_buy, 1);
  assert.equal(calcRes.data.summary.total_services_cost, 25);
  assert.equal(calcRes.data.summary.total_out_of_pocket_spend, 31.5); // 6.50 do açúcar + 25.00 serviço

  const dashRes = await req('/api/dashboard', { token: viewerToken });
  assert.equal(dashRes.status, 200);
  assert.equal(dashRes.data.kpis.active_orders_count, 1);
});

test('Ajuste rápido de estoque e isolamento/compartilhamento entre equipes', async () => {
  const listIng = await req('/api/ingredients', { token: adminToken });
  const sugar = listIng.data.ingredients.find((i) => i.name === 'Açúcar Especial');
  assert.ok(sugar);

  // Ajuste rápido de estoque (+1.5 -> 3.5, depois fixado para 2.25)
  const patchDelta = await req(`/api/ingredients/${sugar.id}/stock`, {
    method: 'PATCH',
    token: adminToken,
    body: { delta: 1.5 },
  });
  assert.equal(patchDelta.status, 200);
  assert.equal(patchDelta.data.ingredient.stock_quantity, 3.5);

  const patchExact = await req(`/api/ingredients/${sugar.id}/stock`, {
    method: 'PATCH',
    token: adminToken,
    body: { stock_quantity: 2.25 },
  });
  assert.equal(patchExact.status, 200);
  assert.equal(patchExact.data.ingredient.stock_quantity, 2.25);

  // Novo cadastro criando sua própria equipe -> vira admin da Equipe 2
  const team2Reg = await req('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Clara Chef',
      email: 'clara@doceatelier.local',
      password: 'senhaSegura123',
      team_name: 'Doce Atelier',
    },
  });
  assert.equal(team2Reg.status, 201);
  assert.equal(team2Reg.data.user.role, 'admin');
  assert.equal(team2Reg.data.team.name, 'Doce Atelier');
  assert.ok(team2Reg.data.team.invite_code);

  const team2Token = team2Reg.data.token;
  const team2Invite = team2Reg.data.team.invite_code;

  // Equipe 2 não enxerga dados da Equipe 1
  const t2Ingredients = await req('/api/ingredients', { token: team2Token });
  assert.equal(t2Ingredients.status, 200);
  assert.equal(t2Ingredients.data.ingredients.length, 0);

  // Cria insumo na Equipe 2
  const t2CreateIng = await req('/api/ingredients', {
    method: 'POST',
    token: team2Token,
    body: {
      name: 'Chocolate Belga 70%',
      purchase_unit: 'kg',
      package_size: 1,
      current_price: 89.9,
      stock_quantity: 3,
    },
  });
  assert.equal(t2CreateIng.status, 201);

  // Altera cargo padrão de entrada na Equipe 2 para 'confeiteira'
  const updateTeam = await req('/api/teams/current', {
    method: 'PUT',
    token: team2Token,
    body: { default_join_role: 'confeiteira' },
  });
  assert.equal(updateTeam.status, 200);
  assert.equal(updateTeam.data.team.default_join_role, 'confeiteira');

  // Novo membro entra via invite_code da Equipe 2 e compartilha os mesmos insumos
  const memberReg = await req('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Lucas Auxiliar',
      email: 'lucas@doceatelier.local',
      password: 'senhaSegura123',
      invite_code: team2Invite,
    },
  });
  assert.equal(memberReg.status, 201);
  assert.equal(memberReg.data.user.role, 'confeiteira');
  assert.equal(memberReg.data.team.id, team2Reg.data.team.id);

  const memberIng = await req('/api/ingredients', { token: memberReg.data.token });
  assert.equal(memberIng.status, 200);
  assert.equal(memberIng.data.ingredients.length, 1);
  assert.equal(memberIng.data.ingredients[0].name, 'Chocolate Belga 70%');

  // Equipe 1 continua vendo apenas seus próprios dados
  const t1Ingredients = await req('/api/ingredients', { token: adminToken });
  assert.ok(t1Ingredients.data.ingredients.every((i) => i.name !== 'Chocolate Belga 70%'));
});
