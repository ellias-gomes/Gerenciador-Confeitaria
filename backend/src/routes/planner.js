const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getSettingsMap } = require('../config/database');
const { convertQuantity } = require('../services/units');
const { round2, round4 } = require('../services/pricing');
const events = require('../services/events');

function createPlannerRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.post('/calculate', (req, res) => {
    const teamId = req.user.team_id || 1;
    const body = req.body || {};
    const settings = getSettingsMap(db, teamId);
    const considerStock = body.consider_stock !== false;
    const indirectPct = body.indirect_cost_pct !== undefined && body.indirect_cost_pct !== ''
      ? Number(body.indirect_cost_pct)
      : Number(settings.default_indirect_cost_pct ?? 10);
    const laborHourRate = Number(settings.labor_hour_rate ?? 22);
    const targetMarginPct = body.target_margin_pct !== undefined && body.target_margin_pct !== ''
      ? Number(body.target_margin_pct)
      : Number(settings.default_profit_margin_pct ?? 40);

    const recipeBatches = new Map();
    const selectedRecipesInput = Array.isArray(body.recipes) ? body.recipes : [];
    for (const item of selectedRecipesInput) {
      const rId = Number(item.recipe_id);
      const batches = Number(item.batches) || 0;
      if (rId > 0 && batches > 0) {
        recipeBatches.set(rId, (recipeBatches.get(rId) || 0) + batches);
      }
    }

    const orderIds = Array.isArray(body.order_ids) ? body.order_ids.map(Number).filter(Boolean) : [];
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const orderItems = db.prepare(`
        SELECT oi.recipe_id, oi.quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.order_id IN (${placeholders}) AND o.team_id = ? AND oi.recipe_id IS NOT NULL
      `).all(...orderIds, teamId);

      for (const oi of orderItems) {
        const rId = Number(oi.recipe_id);
        const qty = Number(oi.quantity) || 0;
        if (rId > 0 && qty > 0) {
          recipeBatches.set(rId, (recipeBatches.get(rId) || 0) + qty);
        }
      }
    }

    const recipeStmt = db.prepare('SELECT * FROM recipes WHERE id = ? AND team_id = ?');
    const recipeItemsStmt = db.prepare(`
      SELECT ri.*, i.*
      FROM recipe_items ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
    `);

    const aggregatedIngredients = new Map();
    const plannedRecipesSummary = [];
    let totalPrepMinutes = 0;
    let totalRecipeExtraCosts = 0;

    for (const [recipeId, batches] of recipeBatches.entries()) {
      const recipe = recipeStmt.get(recipeId, teamId);
      if (!recipe) continue;

      totalPrepMinutes += (Number(recipe.prep_time_minutes) || 0) * batches;
      totalRecipeExtraCosts += (Number(recipe.extra_cost) || 0) * batches;

      plannedRecipesSummary.push({
        recipe_id: recipe.id,
        name: recipe.name,
        batches: round2(batches),
        yield_total: round2((Number(recipe.yield_quantity) || 1) * batches),
        yield_unit: recipe.yield_unit,
      });

      const items = recipeItemsStmt.all(recipeId);
      for (const item of items) {
        const neededInPurchaseUnit = convertQuantity(
          Number(item.quantity) * batches,
          item.unit,
          item.purchase_unit
        );

        if (!aggregatedIngredients.has(item.ingredient_id)) {
          aggregatedIngredients.set(item.ingredient_id, {
            ingredient_id: item.ingredient_id,
            name: item.name,
            kind: item.kind,
            category: item.category,
            purchase_unit: item.purchase_unit,
            package_size: Number(item.package_size) > 0 ? Number(item.package_size) : 1,
            current_price: Number(item.current_price) || 0,
            stock_quantity: Number(item.stock_quantity) || 0,
            supplier: item.supplier || '',
            needed_qty: 0,
          });
        }
        const entry = aggregatedIngredients.get(item.ingredient_id);
        entry.needed_qty += neededInPurchaseUnit;
      }
    }

    let totalIngredientsFullValue = 0;
    let totalToBuyCost = 0;
    let totalPackagesCost = 0;

    const shoppingList = Array.from(aggregatedIngredients.values())
      .map((entry) => {
        const unitPrice = entry.current_price / entry.package_size;
        const fullValue = entry.needed_qty * unitPrice;
        totalIngredientsFullValue += fullValue;

        const stockUsed = considerStock ? Math.min(entry.stock_quantity, entry.needed_qty) : 0;
        const missingQty = Math.max(0, entry.needed_qty - stockUsed);
        const packagesToBuy = missingQty > 0 ? Math.ceil(missingQty / entry.package_size) : 0;
        const proportionalBuyCost = missingQty * unitPrice;
        const fullPackagesBuyCost = packagesToBuy * entry.current_price;

        totalToBuyCost += proportionalBuyCost;
        totalPackagesCost += fullPackagesBuyCost;

        return {
          ...entry,
          needed_qty: round4(entry.needed_qty),
          stock_used: round4(stockUsed),
          missing_qty: round4(missingQty),
          packages_to_buy: packagesToBuy,
          full_value: round2(fullValue),
          proportional_buy_cost: round2(proportionalBuyCost),
          full_packages_buy_cost: round2(fullPackagesBuyCost),
        };
      })
      .sort((a, b) => b.missing_qty - a.missing_qty || a.name.localeCompare(b.name));

    const services = Array.isArray(body.services)
      ? body.services
          .map((s) => ({
            name: String(s.name || '').trim(),
            cost: Math.max(0, Number(s.cost) || 0),
          }))
          .filter((s) => s.name && s.cost >= 0)
      : [];

    const totalServicesCost = services.reduce((acc, s) => acc + s.cost, 0);
    const indirectCost = totalIngredientsFullValue * (indirectPct / 100);
    const laborCost = (totalPrepMinutes / 60) * laborHourRate;

    const totalProductionCost = totalIngredientsFullValue + indirectCost + laborCost + totalRecipeExtraCosts + totalServicesCost;
    const totalOutOfPocketSpend = totalPackagesCost + totalServicesCost;
    const denominator = Math.max(0.1, 1 - targetMarginPct / 100);
    const suggestedQuotePrice = totalProductionCost / denominator;

    const whatsappLines = [
      '*Lista de Compras & Gastos - Confeitaria*',
      plannedRecipesSummary.length > 0
        ? `Produção: ${plannedRecipesSummary.map((r) => `${r.batches}x ${r.name}`).join(', ')}`
        : '',
      '',
      '*Itens para comprar:*',
      ...shoppingList
        .filter((i) => i.missing_qty > 0)
        .map(
          (i) =>
            `- ${i.name}: faltam ${i.missing_qty} ${i.purchase_unit} (${i.packages_to_buy} emb. ≈ R$ ${i.full_packages_buy_cost
              .toFixed(2)
              .replace('.', ',')})`
        ),
      ...(services.length > 0
        ? ['', '*Serviços e Extras:*', ...services.map((s) => `- ${s.name}: R$ ${s.cost.toFixed(2).replace('.', ',')}`)]
        : []),
      '',
      `*Desembolso estimado (compras + serviços):* R$ ${totalOutOfPocketSpend.toFixed(2).replace('.', ',')}`,
      `*Custo total da produção:* R$ ${totalProductionCost.toFixed(2).replace('.', ',')}`,
    ].filter(Boolean);

    res.json({
      planned_recipes: plannedRecipesSummary,
      services,
      shopping_list: shoppingList,
      summary: {
        total_prep_minutes: Math.round(totalPrepMinutes),
        total_ingredients_full_value: round2(totalIngredientsFullValue),
        total_to_buy_proportional: round2(totalToBuyCost),
        total_packages_to_buy_cost: round2(totalPackagesCost),
        indirect_cost: round2(indirectCost),
        labor_cost: round2(laborCost),
        recipe_extra_costs: round2(totalRecipeExtraCosts),
        total_services_cost: round2(totalServicesCost),
        total_out_of_pocket_spend: round2(totalOutOfPocketSpend),
        total_production_cost: round2(totalProductionCost),
        suggested_quote_price: round2(suggestedQuotePrice),
      },
      whatsapp_shopping_text: whatsappLines.join('\n'),
    });
  });

  router.get('/simulations', (req, res) => {
    const teamId = req.user.team_id || 1;
    const rows = db.prepare('SELECT * FROM simulations WHERE team_id = ? ORDER BY id DESC LIMIT 30').all(teamId);
    const simulations = rows.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload_json),
    }));
    res.json({ simulations });
  });

  router.post('/simulations', authorize('admin', 'confeiteira', 'atendente'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const title = String(req.body?.title || '').trim() || `Planejamento ${new Date().toLocaleDateString('pt-BR')}`;
    const payload = req.body?.payload || {};
    const totalIngredientsCost = Number(req.body?.total_ingredients_cost) || 0;
    const totalServicesCost = Number(req.body?.total_services_cost) || 0;
    const totalEstimatedSpend = Number(req.body?.total_estimated_spend) || 0;

    const info = db.prepare(`
      INSERT INTO simulations (team_id, title, payload_json, total_ingredients_cost, total_services_cost, total_estimated_spend, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, title, JSON.stringify(payload), totalIngredientsCost, totalServicesCost, totalEstimatedSpend, req.user.id);

    const created = db.prepare('SELECT * FROM simulations WHERE id = ? AND team_id = ?').get(info.lastInsertRowid, teamId);
    events.broadcast('planner', 'created', { id: created.id }, teamId);
    res.status(201).json({ simulation: { ...created, payload } });
  });

  router.delete('/simulations/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const teamId = req.user.team_id || 1;
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM simulations WHERE id = ? AND team_id = ?').run(id, teamId);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Simulação não encontrada.' });
    }
    events.broadcast('planner', 'deleted', { id }, teamId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = createPlannerRouter;
