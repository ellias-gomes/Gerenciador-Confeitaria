const express = require('express');
const { authenticate } = require('../middleware/auth');
const events = require('../services/events');

function createEventsRouter(db) {
  const router = express.Router();

  router.get('/', authenticate(db), (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    events.subscribe(res, req.user);
  });

  return router;
}

module.exports = createEventsRouter;
