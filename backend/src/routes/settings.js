const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getSettingsMap } = require('../config/database');
const events = require('../services/events');

function createSettingsRouter(db) {
  const router = express.Router();

  router.get('/', authenticate(db), (_req, res) => {
    const settings = getSettingsMap(db);
    res.json({ settings });
  });

  router.put('/', authenticate(db), authorize('admin'), (req, res) => {
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
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const tx = db.transaction((body) => {
      for (const key of allowedKeys) {
        if (body[key] !== undefined && body[key] !== null) {
          upsert.run(key, String(body[key]));
        }
      }
    });

    tx(req.body || {});
    const settings = getSettingsMap(db);
    events.broadcast('settings', 'updated', settings);
    res.json({ settings });
  });

  return router;
}

module.exports = createSettingsRouter;
