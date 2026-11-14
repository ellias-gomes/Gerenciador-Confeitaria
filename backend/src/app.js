const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { getSettingsMap } = require('./config/database');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const createAuthRouter = require('./routes/auth');
const createTeamsRouter = require('./routes/teams');
const createUsersRouter = require('./routes/users');
const createSettingsRouter = require('./routes/settings');
const createIngredientsRouter = require('./routes/ingredients');
const createRecipesRouter = require('./routes/recipes');
const createCustomersRouter = require('./routes/customers');
const createOrdersRouter = require('./routes/orders');
const createPlannerRouter = require('./routes/planner');
const createDashboardRouter = require('./routes/dashboard');
const createEventsRouter = require('./routes/events');

function createApp(db, options = {}) {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
    })
  );

  const corsOrigin = env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    const settings = getSettingsMap(db);
    res.json({
      ok: true,
      bakery_name: settings.bakery_name || env.BAKERY_NAME,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/teams', createTeamsRouter(db));
  app.use('/api/users', createUsersRouter(db));
  app.use('/api/settings', createSettingsRouter(db));
  app.use('/api/ingredients', createIngredientsRouter(db));
  app.use('/api/recipes', createRecipesRouter(db));
  app.use('/api/customers', createCustomersRouter(db));
  app.use('/api/orders', createOrdersRouter(db));
  app.use('/api/planner', createPlannerRouter(db));
  app.use('/api/dashboard', createDashboardRouter(db));
  app.use('/api/events', createEventsRouter(db));

  app.use('/api', notFoundHandler);

  const frontendDist = options.frontendDist || path.join(env.ROOT_DIR, 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = createApp;
