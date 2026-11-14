const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getSettingsMap } = require('../config/database');
const events = require('../services/events');

function createSettingsRouter(db) {
  const router = express.Router();

  router.get('/', authenticate(db), (req, res) => {
    const teamId = req.user.team_id || 1;
    const settings = getSettingsMap(db, teamId);
    res.json({ settings });
  });

  router.put('/', authenticate(db), authorize('admin'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const allowedKeys = [
      'bakery_name',
      'labor_hour_rate',
      'default_indirect_cost_pct',
      'default_profit_margin_pct',
      'card_fee_pct',
      'daily_order_limit',
      'whatsapp_greeting',
    ];

    const upsert = db.prepare(`
      INSERT INTO team_settings (team_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(team_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const tx = db.transaction((body) => {
      for (const key of allowedKeys) {
        if (body[key] !== undefined && body[key] !== null) {
          upsert.run(teamId, key, String(body[key]));
        }
      }
      if (body.bakery_name && String(body.bakery_name).trim()) {
        db.prepare("UPDATE teams SET name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .run(String(body.bakery_name).trim(), teamId);
      }
    });

    tx(req.body || {});
    const settings = getSettingsMap(db, teamId);
    events.broadcast('settings', 'updated', settings, teamId);
    res.json({ settings });
  });

  return router;
}

module.exports = createSettingsRouter;
