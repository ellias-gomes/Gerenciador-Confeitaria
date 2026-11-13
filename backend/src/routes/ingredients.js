const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { normalizeUnit } = require('../services/units');
const { analyzeIngredientTrend, round2 } = require('../services/pricing');
const { getSettingsMap } = require('../config/database');
const { calculateRecipeMetrics } = require('../services/pricing');
const events = require('../services/events');

function getRecipeImpactForIngredient(db, ingredientId, newPrice, oldPrice) {
  const recipeRows = db.prepare(`
    SELECT DISTINCT r.*
    FROM recipes r
    JOIN recipe_items ri ON ri.recipe_id = r.id
    WHERE ri.ingredient_id = ?
  `).all(ingredientId);

  const settings = getSettingsMap(db);
  const allItemsStmt = db.prepare(`
    SELECT ri.*, i.name as ingredient_name, i.kind, i.purchase_unit, i.package_size, i.current_price
    FROM recipe_items ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = ?
  `);

  return recipeRows.map((recipe) => {
    const items = allItemsStmt.all(recipe.id);
    const currentCalc = calculateRecipeMetrics(recipe, items, settings);

    let previousCost = currentCalc.metrics.total_cost;
    if (oldPrice !== null && oldPrice !== undefined && oldPrice > 0) {
      const prevItems = items.map((it) =>
        it.ingredient_id === ingredientId ? { ...it, current_price: oldPrice } : it
      );
      previousCost = calculateRecipeMetrics(recipe, prevItems, settings).metrics.total_cost;
    }

    const diff = round2(currentCalc.metrics.total_cost - previousCost);
    const diffPct = previousCost > 0 ? round2((diff / previousCost) * 100) : 0;

    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      category: recipe.category,
      current_total_cost: currentCalc.metrics.total_cost,
      previous_total_cost: round2(previousCost),
      cost_diff: diff,
      cost_diff_pct: diffPct,
      suggested_price: currentCalc.metrics.suggested_price,
      effective_price: currentCalc.metrics.effective_price,
      actual_margin_pct: currentCalc.metrics.actual_margin_pct,
    };
  });
}

function createIngredientsRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.get('/', (req, res) => {
    const { search = '', kind = '', category = '' } = req.query;
    const ingredients = db.prepare('SELECT * FROM ingredients ORDER BY name COLLATE NOCASE ASC').all();
    const historyStmt = db.prepare(
      'SELECT * FROM ingredient_price_history WHERE ingredient_id = ? ORDER BY recorded_at ASC, id ASC'
    );
    const usageStmt = db.prepare(
      'SELECT COUNT(DISTINCT recipe_id) as recipes_count FROM recipe_items WHERE ingredient_id = ?'
    );

    const enriched = ingredients
      .map((ing) => {
        const history = historyStmt.all(ing.id);
        const analysis = analyzeIngredientTrend(history, ing);
        const usage = usageStmt.get(ing.id);
        return {
          ...ing,
          recipes_count: usage?.recipes_count || 0,
          is_low_stock: Number(ing.stock_quantity) <= Number(ing.min_stock),
          analysis,
        };
      })
      .filter((ing) => {
        if (kind && ing.kind !== kind) return false;
        if (category && ing.category !== category) return false;
        if (search) {
          const term = String(search).toLowerCase();
          return (
            ing.name.toLowerCase().includes(term) ||
            (ing.supplier || '').toLowerCase().includes(term) ||
            (ing.brand || '').toLowerCase().includes(term) ||
            (ing.category || '').toLowerCase().includes(term)
          );
        }
        return true;
      });

    res.json({ ingredients: enriched });
  });

  router.get('/:id/analysis', (req, res) => {
    const id = Number(req.params.id);
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    if (!ingredient) {
      return res.status(404).json({ error: 'Insumo não encontrado.' });
    }

    const history = db.prepare(
      'SELECT * FROM ingredient_price_history WHERE ingredient_id = ? ORDER BY recorded_at ASC, id ASC'
    ).all(id);
    const analysis = analyzeIngredientTrend(history, ingredient);

    const supplierMap = new Map();
    for (const h of analysis.history) {
      const sup = (h.supplier || 'Sem fornecedor').trim() || 'Sem fornecedor';
      if (!supplierMap.has(sup)) {
        supplierMap.set(sup, { supplier: sup, entries: [], latest_price: h.price, latest_date: h.recorded_at });
      }
      const entry = supplierMap.get(sup);
      entry.entries.push(h.price);
      entry.latest_price = h.price;
      entry.latest_date = h.recorded_at;
    }

    const suppliers = Array.from(supplierMap.values()).map((s) => ({
      supplier: s.supplier,
      purchases_count: s.entries.length,
      min_price: round2(Math.min(...s.entries)),
      avg_price: round2(s.entries.reduce((a, b) => a + b, 0) / s.entries.length),
      latest_price: round2(s.latest_price),
      latest_date: s.latest_date,
    }));

    const previousPrice = analysis.history.length >= 2
      ? analysis.history[analysis.history.length - 2].price
      : ingredient.current_price;

    const affectedRecipes = getRecipeImpactForIngredient(db, id, ingredient.current_price, previousPrice);

    res.json({
      ingredient,
      analysis,
      suppliers,
      affected_recipes: affectedRecipes,
    });
  });

  router.post('/', authorize('admin', 'confeiteira'), (req, res) => {
    const name = String(req.body?.name || '').trim();
    const category = String(req.body?.category || 'Ingrediente').trim();
    const kind = req.body?.kind === 'embalagem' ? 'embalagem' : 'ingrediente';
    const purchaseUnit = normalizeUnit(req.body?.purchase_unit || 'un');
    const packageSize = Number(req.body?.package_size) > 0 ? Number(req.body.package_size) : 1;
    const currentPrice = Math.max(0, Number(req.body?.current_price) || 0);
    const stockQuantity = Math.max(0, Number(req.body?.stock_quantity) || 0);
    const minStock = Math.max(0, Number(req.body?.min_stock) || 0);
    const supplier = String(req.body?.supplier || '').trim();
    const brand = String(req.body?.brand || '').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'O nome do insumo é obrigatório.' });
    }

    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO ingredients (
          name, category, kind, purchase_unit, package_size, current_price,
          stock_quantity, min_stock, supplier, brand, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name, category, kind, purchaseUnit, packageSize, currentPrice,
        stockQuantity, minStock, supplier, brand, notes, req.user.id
      );

      db.prepare(`
        INSERT INTO ingredient_price_history (
          ingredient_id, price, package_size, purchase_unit, supplier, brand, notes, recorded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        info.lastInsertRowid, currentPrice, packageSize, purchaseUnit, supplier, brand, 'Cadastro inicial', req.user.id
      );

      return info.lastInsertRowid;
    });

    const id = tx();
    const created = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    events.broadcast('ingredients', 'created', { id });
    res.status(201).json({ ingredient: created });
  });

  router.put('/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Insumo não encontrado.' });
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const category = req.body?.category !== undefined ? String(req.body.category).trim() : existing.category;
    const kind = req.body?.kind !== undefined ? (req.body.kind === 'embalagem' ? 'embalagem' : 'ingrediente') : existing.kind;
    const purchaseUnit = req.body?.purchase_unit !== undefined ? normalizeUnit(req.body.purchase_unit) : existing.purchase_unit;
    const packageSize = req.body?.package_size !== undefined && Number(req.body.package_size) > 0
      ? Number(req.body.package_size)
      : existing.package_size;
    const currentPrice = req.body?.current_price !== undefined ? Math.max(0, Number(req.body.current_price) || 0) : existing.current_price;
    const stockQuantity = req.body?.stock_quantity !== undefined ? Math.max(0, Number(req.body.stock_quantity) || 0) : existing.stock_quantity;
    const minStock = req.body?.min_stock !== undefined ? Math.max(0, Number(req.body.min_stock) || 0) : existing.min_stock;
    const supplier = req.body?.supplier !== undefined ? String(req.body.supplier).trim() : existing.supplier;
    const brand = req.body?.brand !== undefined ? String(req.body.brand).trim() : existing.brand;
    const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : existing.notes;

    if (!name) {
      return res.status(400).json({ error: 'O nome do insumo é obrigatório.' });
    }

    const priceChanged = Number(currentPrice) !== Number(existing.current_price) || Number(packageSize) !== Number(existing.package_size);

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE ingredients SET
          name = ?, category = ?, kind = ?, purchase_unit = ?, package_size = ?,
          current_price = ?, stock_quantity = ?, min_stock = ?, supplier = ?,
          brand = ?, notes = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        name, category, kind, purchaseUnit, packageSize,
        currentPrice, stockQuantity, minStock, supplier, brand, notes, id
      );

      if (priceChanged && !req.body?.skip_history) {
        db.prepare(`
          INSERT INTO ingredient_price_history (
            ingredient_id, price, package_size, purchase_unit, supplier, brand, notes, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, currentPrice, packageSize, purchaseUnit, supplier, brand, 'Atualização de preço', req.user.id);
      }
    });

    tx();
    const updated = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    events.broadcast('ingredients', 'updated', { id });
    if (priceChanged) {
      events.broadcast('recipes', 'recalculated', { ingredient_id: id });
    }
    res.json({ ingredient: updated });
  });

  router.post('/:id/prices', authorize('admin', 'confeiteira'), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Insumo não encontrado.' });
    }

    const price = Number(req.body?.price);
    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Informe um preço válido.' });
    }

    const packageSize = Number(req.body?.package_size) > 0 ? Number(req.body.package_size) : existing.package_size;
    const purchaseUnit = req.body?.purchase_unit ? normalizeUnit(req.body.purchase_unit) : existing.purchase_unit;
    const supplier = req.body?.supplier !== undefined ? String(req.body.supplier).trim() : existing.supplier;
    const brand = req.body?.brand !== undefined ? String(req.body.brand).trim() : existing.brand;
    const notes = String(req.body?.notes || 'Nova cotação / compra').trim();
    const addToStockQty = Math.max(0, Number(req.body?.add_to_stock_qty) || 0);
    const recordedAt = req.body?.recorded_at
      ? String(req.body.recorded_at)
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO ingredient_price_history (
          ingredient_id, price, package_size, purchase_unit, supplier, brand, notes, recorded_by, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, price, packageSize, purchaseUnit, supplier, brand, notes, req.user.id, recordedAt);

      const newStock = Number(existing.stock_quantity) + addToStockQty;
      db.prepare(`
        UPDATE ingredients SET
          current_price = ?, package_size = ?, purchase_unit = ?,
          supplier = ?, brand = ?, stock_quantity = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(price, packageSize, purchaseUnit, supplier, brand, newStock, id);
    });

    tx();

    const updated = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    const history = db.prepare(
      'SELECT * FROM ingredient_price_history WHERE ingredient_id = ? ORDER BY recorded_at ASC, id ASC'
    ).all(id);
    const analysis = analyzeIngredientTrend(history, updated);
    const affectedRecipes = getRecipeImpactForIngredient(db, id, price, existing.current_price);

    events.broadcast('ingredients', 'price_recorded', { id });
    events.broadcast('recipes', 'recalculated', { ingredient_id: id });

    res.status(201).json({
      ingredient: updated,
      analysis,
      affected_recipes: affectedRecipes,
    });
  });

  router.delete('/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const id = Number(req.params.id);
    const used = db.prepare('SELECT COUNT(*) as total FROM recipe_items WHERE ingredient_id = ?').get(id);
    if (used.total > 0) {
      return res.status(409).json({
        error: `Este insumo está sendo usado em ${used.total} item(ns) de receita. Remova-o das receitas antes de excluir.`,
      });
    }

    const info = db.prepare('DELETE FROM ingredients WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Insumo não encontrado.' });
    }
    events.broadcast('ingredients', 'deleted', { id });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createIngredientsRouter;
