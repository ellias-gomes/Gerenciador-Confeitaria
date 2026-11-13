const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getSettingsMap } = require('../config/database');
const { calculateRecipeMetrics } = require('../services/pricing');
const { normalizeUnit } = require('../services/units');
const events = require('../services/events');

function hydrateRecipe(db, recipe, settings) {
  const items = db.prepare(`
    SELECT ri.*, i.name as ingredient_name, i.kind, i.category as ingredient_category,
           i.purchase_unit, i.package_size, i.current_price
    FROM recipe_items ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = ?
    ORDER BY i.kind ASC, ri.id ASC
  `).all(recipe.id);

  const calculated = calculateRecipeMetrics(recipe, items, settings);
  return {
    ...recipe,
    items: calculated.items,
    metrics: calculated.metrics,
  };
}

function createRecipesRouter(db) {
  const router = express.Router();
  router.use(authenticate(db));

  router.get('/', (req, res) => {
    const { search = '', category = '' } = req.query;
    const settings = getSettingsMap(db);
    const recipes = db.prepare('SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC').all();

    const hydrated = recipes
      .map((r) => hydrateRecipe(db, r, settings))
      .filter((r) => {
        if (category && r.category !== category) return false;
        if (search) {
          const term = String(search).toLowerCase();
          return (
            r.name.toLowerCase().includes(term) ||
            (r.description || '').toLowerCase().includes(term) ||
            (r.category || '').toLowerCase().includes(term)
          );
        }
        return true;
      });

    res.json({ recipes: hydrated, settings });
  });

  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    if (!recipe) {
      return res.status(404).json({ error: 'Receita não encontrada.' });
    }
    const settings = getSettingsMap(db);
    res.json({ recipe: hydrateRecipe(db, recipe, settings) });
  });

  router.post('/preview', (req, res) => {
    const settings = getSettingsMap(db);
    const draft = req.body || {};
    const rawItems = Array.isArray(draft.items) ? draft.items : [];

    const ingStmt = db.prepare('SELECT * FROM ingredients WHERE id = ?');
    const resolvedItems = [];

    for (const item of rawItems) {
      const ing = ingStmt.get(Number(item.ingredient_id));
      if (!ing) continue;
      resolvedItems.push({
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        kind: ing.kind,
        purchase_unit: ing.purchase_unit,
        package_size: ing.package_size,
        current_price: ing.current_price,
        quantity: Math.max(0, Number(item.quantity) || 0),
        unit: normalizeUnit(item.unit || ing.purchase_unit),
        notes: item.notes || '',
      });
    }

    const calculated = calculateRecipeMetrics(draft, resolvedItems, settings);
    res.json(calculated);
  });

  router.post('/', authorize('admin', 'confeiteira'), (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'O nome da receita é obrigatório.' });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO recipes (
          name, category, description, yield_quantity, yield_unit, prep_time_minutes,
          instructions, pricing_mode, target_margin_pct, markup_factor,
          indirect_cost_pct, extra_cost, sale_price, active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        String(body.category || 'Bolo').trim(),
        String(body.description || '').trim(),
        Math.max(1, Number(body.yield_quantity) || 1),
        String(body.yield_unit || 'un').trim(),
        Math.max(0, Number(body.prep_time_minutes) || 0),
        String(body.instructions || '').trim(),
        body.pricing_mode === 'markup' ? 'markup' : 'margin',
        body.target_margin_pct !== undefined && body.target_margin_pct !== '' && body.target_margin_pct !== null
          ? Number(body.target_margin_pct)
          : null,
        Number(body.markup_factor) > 0 ? Number(body.markup_factor) : 2.2,
        body.indirect_cost_pct !== undefined && body.indirect_cost_pct !== '' && body.indirect_cost_pct !== null
          ? Number(body.indirect_cost_pct)
          : null,
        Math.max(0, Number(body.extra_cost) || 0),
        Math.max(0, Number(body.sale_price) || 0),
        body.active === false ? 0 : 1,
        req.user.id
      );

      const recipeId = info.lastInsertRowid;
      const insertItem = db.prepare(`
        INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, notes)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        if (!item.ingredient_id || !(Number(item.quantity) > 0)) continue;
        insertItem.run(
          recipeId,
          Number(item.ingredient_id),
          Number(item.quantity),
          normalizeUnit(item.unit || 'g'),
          String(item.notes || '').trim()
        );
      }

      return recipeId;
    });

    const id = tx();
    const settings = getSettingsMap(db);
    const created = hydrateRecipe(db, db.prepare('SELECT * FROM recipes WHERE id = ?').get(id), settings);
    events.broadcast('recipes', 'created', { id });
    res.status(201).json({ recipe: created });
  });

  router.post('/:id/duplicate', authorize('admin', 'confeiteira'), (req, res) => {
    const sourceId = Number(req.params.id);
    const source = db.prepare('SELECT * FROM recipes WHERE id = ?').get(sourceId);
    if (!source) {
      return res.status(404).json({ error: 'Receita original não encontrada.' });
    }
    const sourceItems = db.prepare('SELECT * FROM recipe_items WHERE recipe_id = ?').all(sourceId);

    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO recipes (
          name, category, description, yield_quantity, yield_unit, prep_time_minutes,
          instructions, pricing_mode, target_margin_pct, markup_factor,
          indirect_cost_pct, extra_cost, sale_price, active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${source.name} (Cópia)`,
        source.category,
        source.description,
        source.yield_quantity,
        source.yield_unit,
        source.prep_time_minutes,
        source.instructions,
        source.pricing_mode,
        source.target_margin_pct,
        source.markup_factor,
        source.indirect_cost_pct,
        source.extra_cost,
        source.sale_price,
        source.active,
        req.user.id
      );

      const insertItem = db.prepare(`
        INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, notes)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const item of sourceItems) {
        insertItem.run(info.lastInsertRowid, item.ingredient_id, item.quantity, item.unit, item.notes);
      }
      return info.lastInsertRowid;
    });

    const newId = tx();
    const settings = getSettingsMap(db);
    const duplicated = hydrateRecipe(db, db.prepare('SELECT * FROM recipes WHERE id = ?').get(newId), settings);
    events.broadcast('recipes', 'created', { id: newId });
    res.status(201).json({ recipe: duplicated });
  });

  router.put('/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Receita não encontrada.' });
    }

    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) {
      return res.status(400).json({ error: 'O nome da receita é obrigatório.' });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE recipes SET
          name = ?, category = ?, description = ?, yield_quantity = ?, yield_unit = ?,
          prep_time_minutes = ?, instructions = ?, pricing_mode = ?, target_margin_pct = ?,
          markup_factor = ?, indirect_cost_pct = ?, extra_cost = ?, sale_price = ?,
          active = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        name,
        body.category !== undefined ? String(body.category).trim() : existing.category,
        body.description !== undefined ? String(body.description).trim() : existing.description,
        body.yield_quantity !== undefined ? Math.max(1, Number(body.yield_quantity) || 1) : existing.yield_quantity,
        body.yield_unit !== undefined ? String(body.yield_unit).trim() : existing.yield_unit,
        body.prep_time_minutes !== undefined ? Math.max(0, Number(body.prep_time_minutes) || 0) : existing.prep_time_minutes,
        body.instructions !== undefined ? String(body.instructions).trim() : existing.instructions,
        body.pricing_mode !== undefined ? (body.pricing_mode === 'markup' ? 'markup' : 'margin') : existing.pricing_mode,
        body.target_margin_pct !== undefined
          ? (body.target_margin_pct === null || body.target_margin_pct === '' ? null : Number(body.target_margin_pct))
          : existing.target_margin_pct,
        body.markup_factor !== undefined && Number(body.markup_factor) > 0 ? Number(body.markup_factor) : existing.markup_factor,
        body.indirect_cost_pct !== undefined
          ? (body.indirect_cost_pct === null || body.indirect_cost_pct === '' ? null : Number(body.indirect_cost_pct))
          : existing.indirect_cost_pct,
        body.extra_cost !== undefined ? Math.max(0, Number(body.extra_cost) || 0) : existing.extra_cost,
        body.sale_price !== undefined ? Math.max(0, Number(body.sale_price) || 0) : existing.sale_price,
        body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
        id
      );

      if (Array.isArray(body.items)) {
        db.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(id);
        const insertItem = db.prepare(`
          INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, notes)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of body.items) {
          if (!item.ingredient_id || !(Number(item.quantity) > 0)) continue;
          insertItem.run(
            id,
            Number(item.ingredient_id),
            Number(item.quantity),
            normalizeUnit(item.unit || 'g'),
            String(item.notes || '').trim()
          );
        }
      }
    });

    tx();
    const settings = getSettingsMap(db);
    const updated = hydrateRecipe(db, db.prepare('SELECT * FROM recipes WHERE id = ?').get(id), settings);
    events.broadcast('recipes', 'updated', { id });
    res.json({ recipe: updated });
  });

  router.delete('/:id', authorize('admin', 'confeiteira'), (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Receita não encontrada.' });
    }
    events.broadcast('recipes', 'deleted', { id });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createRecipesRouter;
