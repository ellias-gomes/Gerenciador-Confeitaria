import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  LineChart,
  DollarSign,
  Pencil,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR, formatPct } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLiveSync } from '../lib/sync';
import Modal from '../components/Modal';
import PriceTrendChart from '../components/PriceTrendChart';

const EMPTY_FORM = {
  name: '',
  category: 'Laticínios',
  kind: 'ingrediente',
  purchase_unit: 'g',
  package_size: 395,
  current_price: 0,
  stock_quantity: 0,
  min_stock: 0,
  supplier: '',
  brand: '',
  notes: '',
};

const TREND_BADGE = {
  subindo: { label: 'Subindo', icon: TrendingUp, color: 'bg-rose-100 text-rose-700' },
  caindo: { label: 'Caindo', icon: TrendingDown, color: 'bg-emerald-100 text-emerald-700' },
  estavel: { label: 'Estável', icon: Minus, color: 'bg-stone-100 text-stone-600' },
};

export default function IngredientsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'confeiteira');

  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [priceModalItem, setPriceModalItem] = useState(null);
  const [priceForm, setPriceForm] = useState({
    price: '',
    package_size: '',
    supplier: '',
    brand: '',
    add_to_stock_qty: 0,
    notes: '',
  });

  const [analysisModal, setAnalysisModal] = useState(null);

  const loadIngredients = useCallback(async () => {
    try {
      const data = await apiRequest('/api/ingredients');
      setIngredients(data.ingredients || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  useLiveSync(['ingredients', 'recipes'], loadIngredients);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (ing) => {
    setEditingId(ing.id);
    setForm({
      name: ing.name,
      category: ing.category,
      kind: ing.kind,
      purchase_unit: ing.purchase_unit,
      package_size: ing.package_size,
      current_price: ing.current_price,
      stock_quantity: ing.stock_quantity,
      min_stock: ing.min_stock,
      supplier: ing.supplier || '',
      brand: ing.brand || '',
      notes: ing.notes || '',
    });
    setFormOpen(true);
  };

  const handleSaveIngredient = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiRequest(`/api/ingredients/${editingId}`, { method: 'PUT', body: form });
      } else {
        await apiRequest('/api/ingredients', { method: 'POST', body: form });
      }
      setFormOpen(false);
      loadIngredients();
    } catch (err) {
      setError(err.message);
    }
  };

  const openNewPrice = (ing) => {
    setPriceModalItem(ing);
    setPriceForm({
      price: ing.current_price,
      package_size: ing.package_size,
      supplier: ing.supplier || '',
      brand: ing.brand || '',
      add_to_stock_qty: ing.package_size,
      notes: 'Compra / atualização de mercado',
    });
  };

  const handleRecordPrice = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest(`/api/ingredients/${priceModalItem.id}/prices`, {
        method: 'POST',
        body: {
          ...priceForm,
          price: Number(priceForm.price),
          package_size: Number(priceForm.package_size),
          add_to_stock_qty: Number(priceForm.add_to_stock_qty) || 0,
        },
      });
      setPriceModalItem(null);
      loadIngredients();
    } catch (err) {
      setError(err.message);
    }
  };

  const openAnalysis = async (ing) => {
    try {
      const data = await apiRequest(`/api/ingredients/${ing.id}/analysis`);
      setAnalysisModal(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (ing) => {
    if (!window.confirm(`Excluir "${ing.name}"?`)) return;
    setError('');
    try {
      await apiRequest(`/api/ingredients/${ing.id}`, { method: 'DELETE' });
      loadIngredients();
    } catch (err) {
      setError(err.message);
    }
  };

  const filtered = ingredients.filter((ing) => {
    if (kindFilter && ing.kind !== kindFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        ing.name.toLowerCase().includes(q) ||
        (ing.supplier || '').toLowerCase().includes(q) ||
        (ing.category || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">Insumos & Tendências de Preço</h2>
          <p className="text-xs text-stone-500 sm:text-sm">
            Acompanhe estoque, fornecedores e como a alta dos ingredientes afeta suas receitas.
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo Insumo
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
          <Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ingrediente, embalagem, categoria ou fornecedor..."
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-2">
          {[
            { id: '', label: 'Todos' },
            { id: 'ingrediente', label: 'Ingredientes' },
            { id: 'embalagem', label: 'Embalagens' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setKindFilter(opt.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                kindFilter === opt.id ? 'bg-berry-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista responsiva */}
      {loading ? (
        <div className="py-10 text-center text-sm text-stone-500">Carregando insumos...</div>
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-stone-500">
          Nenhum insumo encontrado com esse filtro.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ing) => {
            const trendKey = ing.analysis?.trend || 'estavel';
            const trendMeta = TREND_BADGE[trendKey] || TREND_BADGE.estavel;
            const TrendIcon = trendMeta.icon;

            return (
              <div key={ing.id} className="card flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="inline-block rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
                        {ing.kind === 'embalagem' ? 'Embalagem' : ing.category}
                      </span>
                      <h3 className="mt-1 truncate text-base font-bold text-stone-900">{ing.name}</h3>
                      <p className="text-xs text-stone-500">
                        Embalagem: {ing.package_size} {ing.purchase_unit} • {ing.supplier || 'Sem fornecedor'}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${trendMeta.color}`}>
                      <TrendIcon className="h-3.5 w-3.5" />
                      {trendMeta.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#fffaf6] p-2.5 text-xs border border-[#f3e8e2]">
                    <div>
                      <span className="block text-[10px] text-stone-500">Preço Atual</span>
                      <span className="font-extrabold text-stone-900">{formatBRL(ing.current_price)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-stone-500">Variação Total</span>
                      <span
                        className={`font-bold ${
                          (ing.analysis?.variation_overall_pct || 0) > 0
                            ? 'text-rose-700'
                            : (ing.analysis?.variation_overall_pct || 0) < 0
                            ? 'text-emerald-700'
                            : 'text-stone-600'
                        }`}
                      >
                        {(ing.analysis?.variation_overall_pct || 0) > 0 ? '+' : ''}
                        {formatPct(ing.analysis?.variation_overall_pct || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-stone-500">Estoque</span>
                      <span className={`font-bold ${ing.is_low_stock ? 'text-amber-700' : 'text-stone-800'}`}>
                        {ing.stock_quantity} {ing.purchase_unit}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => openAnalysis(ing)}
                    className="inline-flex items-center gap-1 rounded-lg bg-berry-50 px-2.5 py-1.5 text-xs font-semibold text-berry-800 hover:bg-berry-100"
                  >
                    <LineChart className="h-3.5 w-3.5" />
                    Tendência ({ing.analysis?.records_count || 0})
                  </button>

                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openNewPrice(ing)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        title="Registrar nova compra ou preço"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Novo Preço
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(ing)}
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ing)}
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

      {/* Modal Criar/Editar Insumo */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Editar Insumo' : 'Cadastrar Novo Insumo'}
        subtitle="Informe como você compra a embalagem fechada para o sistema converter automaticamente nas receitas."
      >
        <form onSubmit={handleSaveIngredient} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nome do insumo *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Leite Condensado Integral"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Tipo</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="input-field"
              >
                <option value="ingrediente">Ingrediente</option>
                <option value="embalagem">Embalagem / Descartável</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Categoria</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Laticínios, Chocolates, Embalagens..."
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Tamanho da embalagem *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.package_size}
                onChange={(e) => setForm({ ...form, package_size: e.target.value })}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Unidade de compra *</label>
              <select
                value={form.purchase_unit}
                onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })}
                className="input-field"
              >
                <option value="g">Gramas (g)</option>
                <option value="kg">Quilos (kg)</option>
                <option value="ml">Mililitros (ml)</option>
                <option value="l">Litros (L)</option>
                <option value="un">Unidades (un)</option>
                <option value="pct">Pacotes (pct)</option>
                <option value="cx">Caixas (cx)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Preço pago na embalagem (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.current_price}
                onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Fornecedor / Mercado</label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="Ex: Atacadão"
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Estoque atual ({form.purchase_unit})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Estoque mínimo alerta</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                className="input-field"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Marca / Observações</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Ex: Piracanjuba / Moça"
                className="input-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Insumo
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Registrar Novo Preço / Compra */}
      <Modal
        open={!!priceModalItem}
        onClose={() => setPriceModalItem(null)}
        title={`Registrar Novo Preço: ${priceModalItem?.name || ''}`}
        subtitle="Atualiza o histórico de tendências e recalcula automaticamente o custo das receitas."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleRecordPrice} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Novo preço pago (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceForm.price}
                onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tamanho embalagem ({priceModalItem?.purchase_unit})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={priceForm.package_size}
                onChange={(e) => setPriceForm({ ...priceForm, package_size: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Fornecedor</label>
              <input
                type="text"
                value={priceForm.supplier}
                onChange={(e) => setPriceForm({ ...priceForm, supplier: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Somar ao estoque ({priceModalItem?.purchase_unit})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceForm.add_to_stock_qty}
                onChange={(e) => setPriceForm({ ...priceForm, add_to_stock_qty: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Observação da compra</label>
              <input
                type="text"
                value={priceForm.notes}
                onChange={(e) => setPriceForm({ ...priceForm, notes: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPriceModalItem(null)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Registrar Preço
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Análise de Tendência & Impacto */}
      <Modal
        open={!!analysisModal}
        onClose={() => setAnalysisModal(null)}
        title={`Análise de Preço: ${analysisModal?.ingredient?.name || ''}`}
        subtitle="Histórico, comparativo entre fornecedores e impacto nas receitas cadastradas."
        maxWidth="max-w-3xl"
      >
        {analysisModal && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-[#fffaf6] p-3 border border-[#f0e4dc]">
                <span className="text-[10px] text-stone-500">Preço Atual</span>
                <p className="text-base font-extrabold text-stone-900">
                  {formatBRL(analysisModal.analysis.current_price)}
                </p>
              </div>
              <div className="rounded-xl bg-[#fffaf6] p-3 border border-[#f0e4dc]">
                <span className="text-[10px] text-stone-500">Média Histórica</span>
                <p className="text-base font-extrabold text-stone-900">
                  {formatBRL(analysisModal.analysis.avg_price)}
                </p>
              </div>
              <div className="rounded-xl bg-[#fffaf6] p-3 border border-[#f0e4dc]">
                <span className="text-[10px] text-stone-500">Menor / Maior</span>
                <p className="text-xs font-bold text-stone-800 mt-1">
                  {formatBRL(analysisModal.analysis.min_price)} / {formatBRL(analysisModal.analysis.max_price)}
                </p>
              </div>
              <div className="rounded-xl bg-[#fffaf6] p-3 border border-[#f0e4dc]">
                <span className="text-[10px] text-stone-500">Variação Período</span>
                <p className={`text-base font-extrabold ${analysisModal.analysis.variation_overall_pct > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {analysisModal.analysis.variation_overall_pct > 0 ? '+' : ''}
                  {formatPct(analysisModal.analysis.variation_overall_pct)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Evolução do Preço</h4>
              <PriceTrendChart history={analysisModal.analysis.history} />
            </div>

            {analysisModal.suppliers?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Comparativo por Fornecedor</h4>
                <div className="overflow-x-auto rounded-xl border border-stone-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-stone-500">
                      <tr>
                        <th className="px-3 py-2">Fornecedor</th>
                        <th className="px-3 py-2">Menor Preço</th>
                        <th className="px-3 py-2">Média</th>
                        <th className="px-3 py-2">Último</th>
                        <th className="px-3 py-2">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {analysisModal.suppliers.map((s) => (
                        <tr key={s.supplier}>
                          <td className="px-3 py-2 font-semibold text-stone-800">{s.supplier}</td>
                          <td className="px-3 py-2 text-emerald-700 font-semibold">{formatBRL(s.min_price)}</td>
                          <td className="px-3 py-2">{formatBRL(s.avg_price)}</td>
                          <td className="px-3 py-2 font-bold">{formatBRL(s.latest_price)}</td>
                          <td className="px-3 py-2 text-stone-500">{formatDateBR(s.latest_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                Receitas que usam este insumo ({analysisModal.affected_recipes?.length || 0})
              </h4>
              {analysisModal.affected_recipes?.length === 0 ? (
                <p className="text-xs text-stone-500">Nenhuma receita vinculada a este insumo ainda.</p>
              ) : (
                <div className="space-y-2">
                  {analysisModal.affected_recipes.map((rec) => (
                    <div key={rec.recipe_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                      <div>
                        <p className="font-bold text-stone-900">{rec.recipe_name}</p>
                        <p className="text-[11px] text-stone-500">
                          Custo total: {formatBRL(rec.current_total_cost)} • Preço venda: {formatBRL(rec.effective_price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${rec.cost_diff > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                          Impacto: {rec.cost_diff > 0 ? '+' : ''}{formatBRL(rec.cost_diff)}
                        </span>
                        <p className="text-[11px] text-stone-500">Margem: {formatPct(rec.actual_margin_pct)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
