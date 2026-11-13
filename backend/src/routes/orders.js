const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getSettingsMap } = require('../config/database');
const { calculateRecipeMetrics, round2 } = require('../services/pricing');
const { convertQuantity } = require('../services/units');
const events = require('../services/events');

const VALID_STATUSES = ['orcamento', 'confirmado', 'em_producao', 'pronto', 'entregue', 'cancelado'];
const VALID_PAYMENT_STATUSES = ['pendente', 'sinal_pago', 'pago'];

function generateOrderCode(db) {
  const row = db.prepare('SELECT MAX(id) as maxId FROM orders').get();
  const next = (row?.maxId || 0) + 1;
  return `PED-${String(next).padStart(4, '0')}`;
}

function hydrateOrder(db, order, settings) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC').all(order.id);
  const remainingAmount = round2(Math.max(0, Number(order.total_amount) - Number(order.deposit_paid || 0)));
  const estimatedProfit = round2(Number(order.total_amount) - Number(order.total_cost || 0));

  const greeting = settings?.whatsapp_greeting || 'Olá! Segue o resumo do seu pedido:';
  const lines = [
    greeting,
    `*Pedido:* ${order.order_code}`,
    `*Cliente:* ${order.customer_name}`,
    `*Entrega/Retirada:* ${order.delivery_date} às ${order.delivery_time || 'a combinar'} (${order.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'})`,
    '',
    '*Itens:*',
    ...items.map((it) => `- ${it.quantity}x ${it.item_name}: R$ ${Number(it.unit_price * it.quantity).toFixed(2).replace('.', ',')}`),
  ];
  if (Number(order.delivery_fee) > 0) {
    lines.push(`- Taxa de entrega: R$ ${Number(order.delivery_fee).toFixed(2).replace('.', ',')}`);
  }
  if (Number(order.discount) > 0) {
    lines.push(`- Desconto: -R$ ${Number(order.discount).toFixed(2).replace('.', ',')}`);
  }
  lines.push('');
  lines.push(`*Total:* R$ ${Number(order.total_amount).toFixed(2).replace('.', ',')}`);
  lines.push(`*Sinal pago:* R$ ${Number(order.deposit_paid || 0).toFixed(2).replace('.', ',')}`);
  lines.push(`*Restante:* R$ ${remainingAmount.toFixed(2).replace('.', ',')}`);
  if (order.theme_description) {
    lines.push(`*Detalhes:* ${order.theme_description}`);
  }

  return {
    ...order,
    items,
    remaining_amount: remainingAmount,
    estimated_profit: estimatedProfit,
    whatsapp_summary: lines.join('\n'),
  };
}

function resolveOrderItems(db, rawItems, settings) {
  const recipeStmt = db.prepare('SELECT * FROM recipes WHERE id = ?');
  const recipeItemsStmt = db.prepare(`
    SELECT ri.*, i.name as ingredient_name, i.kind, i.purchase_unit, i.package_size, i.current_price
    FROM recipe_items ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = ?
  `);

  let totalCost = 0;
  let subtotal = 0;
  const resolved = [];

  for (const raw of rawItems) {
    const qty = Math.max(0.01, Number(raw.quantity) || 1);
    let itemName = String(raw.item_name || '').trim();
    let unitPrice = Math.max(0, Number(raw.unit_price) || 0);
    let unitCost = Math.max(0, Number(raw.unit_cost) || 0);
    const recipeId = raw.recipe_id ? Number(raw.recipe_id) : null;

    if (recipeId) {
      const recipe = recipeStmt.get(recipeId);
      if (recipe) {
        const rItems = recipeItemsStmt.all(recipe.id);
        const calc = calculateRecipeMetrics(recipe, rItems, settings);
        if (!itemName) itemName = recipe.name;
        if (!(Number(raw.unit_price) > 0)) {
          unitPrice = calc.metrics.effective_price;
        }
        if (!(Number(raw.unit_cost) > 0)) {
          unitCost = calc.metrics.total_cost;
        }
      }
    }

    if (!itemName) continue;

    subtotal += qty * unitPrice;
    totalCost += qty * unitCost;

    resolved.push({
      recipe_id: recipeId,
      item_name: itemName,
      quantity: qty,
      unit_price: round2(unitPrice),
      unit_cost: round2(unitCost),
      notes: String(raw.notes || '').trim(),
    });
  }

  return { resolved, subtotal: round2(subtotal), totalCost: round2(totalCost) };
}

function createOrdersRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.get('/', (req, res) => {
    const { status = '', date_from = '', date_to = '', search = '' } = req.query;
    const settings = getSettingsMap(db);
    const orders = db.prepare('SELECT * FROM orders ORDER BY delivery_date ASC, delivery_time ASC, id DESC').all();

    const filtered = orders
      .map((o) => hydrateOrder(db, o, settings))
      .filter((o) => {
        if (status && o.status !== status) return false;
        if (date_from && o.delivery_date < String(date_from)) return false;
        if (date_to && o.delivery_date > String(date_to)) return false;
        if (search) {
          const term = String(search).toLowerCase();
          return (
            o.order_code.toLowerCase().includes(term) ||
            o.customer_name.toLowerCase().includes(term) ||
            o.customer_phone.toLowerCase().includes(term) ||
            (o.theme_description || '').toLowerCase().includes(term) ||
            (o.flavor_notes || '').toLowerCase().includes(term)
          );
        }
        return true;
      });

    res.json({ orders: filtered });
  });

  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    const settings = getSettingsMap(db);
    res.json({ order: hydrateOrder(db, order, settings) });
  });

  router.post('/', authorize('admin', 'confeiteira', 'atendente'), (req, res) => {
    const body = req.body || {};
    const customerName = String(body.customer_name || '').trim();
    const customerPhone = String(body.customer_phone || '').trim();
    const deliveryDate = String(body.delivery_date || '').trim();

    if (!customerName || !customerPhone || !deliveryDate) {
      return res.status(400).json({ error: 'Nome do cliente, telefone e data de entrega são obrigatórios.' });
    }

    const settings = getSettingsMap(db);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const { resolved, subtotal, totalCost } = resolveOrderItems(db, rawItems, settings);

    if (resolved.length === 0) {
      return res.status(400).json({ error: 'Adicione pelo menos um item ao pedido.' });
    }

    const deliveryType = body.delivery_type === 'entrega' ? 'entrega' : 'retirada';
    const deliveryFee = deliveryType === 'entrega' ? Math.max(0, Number(body.delivery_fee) || 0) : 0;
    const discount = Math.max(0, Number(body.discount) || 0);
    const depositPaid = Math.max(0, Number(body.deposit_paid) || 0);
    const totalAmount = round2(Math.max(0, subtotal + deliveryFee - discount));

    let paymentStatus = VALID_PAYMENT_STATUSES.includes(body.payment_status) ? body.payment_status : 'pendente';
    if (!body.payment_status) {
      if (depositPaid >= totalAmount && totalAmount > 0) paymentStatus = 'pago';
      else if (depositPaid > 0) paymentStatus = 'sinal_pago';
    }

    const status = VALID_STATUSES.includes(body.status) ? body.status : 'orcamento';

    const tx = db.transaction(() => {
      let customerId = body.customer_id ? Number(body.customer_id) : null;
      if (!customerId && body.save_customer !== false) {
        const existingCustomer = db.prepare('SELECT id FROM customers WHERE phone = ? LIMIT 1').get(customerPhone);
        if (existingCustomer) {
          customerId = existingCustomer.id;
        } else {
          const digits = customerPhone.replace(/\D/g, '');
          const whatsapp = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
          customerId = db.prepare(`
            INSERT INTO customers (name, phone, whatsapp, address, created_by)
            VALUES (?, ?, ?, ?, ?)
          `).run(customerName, customerPhone, whatsapp, String(body.customer_address || '').trim(), req.user.id).lastInsertRowid;
        }
      }

      const orderCode = generateOrderCode(db);
      const info = db.prepare(`
        INSERT INTO orders (
          order_code, customer_id, customer_name, customer_phone, customer_address,
          delivery_date, delivery_time, delivery_type, delivery_fee, discount,
          deposit_paid, payment_method, payment_status, status, theme_description,
          flavor_notes, allergy_notes, general_notes, total_cost, total_amount, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderCode,
        customerId,
        customerName,
        customerPhone,
        String(body.customer_address || '').trim(),
        deliveryDate,
        String(body.delivery_time || '14:00').trim(),
        deliveryType,
        deliveryFee,
        discount,
        depositPaid,
        String(body.payment_method || 'Pix').trim(),
        paymentStatus,
        status,
        String(body.theme_description || '').trim(),
        String(body.flavor_notes || '').trim(),
        String(body.allergy_notes || '').trim(),
        String(body.general_notes || '').trim(),
        round2(totalCost + (deliveryType === 'entrega' ? 0 : 0)),
        totalAmount,
        req.user.id
      );

      const orderId = info.lastInsertRowid;
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, recipe_id, item_name, quantity, unit_price, unit_cost, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of resolved) {
        insertItem.run(orderId, item.recipe_id, item.item_name, item.quantity, item.unit_price, item.unit_cost, item.notes);
      }

      return orderId;
    });

    const newId = tx();
    const created = hydrateOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(newId), settings);
    events.broadcast('orders', 'created', { id: newId });
    events.broadcast('customers', 'synced', {});
    res.status(201).json({ order: created });
  });

  router.put('/:id', authorize('admin', 'confeiteira', 'atendente'), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const body = req.body || {};
    const settings = getSettingsMap(db);

    const customerName = body.customer_name !== undefined ? String(body.customer_name).trim() : existing.customer_name;
    const customerPhone = body.customer_phone !== undefined ? String(body.customer_phone).trim() : existing.customer_phone;
    const deliveryDate = body.delivery_date !== undefined ? String(body.delivery_date).trim() : existing.delivery_date;

    if (!customerName || !customerPhone || !deliveryDate) {
      return res.status(400).json({ error: 'Nome do cliente, telefone e data de entrega são obrigatórios.' });
    }

    const deliveryType = body.delivery_type !== undefined
      ? (body.delivery_type === 'entrega' ? 'entrega' : 'retirada')
      : existing.delivery_type;
    const deliveryFee = body.delivery_fee !== undefined
      ? (deliveryType === 'entrega' ? Math.max(0, Number(body.delivery_fee) || 0) : 0)
      : existing.delivery_fee;
    const discount = body.discount !== undefined ? Math.max(0, Number(body.discount) || 0) : existing.discount;
    const depositPaid = body.deposit_paid !== undefined ? Math.max(0, Number(body.deposit_paid) || 0) : existing.deposit_paid;
    const status = VALID_STATUSES.includes(body.status) ? body.status : existing.status;

    const tx = db.transaction(() => {
      let totalCost = existing.total_cost;
      let subtotal = 0;

      if (Array.isArray(body.items)) {
        const parsed = resolveOrderItems(db, body.items, settings);
        if (parsed.resolved.length === 0) {
          throw Object.assign(new Error('O pedido precisa de pelo menos um item.'), { status: 400 });
        }
        subtotal = parsed.subtotal;
        totalCost = parsed.totalCost;

        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, recipe_id, item_name, quantity, unit_price, unit_cost, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of parsed.resolved) {
          insertItem.run(id, item.recipe_id, item.item_name, item.quantity, item.unit_price, item.unit_cost, item.notes);
        }
      } else {
        const currentItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        subtotal = currentItems.reduce((acc, it) => acc + it.quantity * it.unit_price, 0);
      }

      const totalAmount = round2(Math.max(0, subtotal + deliveryFee - discount));
      let paymentStatus = VALID_PAYMENT_STATUSES.includes(body.payment_status) ? body.payment_status : existing.payment_status;
      if (!body.payment_status) {
        if (depositPaid >= totalAmount && totalAmount > 0) paymentStatus = 'pago';
        else if (depositPaid > 0) paymentStatus = 'sinal_pago';
        else paymentStatus = 'pendente';
      }

      db.prepare(`
        UPDATE orders SET
          customer_id = ?, customer_name = ?, customer_phone = ?, customer_address = ?,
          delivery_date = ?, delivery_time = ?, delivery_type = ?, delivery_fee = ?,
          discount = ?, deposit_paid = ?, payment_method = ?, payment_status = ?,
          status = ?, theme_description = ?, flavor_notes = ?, allergy_notes = ?,
          general_notes = ?, total_cost = ?, total_amount = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        body.customer_id !== undefined ? (body.customer_id ? Number(body.customer_id) : null) : existing.customer_id,
        customerName,
        customerPhone,
        body.customer_address !== undefined ? String(body.customer_address).trim() : existing.customer_address,
        deliveryDate,
        body.delivery_time !== undefined ? String(body.delivery_time).trim() : existing.delivery_time,
        deliveryType,
        deliveryFee,
        discount,
        depositPaid,
        body.payment_method !== undefined ? String(body.payment_method).trim() : existing.payment_method,
        paymentStatus,
        status,
        body.theme_description !== undefined ? String(body.theme_description).trim() : existing.theme_description,
        body.flavor_notes !== undefined ? String(body.flavor_notes).trim() : existing.flavor_notes,
        body.allergy_notes !== undefined ? String(body.allergy_notes).trim() : existing.allergy_notes,
        body.general_notes !== undefined ? String(body.general_notes).trim() : existing.general_notes,
        round2(totalCost),
        totalAmount,
        id
      );
    });

    tx();
    const updated = hydrateOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(id), settings);
    events.broadcast('orders', 'updated', { id });
    res.json({ order: updated });
  });

  router.patch('/:id/status', authorize('admin', 'confeiteira', 'atendente'), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const status = req.body?.status;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const deductStock = Boolean(req.body?.deduct_stock);

    const tx = db.transaction(() => {
      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(status, id);

      if (deductStock) {
        const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND recipe_id IS NOT NULL').all(id);
        const recipeItemsStmt = db.prepare(`
          SELECT ri.*, i.purchase_unit, i.stock_quantity
          FROM recipe_items ri
          JOIN ingredients i ON i.id = ri.ingredient_id
          WHERE ri.recipe_id = ?
        `);
        const updateStockStmt = db.prepare(
          "UPDATE ingredients SET stock_quantity = MAX(0, stock_quantity - ?), updated_at = datetime('now', 'localtime') WHERE id = ?"
        );

        for (const oi of orderItems) {
          const rItems = recipeItemsStmt.all(oi.recipe_id);
          for (const ri of rItems) {
            const qtyInPurchaseUnit = convertQuantity(ri.quantity * oi.quantity, ri.unit, ri.purchase_unit);
            updateStockStmt.run(qtyInPurchaseUnit, ri.ingredient_id);
          }
        }
      }
    });

    tx();
    const settings = getSettingsMap(db);
    const updated = hydrateOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(id), settings);
    events.broadcast('orders', 'status_changed', { id, status });
    if (deductStock) {
      events.broadcast('ingredients', 'stock_deducted', { order_id: id });
    }
    res.json({ order: updated });
  });

  router.delete('/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    events.broadcast('orders', 'deleted', { id });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createOrdersRouter;
