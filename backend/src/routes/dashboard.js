const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSettingsMap } = require('../config/database');
const { analyzeIngredientTrend, calculateRecipeMetrics, round2 } = require('../services/pricing');
const events = require('../services/events');

function createDashboardRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.get('/', (req, res) => {
    const teamId = req.user.team_id || 1;
    const settings = getSettingsMap(db, teamId);
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const currentMonthPrefix = today.slice(0, 7);

    const activeOrders = db.prepare(
      "SELECT * FROM orders WHERE team_id = ? AND status NOT IN ('entregue', 'cancelado') ORDER BY delivery_date ASC, delivery_time ASC"
    ).all(teamId);

    const monthOrders = db.prepare(
      "SELECT * FROM orders WHERE team_id = ? AND status != 'cancelado' AND substr(delivery_date, 1, 7) = ?"
    ).all(teamId, currentMonthPrefix);

    const monthRevenue = round2(monthOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0));
    const monthCost = round2(monthOrders.reduce((acc, o) => acc + Number(o.total_cost || 0), 0));
    const monthProfit = round2(monthRevenue - monthCost);
    const pendingToReceive = round2(
      activeOrders.reduce((acc, o) => acc + Math.max(0, Number(o.total_amount || 0) - Number(o.deposit_paid || 0)), 0)
    );

    const upcomingDeliveries = activeOrders.filter((o) => o.delivery_date >= today && o.delivery_date <= nextWeek);

    const ingredients = db.prepare('SELECT * FROM ingredients WHERE team_id = ? ORDER BY name COLLATE NOCASE ASC').all(teamId);
    const historyStmt = db.prepare(
      'SELECT * FROM ingredient_price_history WHERE ingredient_id = ? ORDER BY recorded_at ASC, id ASC'
    );

    const lowStockAlerts = [];
    const risingPriceAlerts = [];

    for (const ing of ingredients) {
      if (Number(ing.stock_quantity) <= Number(ing.min_stock)) {
        lowStockAlerts.push({
          id: ing.id,
          name: ing.name,
          stock_quantity: ing.stock_quantity,
          min_stock: ing.min_stock,
          purchase_unit: ing.purchase_unit,
        });
      }

      const hist = historyStmt.all(ing.id);
      const analysis = analyzeIngredientTrend(hist, ing);
      if (analysis.trend === 'subindo') {
        risingPriceAlerts.push({
          id: ing.id,
          name: ing.name,
          current_price: analysis.current_price,
          variation_last_pct: analysis.variation_last_pct,
          variation_overall_pct: analysis.variation_overall_pct,
          supplier: ing.supplier,
        });
      }
    }

    const recipes = db.prepare('SELECT * FROM recipes WHERE team_id = ? AND active = 1').all(teamId);
    const recipeItemsStmt = db.prepare(`
      SELECT ri.*, i.name as ingredient_name, i.kind, i.purchase_unit, i.package_size, i.current_price
      FROM recipe_items ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
    `);

    const lowMarginRecipes = [];
    for (const r of recipes) {
      const items = recipeItemsStmt.all(r.id);
      const calc = calculateRecipeMetrics(r, items, settings);
      if (calc.metrics.actual_margin_pct < calc.metrics.target_margin_pct - 3) {
        lowMarginRecipes.push({
          id: r.id,
          name: r.name,
          actual_margin_pct: calc.metrics.actual_margin_pct,
          target_margin_pct: calc.metrics.target_margin_pct,
          effective_price: calc.metrics.effective_price,
          suggested_price: calc.metrics.suggested_price,
        });
      }
    }

    const customersCount = db.prepare('SELECT COUNT(*) as total FROM customers WHERE team_id = ?').get(teamId).total;

    res.json({
      kpis: {
        active_orders_count: activeOrders.length,
        upcoming_week_count: upcomingDeliveries.length,
        month_revenue: monthRevenue,
        month_profit: monthProfit,
        pending_to_receive: pendingToReceive,
        recipes_count: recipes.length,
        ingredients_count: ingredients.length,
        customers_count: customersCount,
        connected_clients: events.getConnectedCount(teamId),
      },
      upcoming_orders: activeOrders.slice(0, 8),
      alerts: {
        low_stock: lowStockAlerts,
        rising_prices: risingPriceAlerts,
        low_margin_recipes: lowMarginRecipes,
      },
      settings,
    });
  });

  return router;
}

module.exports = createDashboardRouter;
