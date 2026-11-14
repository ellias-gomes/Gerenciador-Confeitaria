import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Copy,
  Pencil,
  Trash2,
  Clock,
  ChefHat,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatPct, getCompatibleUnitsForSelect } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLiveSync } from '../lib/sync';
import Modal from '../components/Modal';

const EMPTY_RECIPE = {
  name: '',
  category: 'Bolo',
  description: '',
  yield_quantity: 1,
  yield_unit: 'bolo',
  prep_time_minutes: 60,
  instructions: '',
  pricing_mode: 'margin',
  target_margin_pct: 40,
  markup_factor: 2.2,
  indirect_cost_pct: 10,
  extra_cost: 0,
  sale_price: 0,
  items: [],
};

export default function RecipesPage({ initialAction, onConsumeAction }) {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'confeiteira');

  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_RECIPE);
  const [preview, setPreview] = useState(null);
  const [viewRecipe, setViewRecipe] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [recRes, ingRes] = await Promise.all([
        apiRequest('/api/recipes'),
        apiRequest('/api/ingredients'),
      ]);
      setRecipes(recRes.recipes || []);
      setIngredients(ingRes.ingredients || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useLiveSync(['recipes', 'ingredients', 'settings'], loadData);

  // Recalcula ficha técnica em tempo real enquanto a usuária edita
  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest('/api/recipes/preview', {
          method: 'POST',
          body: form,
        });
        if (!cancelled) setPreview(res);
      } catch {
        // ignora erro temporário de digitação
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form, formOpen]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    const firstIng = ingredients[0];
    setForm({
      ...EMPTY_RECIPE,
      items: firstIng
        ? [{ ingredient_id: firstIng.id, quantity: 100, unit: getCompatibleUnitsForSelect(firstIng.purchase_unit)[0], notes: '' }]
        : [],
    });
    setPreview(null);
    setFormOpen(true);
  }, [ingredients]);

  useEffect(() => {
    if (!loading && initialAction?.action === 'create' && canEdit) {
      openCreate();
      if (onConsumeAction) onConsumeAction();
    }
  }, [loading, initialAction, canEdit, openCreate, onConsumeAction]);

  const openEdit = (recipe) => {
    setEditingId(recipe.id);
    setForm({
      name: recipe.name,
      category: recipe.category,
      description: recipe.description || '',
      yield_quantity: recipe.yield_quantity,
      yield_unit: recipe.yield_unit,
      prep_time_minutes: recipe.prep_time_minutes,
      instructions: recipe.instructions || '',
      pricing_mode: recipe.pricing_mode || 'margin',
      target_margin_pct: recipe.target_margin_pct ?? 40,
      markup_factor: recipe.markup_factor ?? 2.2,
      indirect_cost_pct: recipe.indirect_cost_pct ?? 10,
      extra_cost: recipe.extra_cost ?? 0,
      sale_price: recipe.sale_price ?? 0,
      items: (recipe.items || []).map((it) => ({
        ingredient_id: it.ingredient_id,
        quantity: it.quantity,
        unit: it.unit,
        notes: it.notes || '',
      })),
    });
    setFormOpen(true);
  };

  const addIngredientRow = () => {
    const firstIng = ingredients[0];
    if (!firstIng) {
      setError('Cadastre pelo menos um insumo antes de montar a receita.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { ingredient_id: firstIng.id, quantity: 1, unit: firstIng.purchase_unit, notes: '' },
      ],
    }));
  };

  const updateIngredientRow = (index, patch) => {
    setForm((prev) => {
      const next = [...prev.items];
      const current = { ...next[index], ...patch };
      if (patch.ingredient_id) {
        const found = ingredients.find((i) => i.id === Number(patch.ingredient_id));
        if (found) current.unit = found.purchase_unit;
      }
      next[index] = current;
      return { ...prev, items: next };
    });
  };

  const removeIngredientRow = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiRequest(`/api/recipes/${editingId}`, { method: 'PUT', body: form });
      } else {
        await apiRequest('/api/recipes', { method: 'POST', body: form });
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDuplicate = async (recipe) => {
    try {
      await apiRequest(`/api/recipes/${recipe.id}/duplicate`, { method: 'POST' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (recipe) => {
    if (!window.confirm(`Excluir a receita "${recipe.name}"?`)) return;
    try {
      await apiRequest(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const categories = Array.from(new Set(recipes.map((r) => r.category))).filter(Boolean);
  const filtered = recipes.filter((r) => {
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">Receitas & Fichas Técnicas</h2>
          <p className="text-xs text-stone-500 sm:text-sm">
            Registre ingredientes, embalagens e tempo de preparo com cálculo automático do preço ideal.
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" />
            Nova Receita
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filtros */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar bolo, doce, recheio..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              categoryFilter === '' ? 'bg-berry-700 text-white' : 'bg-stone-100 text-stone-700'
            }`}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                categoryFilter === cat ? 'bg-berry-700 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de Receitas */}
      {loading ? (
        <div className="py-10 text-center text-sm text-stone-500">Carregando receitas...</div>
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-stone-500">Nenhuma receita encontrada.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const m = r.metrics || {};
            return (
              <div key={r.id} className="card flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                        {r.category}
                      </span>
                      <h3 className="mt-1 text-base font-bold text-stone-900">{r.name}</h3>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 shrink-0">
                      <Clock className="h-3 w-3" />
                      {r.prep_time_minutes} min
                    </span>
                  </div>

                  {r.description && <p className="mt-1.5 text-xs text-stone-500 line-clamp-2">{r.description}</p>}

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-[#f3e8e2] bg-[#fffaf6] p-3 text-xs">
                    <div>
                      <span className="block text-[10px] text-stone-500">Custo Total ({r.yield_quantity} {r.yield_unit})</span>
                      <span className="font-bold text-stone-900">{formatBRL(m.total_cost)}</span>
                      <span className="block text-[10px] text-stone-500">
                        {formatBRL(m.unit_cost)} / {r.yield_unit}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-stone-500">Preço de Venda</span>
                      <span className="font-extrabold text-berry-700">{formatBRL(m.effective_price)}</span>
                      <span className="block text-[10px] text-stone-500">
                        Sugerido: {formatBRL(m.suggested_price)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-stone-500">Lucro Estimado</span>
                      <span className={`font-bold ${m.estimated_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatBRL(m.estimated_profit)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-stone-500">Margem / CMV</span>
                      <span className="font-bold text-stone-800">
                        {formatPct(m.actual_margin_pct)} • CMV {formatPct(m.cmv_pct)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setViewRecipe(r)}
                    className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver Ficha ({r.items?.length || 0})
                  </button>

                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDuplicate(r)}
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
                        title="Duplicar receita"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                        title="Editar receita"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Visualizar Ficha Técnica */}
      <Modal
        open={!!viewRecipe}
        onClose={() => setViewRecipe(null)}
        title={viewRecipe?.name || ''}
        subtitle={`${viewRecipe?.category || ''} • Rendimento: ${viewRecipe?.yield_quantity} ${viewRecipe?.yield_unit}`}
        maxWidth="max-w-2xl"
      >
        {viewRecipe && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[10px] text-stone-500">Ingredientes</span>
                <p className="font-bold">{formatBRL(viewRecipe.metrics.ingredients_cost)}</p>
              </div>
              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[10px] text-stone-500">Embalagens</span>
                <p className="font-bold">{formatBRL(viewRecipe.metrics.packaging_cost)}</p>
              </div>
              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[10px] text-stone-500">Gás/Luz + Mão de Obra</span>
                <p className="font-bold">
                  {formatBRL(viewRecipe.metrics.indirect_cost + viewRecipe.metrics.labor_cost)}
                </p>
              </div>
              <div className="rounded-xl bg-berry-50 p-2.5">
                <span className="text-[10px] text-berry-700">Preço Final / Lucro</span>
                <p className="font-extrabold text-berry-800">
                  {formatBRL(viewRecipe.metrics.effective_price)} (+{formatBRL(viewRecipe.metrics.estimated_profit)})
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-bold text-stone-800">Composição da Ficha Técnica</h4>
              <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
                {viewRecipe.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="font-semibold text-stone-900">{it.ingredient_name}</span>
                      {it.notes && <span className="ml-2 text-stone-400">({it.notes})</span>}
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-stone-700">
                        {it.quantity} {it.unit}
                      </span>
                      <span className="ml-3 font-bold text-stone-900">{formatBRL(it.item_cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {viewRecipe.instructions && (
              <div>
                <h4 className="mb-1.5 font-bold text-stone-800">Modo de Preparo</h4>
                <div className="whitespace-pre-line rounded-xl bg-[#fffaf6] p-3 text-stone-700 border border-[#f0e4dc]">
                  {viewRecipe.instructions}
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex justify-end border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewRecipe;
                    setViewRecipe(null);
                    openEdit(target);
                  }}
                  className="btn-primary text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar esta Receita
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Criar / Editar Receita */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Editar Ficha Técnica' : 'Nova Receita / Ficha Técnica'}
        subtitle="Monte os ingredientes e veja o custo e preço de venda sugerido na hora."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nome da receita *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Bolo Caseiro de Cenoura c/ Chocolate"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input-field"
              >
                <option value="Bolo">Bolo</option>
                <option value="Bolo Decorado">Bolo Decorado</option>
                <option value="Docinho">Docinho</option>
                <option value="Sobremesa">Sobremesa / Pote</option>
                <option value="Recheio">Recheio / Cobertura</option>
                <option value="Kit Festa">Kit Festa</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Tempo de preparo (minutos)</label>
              <input
                type="number"
                min="0"
                value={form.prep_time_minutes}
                onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Rendimento (quantidade)</label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={form.yield_quantity}
                onChange={(e) => setForm({ ...form, yield_quantity: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Unidade do rendimento</label>
              <input
                type="text"
                value={form.yield_unit}
                onChange={(e) => setForm({ ...form, yield_unit: e.target.value })}
                placeholder="un, bolo, fatias, kg..."
                className="input-field"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Descrição curta</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Massa fofinha com cobertura cremosa"
                className="input-field"
              />
            </div>
          </div>

          {/* Ingredientes e Embalagens */}
          <div className="space-y-2 rounded-2xl border border-[#f0e4dc] bg-[#fffaf6] p-3.5">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                <ChefHat className="h-4 w-4 text-berry-700" />
                Ingredientes e Embalagens
              </h4>
              <button type="button" onClick={addIngredientRow} className="btn-secondary px-3 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
              </button>
            </div>

            {form.items.length === 0 ? (
              <p className="py-3 text-center text-xs text-stone-500">Adicione os ingredientes usados nesta receita.</p>
            ) : (
              <div className="space-y-2">
                {form.items.map((row, idx) => {
                  const selectedIng = ingredients.find((i) => i.id === Number(row.ingredient_id));
                  const compatibleUnits = getCompatibleUnitsForSelect(selectedIng?.purchase_unit);
                  const previewItem = preview?.items?.[idx];

                  return (
                    <div key={idx} className="grid grid-cols-12 items-center gap-2 rounded-xl bg-white p-2 border border-stone-100">
                      <div className="col-span-12 sm:col-span-5">
                        <select
                          value={row.ingredient_id}
                          onChange={(e) => updateIngredientRow(idx, { ingredient_id: Number(e.target.value) })}
                          className="input-field py-2 text-xs"
                        >
                          {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} ({formatBRL(ing.current_price)} / {ing.package_size}{ing.purchase_unit})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.quantity}
                          onChange={(e) => updateIngredientRow(idx, { quantity: e.target.value })}
                          className="input-field py-2 text-xs"
                          placeholder="Qtd"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <select
                          value={row.unit}
                          onChange={(e) => updateIngredientRow(idx, { unit: e.target.value })}
                          className="input-field py-2 text-xs"
                        >
                          {compatibleUnits.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3 sm:col-span-2 text-right text-xs font-bold text-stone-800">
                        {previewItem ? formatBRL(previewItem.item_cost) : '-'}
                      </div>
                      <div className="col-span-12 sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(idx)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Precificação */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Modo de preço</label>
              <select
                value={form.pricing_mode}
                onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}
                className="input-field"
              >
                <option value="margin">Margem (%)</option>
                <option value="markup">Multiplicador (Markup)</option>
              </select>
            </div>
            {form.pricing_mode === 'margin' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Margem alvo (%)</label>
                <input
                  type="number"
                  step="1"
                  value={form.target_margin_pct}
                  onChange={(e) => setForm({ ...form, target_margin_pct: e.target.value })}
                  className="input-field"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Fator Markup (ex: 2.2)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={form.markup_factor}
                  onChange={(e) => setForm({ ...form, markup_factor: e.target.value })}
                  className="input-field"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Gás/Luz/Perdas (%)</label>
              <input
                type="number"
                step="1"
                value={form.indirect_cost_pct}
                onChange={(e) => setForm({ ...form, indirect_cost_pct: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Preço de venda fixo (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                placeholder="0 = usar sugerido"
                className="input-field"
              />
            </div>
          </div>

          {preview?.metrics && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-berry-50 p-3.5 text-xs sm:grid-cols-4 border border-berry-100">
              <div>
                <span className="text-[10px] text-berry-700">Custo Insumos + Emb.</span>
                <p className="font-bold text-stone-900">{formatBRL(preview.metrics.direct_cost)}</p>
              </div>
              <div>
                <span className="text-[10px] text-berry-700">Custo Total Real</span>
                <p className="font-bold text-stone-900">{formatBRL(preview.metrics.total_cost)}</p>
              </div>
              <div>
                <span className="text-[10px] text-berry-700">Preço Sugerido</span>
                <p className="font-extrabold text-berry-800">{formatBRL(preview.metrics.suggested_price)}</p>
              </div>
              <div>
                <span className="text-[10px] text-berry-700">Lucro Líquido Est.</span>
                <p className="font-extrabold text-emerald-700">
                  {formatBRL(preview.metrics.estimated_profit)} ({formatPct(preview.metrics.actual_margin_pct)})
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Modo de preparo / observações</label>
            <textarea
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Passo a passo rápido para padronizar a receita..."
              className="input-field"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Receita
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
