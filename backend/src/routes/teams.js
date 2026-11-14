const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { generateInviteCode, seedTeamSettings } = require('../config/database');
const { signToken, getTeamInfo } = require('./auth');
const events = require('../services/events');

const VALID_JOIN_ROLES = ['confeiteira', 'atendente', 'visualizador'];

function ensureCanLeaveCurrentTeam(db, user) {
  if (user.role !== 'admin') return null;
  const teamId = user.team_id || 1;
  const othersCount = db
    .prepare('SELECT COUNT(*) as total FROM users WHERE team_id = ? AND id != ? AND active = 1')
    .get(teamId, user.id).total;
  const otherAdminsCount = db
    .prepare("SELECT COUNT(*) as total FROM users WHERE team_id = ? AND id != ? AND role = 'admin' AND active = 1")
    .get(teamId, user.id).total;

  if (othersCount > 0 && otherAdminsCount === 0) {
    return 'Você é a única administradora da equipe atual. Promova outro integrante para Admin antes de sair desta equipe.';
  }
  return null;
}

function createTeamsRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.get('/current', (req, res) => {
    const teamId = req.user.team_id || 1;
    const team = getTeamInfo(db, teamId, req.user.role);
    if (!team) {
      return res.status(404).json({ error: 'Equipe não encontrada.' });
    }
    const membersCount = db
      .prepare('SELECT COUNT(*) as total FROM users WHERE team_id = ? AND active = 1')
      .get(teamId).total;

    res.json({ team: { ...team, members_count: membersCount } });
  });

  router.put('/current', authorize('admin'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!existing) {
      return res.status(404).json({ error: 'Equipe não encontrada.' });
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    if (!name) {
      return res.status(400).json({ error: 'O nome da equipe não pode ficar em branco.' });
    }

    const defaultJoinRole = req.body?.default_join_role !== undefined
      ? req.body.default_join_role
      : existing.default_join_role;

    if (!VALID_JOIN_ROLES.includes(defaultJoinRole)) {
      return res.status(400).json({ error: 'Nível de acesso inicial inválido para convites.' });
    }

    const inviteCode = req.body?.regenerate_code ? generateInviteCode(db) : existing.invite_code;

    db.prepare(`
      UPDATE teams
      SET name = ?, default_join_role = ?, invite_code = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(name, defaultJoinRole, inviteCode, teamId);

    if (req.body?.name !== undefined) {
      db.prepare(`
        INSERT INTO team_settings (team_id, key, value, updated_at)
        VALUES (?, 'bakery_name', ?, datetime('now', 'localtime'))
        ON CONFLICT(team_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(teamId, name);
    }

    const team = getTeamInfo(db, teamId, req.user.role);
    events.broadcast('settings', 'updated', { team_id: teamId }, teamId);
    events.broadcast('users', 'updated', { team_id: teamId }, teamId);
    res.json({ team });
  });

  router.post('/', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Informe o nome da nova equipe ou confeitaria.' });
    }

    const leaveErr = ensureCanLeaveCurrentTeam(db, req.user);
    if (leaveErr) {
      return res.status(400).json({ error: leaveErr });
    }

    const defaultJoinRole = VALID_JOIN_ROLES.includes(req.body?.default_join_role)
      ? req.body.default_join_role
      : 'atendente';

    const oldTeamId = req.user.team_id || 1;

    const newTeamId = db.transaction(() => {
      const code = generateInviteCode(db);
      const info = db.prepare(`
        INSERT INTO teams (name, invite_code, default_join_role, created_by)
        VALUES (?, ?, ?, ?)
      `).run(name, code, defaultJoinRole, req.user.id);
      const createdId = info.lastInsertRowid;

      seedTeamSettings(db, createdId, name);

      db.prepare(`
        UPDATE users
        SET team_id = ?, role = 'admin', updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(createdId, req.user.id);

      return createdId;
    })();

    const updatedUser = db.prepare(
      'SELECT id, team_id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    events.broadcast('users', 'updated', { id: updatedUser.id }, oldTeamId);
    events.broadcast('users', 'created', { id: updatedUser.id }, newTeamId);

    res.status(201).json({
      token: signToken(updatedUser),
      user: updatedUser,
      team: getTeamInfo(db, newTeamId, 'admin'),
    });
  });

  router.post('/join', (req, res) => {
    const inviteCode = String(req.body?.invite_code || '').trim().toUpperCase();
    if (!inviteCode) {
      return res.status(400).json({ error: 'Informe o código de convite da equipe.' });
    }

    const targetTeam = db.prepare('SELECT * FROM teams WHERE UPPER(invite_code) = ?').get(inviteCode);
    if (!targetTeam) {
      return res.status(404).json({ error: 'Código de convite não encontrado.' });
    }

    if (targetTeam.id === (req.user.team_id || 1)) {
      return res.status(400).json({ error: 'Você já faz parte desta equipe.' });
    }

    const leaveErr = ensureCanLeaveCurrentTeam(db, req.user);
    if (leaveErr) {
      return res.status(400).json({ error: leaveErr });
    }

    const oldTeamId = req.user.team_id || 1;
    const assignedRole = VALID_JOIN_ROLES.includes(targetTeam.default_join_role)
      ? targetTeam.default_join_role
      : 'visualizador';

    db.prepare(`
      UPDATE users
      SET team_id = ?, role = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(targetTeam.id, assignedRole, req.user.id);

    const updatedUser = db.prepare(
      'SELECT id, team_id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    events.broadcast('users', 'updated', { id: updatedUser.id }, oldTeamId);
    events.broadcast('users', 'created', { id: updatedUser.id }, targetTeam.id);

    res.json({
      token: signToken(updatedUser),
      user: updatedUser,
      team: getTeamInfo(db, targetTeam.id, updatedUser.role),
    });
  });

  return router;
}

module.exports = createTeamsRouter;
