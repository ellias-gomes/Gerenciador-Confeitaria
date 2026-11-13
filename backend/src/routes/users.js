const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const events = require('../services/events');

function createUsersRouter(db) {
  const router = express.Router();

  router.use(authenticate(db));
  router.use(authorize('admin'));

  router.get('/', (_req, res) => {
    const users = db.prepare(
      'SELECT id, name, email, role, phone, active, created_at, updated_at FROM users ORDER BY id ASC'
    ).all();
    res.json({ users });
  });

  router.post('/', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'atendente';
    const phone = String(req.body?.phone || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(name, email, hash, role, phone);

    const user = db.prepare(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    events.broadcast('users', 'created', { id: user.id });
    res.status(201).json({ user });
  });

  router.put('/:id', (req, res) => {
    const targetId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!existing) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : existing.phone;
    const role = req.body?.role !== undefined ? req.body.role : existing.role;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
    const newPassword = req.body?.password ? String(req.body.password) : '';

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Nível de acesso inválido.' });
    }

    if (targetId === req.user.id && (role !== 'admin' || active === 0)) {
      return res.status(400).json({ error: 'Você não pode rebaixar ou desativar seu próprio usuário administrador.' });
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      }
      const hash = bcrypt.hashSync(newPassword, 10);
      db.prepare(`
        UPDATE users SET name = ?, phone = ?, role = ?, active = ?, password_hash = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(name, phone, role, active, hash, targetId);
    } else {
      db.prepare(`
        UPDATE users SET name = ?, phone = ?, role = ?, active = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(name, phone, role, active, targetId);
    }

    const updated = db.prepare(
      'SELECT id, name, email, role, phone, active, created_at, updated_at FROM users WHERE id = ?'
    ).get(targetId);

    events.broadcast('users', 'updated', { id: targetId });
    res.json({ user: updated });
  });

  router.delete('/:id', (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir o próprio usuário conectado.' });
    }
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    events.broadcast('users', 'deleted', { id: targetId });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createUsersRouter;
