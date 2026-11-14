const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { authenticate } = require('../middleware/auth');
const { generateInviteCode, seedTeamSettings } = require('../config/database');
const events = require('../services/events');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, team_id: user.team_id || 1, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function getTeamInfo(db, teamId, role) {
  const team = db.prepare('SELECT id, name, invite_code, default_join_role, created_at FROM teams WHERE id = ?').get(teamId);
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    default_join_role: team.default_join_role,
    ...(role === 'admin' ? { invite_code: team.invite_code } : {}),
  };
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
      team_id: user.team_id || 1,
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
      team: getTeamInfo(db, safeUser.team_id, safeUser.role),
    });
  });

  router.post('/register', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const phone = String(req.body?.phone || '').trim();
    const teamName = String(req.body?.team_name || '').trim();
    const inviteCode = String(req.body?.invite_code || '').trim().toUpperCase();

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

    const hash = bcrypt.hashSync(password, 10);

    let teamId = 1;
    let assignedRole = env.DEFAULT_REGISTER_ROLE;

    if (teamName) {
      const tx = db.transaction(() => {
        const code = generateInviteCode(db);
        const teamInfo = db.prepare(`
          INSERT INTO teams (name, invite_code, default_join_role)
          VALUES (?, ?, 'atendente')
        `).run(teamName, code);
        const newTeamId = teamInfo.lastInsertRowid;
        seedTeamSettings(db, newTeamId, teamName);

        const userInfo = db.prepare(`
          INSERT INTO users (team_id, name, email, password_hash, role, phone, active)
          VALUES (?, ?, ?, ?, 'admin', ?, 1)
        `).run(newTeamId, name, email, hash, phone);

        db.prepare('UPDATE teams SET created_by = ? WHERE id = ?').run(userInfo.lastInsertRowid, newTeamId);
        return { userId: userInfo.lastInsertRowid, teamId: newTeamId };
      });

      const created = tx();
      teamId = created.teamId;
      assignedRole = 'admin';

      const newUser = db.prepare(
        'SELECT id, team_id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
      ).get(created.userId);

      events.broadcast('users', 'created', { id: newUser.id }, teamId);
      return res.status(201).json({
        token: signToken(newUser),
        user: newUser,
        team: getTeamInfo(db, teamId, assignedRole),
      });
    }

    if (inviteCode) {
      const targetTeam = db.prepare('SELECT * FROM teams WHERE UPPER(invite_code) = ?').get(inviteCode);
      if (!targetTeam) {
        return res.status(404).json({ error: 'Código de convite não encontrado. Verifique com a administradora da equipe.' });
      }
      teamId = targetTeam.id;
      assignedRole = ['confeiteira', 'atendente', 'visualizador'].includes(targetTeam.default_join_role)
        ? targetTeam.default_join_role
        : 'visualizador';
    }

    const result = db.prepare(`
      INSERT INTO users (team_id, name, email, password_hash, role, phone, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(teamId, name, email, hash, assignedRole, phone);

    const newUser = db.prepare(
      'SELECT id, team_id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    events.broadcast('users', 'created', { id: newUser.id }, teamId);

    return res.status(201).json({
      token: signToken(newUser),
      user: newUser,
      team: getTeamInfo(db, teamId, newUser.role),
    });
  });

  router.get('/me', authenticate(db), (req, res) => {
    res.json({
      user: req.user,
      team: getTeamInfo(db, req.user.team_id || 1, req.user.role),
    });
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
      'SELECT id, team_id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    res.json({
      user: updated,
      team: getTeamInfo(db, updated.team_id || 1, updated.role),
    });
  });

  return router;
}

module.exports = createAuthRouter;
module.exports.signToken = signToken;
module.exports.getTeamInfo = getTeamInfo;
