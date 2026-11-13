const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { authenticate } = require('../middleware/auth');
const events = require('../services/events');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function createAuthRouter(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Sua conta está desativada. Fale com a administradora.' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      active: user.active,
      created_at: user.created_at,
    };

    return res.json({
      token: signToken(safeUser),
      user: safeUser,
    });
  });

  router.post('/register', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const phone = String(req.body?.phone || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    // Segurança: cadastro público nunca recebe privilégio admin
    const assignedRole = env.DEFAULT_REGISTER_ROLE;
    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(name, email, hash, assignedRole, phone);

    const newUser = db.prepare(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    events.broadcast('users', 'created', { id: newUser.id });

    return res.status(201).json({
      token: signToken(newUser),
      user: newUser,
    });
  });

  router.get('/me', authenticate(db), (req, res) => {
    res.json({ user: req.user });
  });

  router.put('/me', authenticate(db), (req, res) => {
    const name = String(req.body?.name || req.user.name).trim();
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : req.user.phone;
    const newPassword = req.body?.new_password ? String(req.body.new_password) : '';

    if (!name) {
      return res.status(400).json({ error: 'O nome não pode ficar em branco.' });
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }
      const hash = bcrypt.hashSync(newPassword, 10);
      db.prepare(
        "UPDATE users SET name = ?, phone = ?, password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
      ).run(name, phone, hash, req.user.id);
    } else {
      db.prepare(
        "UPDATE users SET name = ?, phone = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
      ).run(name, phone, req.user.id);
    }

    const updated = db.prepare(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    res.json({ user: updated });
  });

  return router;
}

module.exports = createAuthRouter;
