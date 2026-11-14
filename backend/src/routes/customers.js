const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const events = require('../services/events');

function normalizeWhatsapp(phone, explicitWhatsapp) {
  const raw = String(explicitWhatsapp || phone || '').replace(/\D/g, '');
  if (!raw) return '';
  if (raw.length === 10 || raw.length === 11) {
    return `55${raw}`;
  }
  return raw;
}

function createCustomersRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.get('/', (req, res) => {
    const teamId = req.user.team_id || 1;
    const search = String(req.query.search || '').trim().toLowerCase();
    const customers = db.prepare(`
      SELECT c.*,
             COUNT(o.id) as orders_count,
             COALESCE(SUM(CASE WHEN o.status != 'cancelado' THEN o.total_amount ELSE 0 END), 0) as total_spent,
             MAX(o.delivery_date) as last_order_date
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.team_id = c.team_id
      WHERE c.team_id = ?
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE ASC
    `).all(teamId);

    const filtered = search
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(search) ||
            (c.phone || '').toLowerCase().includes(search) ||
            (c.neighborhood || '').toLowerCase().includes(search) ||
            (c.email || '').toLowerCase().includes(search)
        )
      : customers;

    res.json({ customers: filtered });
  });

  router.get('/:id', (req, res) => {
    const teamId = req.user.team_id || 1;
    const id = Number(req.params.id);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND team_id = ?').get(id, teamId);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? AND team_id = ? ORDER BY delivery_date DESC, id DESC').all(id, teamId);
    res.json({ customer, orders });
  });

  router.post('/', authorize('admin', 'confeiteira', 'atendente'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone do cliente são obrigatórios.' });
    }

    const whatsapp = normalizeWhatsapp(phone, body.whatsapp);
    const info = db.prepare(`
      INSERT INTO customers (team_id, name, phone, whatsapp, email, address, neighborhood, reference_point, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      teamId,
      name,
      phone,
      whatsapp,
      String(body.email || '').trim(),
      String(body.address || '').trim(),
      String(body.neighborhood || '').trim(),
      String(body.reference_point || '').trim(),
      String(body.notes || '').trim(),
      req.user.id
    );

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    events.broadcast('customers', 'created', { id: customer.id }, teamId);
    res.status(201).json({ customer });
  });

  router.put('/:id', authorize('admin', 'confeiteira', 'atendente'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND team_id = ?').get(id, teamId);
    if (!existing) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const phone = body.phone !== undefined ? String(body.phone).trim() : existing.phone;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone do cliente são obrigatórios.' });
    }

    const whatsapp = normalizeWhatsapp(phone, body.whatsapp !== undefined ? body.whatsapp : existing.whatsapp);

    db.prepare(`
      UPDATE customers SET
        name = ?, phone = ?, whatsapp = ?, email = ?, address = ?,
        neighborhood = ?, reference_point = ?, notes = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ? AND team_id = ?
    `).run(
      name,
      phone,
      whatsapp,
      body.email !== undefined ? String(body.email).trim() : existing.email,
      body.address !== undefined ? String(body.address).trim() : existing.address,
      body.neighborhood !== undefined ? String(body.neighborhood).trim() : existing.neighborhood,
      body.reference_point !== undefined ? String(body.reference_point).trim() : existing.reference_point,
      body.notes !== undefined ? String(body.notes).trim() : existing.notes,
      id,
      teamId
    );

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    events.broadcast('customers', 'updated', { id }, teamId);
    res.json({ customer });
  });

  router.delete('/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM customers WHERE id = ? AND team_id = ?').run(id, teamId);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    events.broadcast('customers', 'deleted', { id }, teamId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = createCustomersRouter;
