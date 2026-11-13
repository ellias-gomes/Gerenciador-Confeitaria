import React, { useCallback, useEffect, useState } from 'react';
import {
  Calculator,
  Plus,
  Trash2,
  ShoppingCart,
  Copy,
  Check,
  Save,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLiveSync } from '../lib/sync';

export default function PlannerPage() {
  const { hasRole } = useAuth();
  const canSave = hasRole('admin', 'confeiteira', 'atendente');

  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [simulations, setSimulations] = useState([]);

  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [services, setServices] = useState([
    { name: 'Topo de bolo / decoração especial', cost: 25 },
    { name: 'Entrega / Combustível', cost: 15 },
  ]);
  const [considerStock, setConsiderStock] = useState(true);
  const [simTitle, setSimTitle] = useState('');

  const [result, setResult] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const loadBaseData = useCallback(async () => {
    try {
      const [recRes, ordRes, simRes] = await Promise.all([
        apiRequest('/api/recipes'),
        apiRequest('/api/orders'),
        apiRequest('/api/planner/simulations'),
      ]);
      setRecipes(recRes.recipes || []);
      setOrders((ordRes.orders || []).filter((o) => !['entregue', 'cancelado'].includes(o.status)));
      setSimulations(simRes.simulations || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  useLiveSync(['recipes', 'ingredients', 'orders', 'planner'], loadBaseData);

  const runCalculation = useCallback(async () => {
    try {
      const res = await apiRequest('/api/planner/calculate', {
        method: 'POST',
        body: {
          recipes: selectedRecipes,
          order_ids: selectedOrderIds,
          services,
          consider_stock: considerStock,
        },
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    }
  }, [selectedRecipes, selectedOrderIds, services, considerStock]);

  useEffect(() => {
    runCalculation();
  }, [runCalculation]);

  const addRecipeRow = () => {
    const first = recipes[0];
    if (!first) return;
    setSelectedRecipes((prev) => [...prev, { recipe_id: first.id, batches: 1 }]);
  };

  const toggleOrder = (orderId) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const addServiceRow = () => {
    setServices((prev) => [...prev, { name: '', cost: 0 }]);
  };

  const handleSaveSimulation = async () => {
    if (!result) return;
    try {
      await apiRequest('/api/planner/simulations', {
        method: 'POST',
        body: {
          title: simTitle.trim() || `Planejamento ${new Date().toLocaleDateString('pt-BR')}`,
          payload: {
            recipes: selectedRecipes,
            order_ids: selectedOrderIds,
            services,
            consider_stock: considerStock,
          },
          total_ingredients_cost: result.summary.total_packages_to_buy_cost,
          total_services_cost: result.summary.total_services_cost,
          total_estimated_spend: result.summary.total_out_of_pocket_spend,
        },
      });
      setSimTitle('');
      loadBaseData();
    } catch (err) {
      setError(err.message);
    }
  };

  const loadSimulation = (sim) => {
    const p = sim.payload || {};
    setSelectedRecipes(p.recipes || []);
    setSelectedOrderIds(p.order_ids || []);
    setServices(p.services || []);
    setConsiderStock(p.consider_stock !== false);
  };

  const deleteSimulation = async (id) => {
    try {
      await apiRequest(`/api/planner/simulations/${id}`, { method: 'DELETE' });
      loadBaseData();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyShoppingList = async () => {
    if (!result?.whatsapp_shopping_text) return;
    try {
      await navigator.clipboard.writeText(result.whatsapp_shopping_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignora
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">
          Calculadora de Produção, Serviços & Compras
        </h2>
        <p className="text-xs text-stone-500 sm:text-sm">
          Calcule quanto será necessário gastar para fazer novas receitas, atender encomendas e incluir serviços extras.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Coluna de entradas */}
        <div className="space-y-4 lg:col-span-6">
          {/* Receitas extras / novas */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">1. Receitas para Produzir</h3>
              <button type="button" onClick={addRecipeRow} className="btn-secondary px-3 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Adicionar Receita
              </button>
            </div>

            {selectedRecipes.length === 0 ? (
              <p className="text-xs text-stone-500">
                Nenhuma receita avulsa adicionada. Clique em "Adicionar Receita" ou selecione pedidos abaixo.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedRecipes.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={row.recipe_id}
                      onChange={(e) => {
                        const next = [...selectedRecipes];
                        next[idx] = { ...next[idx], recipe_id: Number(e.target.value) };
                        setSelectedRecipes(next);
                      }}
                      className="input-field py-2 text-xs flex-1"
                    >
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (rende {r.yield_quantity} {r.yield_unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={row.batches}
                      onChange={(e) => {
                        const next = [...selectedRecipes];
                        next[idx] = { ...next[idx], batches: Number(e.target.value) || 0 };
                        setSelectedRecipes(next);
                      }}
                      className="input-field w-20 py-2 text-xs"
                      title="Quantidade de lotes/receitas"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedRecipes((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pedidos em aberto */}
          <div className="card space-y-3">
            <h3 className="text-sm font-bold text-stone-900">2. Incluir Pedidos da Agenda ({orders.length})</h3>
            {orders.length === 0 ? (
              <p className="text-xs text-stone-500">Nenhum pedido pendente na agenda.</p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {orders.map((ord) => {
                  const checked = selectedOrderIds.includes(ord.id);
                  return (
                    <label
                      key={ord.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                        checked ? 'border-berry-600 bg-berry-50/70' : 'border-stone-100 bg-stone-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOrder(ord.id)}
                          className="h-4 w-4 accent-berry-700"
                        />
                        <div className="min-w-0">
                          <span className="font-bold text-stone-900">{ord.order_code}</span>{' '}
                          <span className="text-stone-700">• {ord.customer_name}</span>
                          <span className="block text-[10px] text-stone-500">
                            Entrega: {formatDateBR(ord.delivery_date)}
                          </span>
                        </div>
                      </div>
                      <span className="font-semibold text-stone-800 shrink-0">{formatBRL(ord.total_amount)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Serviços adicionais */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">3. Serviços & Custos Extras</h3>
              <button type="button" onClick={addServiceRow} className="btn-secondary px-3 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Adicionar Serviço
              </button>
            </div>
            <div className="space-y-2">
              {services.map((srv, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={srv.name}
                    onChange={(e) => {
                      const next = [...services];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setServices(next);
                    }}
                    placeholder="Ex: Topo personalizado, ajudante, frete..."
                    className="input-field py-2 text-xs flex-1"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={srv.cost}
                    onChange={(e) => {
                      const next = [...services];
                      next[idx] = { ...next[idx], cost: Number(e.target.value) || 0 };
                      setServices(next);
                    }}
                    className="input-field w-28 py-2 text-xs"
                    placeholder="R$"
                  />
                  <button
                    type="button"
                    onClick={() => setServices((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 pt-2 text-xs font-medium text-stone-700">
              <input
                type="checkbox"
                checked={considerStock}
                onChange={(e) => setConsiderStock(e.target.checked)}
                className="h-4 w-4 accent-berry-700"
              />
              Descontar automaticamente o que já tenho em estoque
            </label>
          </div>
        </div>

        {/* Coluna de resultado e lista de compras */}
        <div className="space-y-4 lg:col-span-6">
          <div className="card space-y-4 border-berry-200 bg-gradient-to-br from-white to-[#fff5f7]">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-extrabold text-stone-900">
                <Calculator className="h-5 w-5 text-berry-700" />
                Resumo Financeiro Previsto
              </h3>
              <button
                type="button"
                onClick={copyShoppingList}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Lista copiada!' : 'Copiar WhatsApp'}
              </button>
            </div>

            {result && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-berry-700 p-3.5 text-white shadow-sm">
                    <span className="text-[11px] opacity-85">Desembolso Imediato (Compras + Serviços)</span>
                    <p className="mt-1 text-2xl font-extrabold">
                      {formatBRL(result.summary.total_out_of_pocket_spend)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#f0e4dc] bg-white p-3.5">
                    <span className="text-[11px] text-stone-500">Custo Total da Produção</span>
                    <p className="mt-1 text-2xl font-extrabold text-stone-900">
                      {formatBRL(result.summary.total_production_cost)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-3 text-xs border border-[#f0e4dc] sm:grid-cols-4">
                  <div>
                    <span className="block text-[10px] text-stone-500">Insumos Usados</span>
                    <strong>{formatBRL(result.summary.total_ingredients_full_value)}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-stone-500">Compras Mercado</span>
                    <strong className="text-berry-800">{formatBRL(result.summary.total_packages_to_buy_cost)}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-stone-500">Gás/Luz + Mão de Obra</span>
                    <strong>{formatBRL(result.summary.indirect_cost + result.summary.labor_cost)}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-stone-500">Orçamento Sugerido</span>
                    <strong className="text-emerald-700">{formatBRL(result.summary.suggested_quote_price)}</strong>
                  </div>
                </div>
              </>
            )}

            {canSave && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  placeholder="Nome para salvar simulação (ex: Encomendas Fim de Semana)"
                  className="input-field py-2 text-xs"
                />
                <button type="button" onClick={handleSaveSimulation} className="btn-primary shrink-0 px-3 py-2 text-xs">
                  <Save className="h-3.5 w-3.5" />
                  Salvar
                </button>
              </div>
            )}
          </div>

          {/* Lista de Compras */}
          <div className="card space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <ShoppingCart className="h-4 w-4 text-berry-700" />
              Lista de Compras & Estoque Necessário
            </h3>

            {!result || result.shopping_list.length === 0 ? (
              <p className="py-4 text-center text-xs text-stone-500">
                Selecione receitas ou pedidos para gerar automaticamente a lista de ingredientes e embalagens.
              </p>
            ) : (
              <div className="divide-y divide-stone-100">
                {result.shopping_list.map((item) => {
                  const done = !!checkedItems[item.ingredient_id];
                  const needToBuy = item.missing_qty > 0;
                  return (
                    <label
                      key={item.ingredient_id}
                      className={`flex cursor-pointer items-center justify-between gap-2 py-2.5 text-xs ${
                        done ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() =>
                            setCheckedItems((prev) => ({
                              ...prev,
                              [item.ingredient_id]: !prev[item.ingredient_id],
                            }))
                          }
                          className="mt-0.5 h-4 w-4 accent-berry-700"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-stone-900">{item.name}</p>
                          <p className="text-[11px] text-stone-500">
                            Precisa: {item.needed_qty} {item.purchase_unit} • Em estoque: {item.stock_quantity}{' '}
                            {item.purchase_unit}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {needToBuy ? (
                          <>
                            <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                              Comprar {item.packages_to_buy} emb. ({item.missing_qty} {item.purchase_unit})
                            </span>
                            <p className="mt-0.5 font-bold text-stone-900">
                              {formatBRL(item.full_packages_buy_cost)}
                            </p>
                          </>
                        ) : (
                          <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Estoque suficiente
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Simulações salvas */}
          {simulations.length > 0 && (
            <div className="card space-y-2.5">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Planejamentos Salvos
              </h3>
              <div className="space-y-2">
                {simulations.map((sim) => (
                  <div
                    key={sim.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => loadSimulation(sim)}
                      className="text-left min-w-0 flex-1 hover:text-berry-700"
                    >
                      <p className="truncate font-bold text-stone-900">{sim.title}</p>
                      <p className="text-[11px] text-stone-500">
                        Desembolso est.: {formatBRL(sim.total_estimated_spend)} • {formatDateBR(sim.created_at)}
                      </p>
                    </button>
                    {hasRole('admin', 'confeiteira') && (
                      <button
                        type="button"
                        onClick={() => deleteSimulation(sim.id)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
