import React, { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  Wallet,
  PackageOpen,
  BookOpen,
  ClipboardList,
  ArrowRight,
  Plus,
  Users,
  Package,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatBRL, formatDateBR, formatPct, ORDER_STATUS_META } from '../lib/format';
import { useLiveSync } from '../lib/sync';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage({ onNavigate }) {
  const { hasRole } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const canProduce = hasRole('admin', 'confeiteira');
  const canSell = hasRole('admin', 'confeiteira', 'atendente');

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiRequest('/api/dashboard');
      setData(res);
    } catch {
      // erro tratado na interface
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useLiveSync(null, loadDashboard);

  if (loading && !data) {
    return <div className="py-12 text-center text-sm text-stone-500">Carregando painel da confeitaria...</div>;
  }

  const kpis = data?.kpis || {};
  const alerts = data?.alerts || { low_stock: [], rising_prices: [], low_margin_recipes: [] };
  const upcomingOrders = data?.upcoming_orders || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">Painel da Confeitaria</h2>
          <p className="text-xs text-stone-500 sm:text-sm">
            Visão geral sincronizada entre computador e celular.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSell && (
            <button
              type="button"
              onClick={() => onNavigate('orders', { action: 'create' })}
              className="btn-primary text-xs sm:text-sm"
            >
              <ClipboardList className="h-4 w-4" />
              + Novo Pedido
            </button>
          )}
          <button type="button" onClick={() => onNavigate('planner')} className="btn-secondary text-xs sm:text-sm">
            Calcular Gastos
          </button>
        </div>
      </div>

      {/* Atalhos Rápidos */}
      {(canProduce || canSell) && (
        <div className="card">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-stone-500">Cadastros e Atalhos Rápidos</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {canProduce && (
              <button
                type="button"
                onClick={() => onNavigate('ingredients', { action: 'create' })}
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
              >
                <Plus className="h-4 w-4" />
                <Package className="h-4 w-4" />
                <span>Novo Insumo / Estoque</span>
              </button>
            )}
            {canProduce && (
              <button
                type="button"
                onClick={() => onNavigate('recipes', { action: 'create' })}
                className="flex items-center justify-center gap-2 rounded-xl border border-berry-200 bg-berry-50/70 px-3 py-2.5 text-xs font-bold text-berry-900 transition hover:bg-berry-100"
              >
                <Plus className="h-4 w-4" />
                <BookOpen className="h-4 w-4" />
                <span>Nova Receita</span>
              </button>
            )}
            {canSell && (
              <button
                type="button"
                onClick={() => onNavigate('orders', { action: 'create' })}
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100"
              >
                <Plus className="h-4 w-4" />
                <ClipboardList className="h-4 w-4" />
                <span>Novo Pedido</span>
              </button>
            )}
            {canSell && (
              <button
                type="button"
                onClick={() => onNavigate('customers', { action: 'create' })}
                className="flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2.5 text-xs font-bold text-sky-900 transition hover:bg-sky-100"
              >
                <Plus className="h-4 w-4" />
                <Users className="h-4 w-4" />
                <span>Novo Cliente</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        <div className="card">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Pedidos Ativos</span>
            <CalendarClock className="h-4 w-4 text-berry-700" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-stone-900">{kpis.active_orders_count || 0}</p>
          <p className="mt-1 text-[11px] text-stone-500">{kpis.upcoming_week_count || 0} nos próximos 7 dias</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Faturamento Mês</span>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-stone-900">{formatBRL(kpis.month_revenue)}</p>
          <p className="mt-1 text-[11px] text-emerald-700">Lucro est.: {formatBRL(kpis.month_profit)}</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">A Receber</span>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-stone-900">{formatBRL(kpis.pending_to_receive)}</p>
          <p className="mt-1 text-[11px] text-stone-500">Saldo de pedidos ativos</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Catálogo</span>
            <BookOpen className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-stone-900">{kpis.recipes_count || 0} receitas</p>
          <p className="mt-1 text-[11px] text-stone-500">
            {kpis.ingredients_count || 0} insumos • {kpis.customers_count || 0} clientes
          </p>
        </div>
      </div>

      {/* Alertas Inteligentes */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tendência de alta nos preços */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <TrendingUp className="h-4 w-4 text-rose-600" />
              Insumos em Alta
            </h3>
            <button onClick={() => onNavigate('ingredients')} className="text-xs font-semibold text-berry-700 hover:underline">
              Ver todos
            </button>
          </div>
          {alerts.rising_prices.length === 0 ? (
            <p className="text-xs text-stone-500">Nenhum insumo com tendência de alta detectada.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.rising_prices.slice(0, 4).map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl bg-rose-50/70 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{item.name}</p>
                    <p className="text-[11px] text-stone-500">{item.supplier || 'Sem fornecedor'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-rose-700">+{formatPct(item.variation_overall_pct)}</p>
                    <p className="text-[11px] text-stone-600">{formatBRL(item.current_price)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Estoque baixo */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <PackageOpen className="h-4 w-4 text-amber-600" />
              Estoque Baixo
            </h3>
            <button onClick={() => onNavigate('ingredients')} className="text-xs font-semibold text-berry-700 hover:underline">
              Repor
            </button>
          </div>
          {alerts.low_stock.length === 0 ? (
            <p className="text-xs text-stone-500">Todos os insumos estão acima do estoque mínimo.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.low_stock.slice(0, 4).map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl bg-amber-50/80 px-3 py-2 text-xs">
                  <span className="truncate font-semibold text-stone-900">{item.name}</span>
                  <span className="shrink-0 font-bold text-amber-800">
                    {item.stock_quantity} / {item.min_stock} {item.purchase_unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Receitas com margem apertada */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Margem Abaixo da Meta
            </h3>
            <button onClick={() => onNavigate('recipes')} className="text-xs font-semibold text-berry-700 hover:underline">
              Revisar
            </button>
          </div>
          {alerts.low_margin_recipes.length === 0 ? (
            <p className="text-xs text-stone-500">Todas as receitas estão dentro da margem saudável.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.low_margin_recipes.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{r.name}</p>
                    <p className="text-[11px] text-stone-500">
                      Atual {formatBRL(r.effective_price)} → Sug. {formatBRL(r.suggested_price)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-rose-700">{formatPct(r.actual_margin_pct)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Próximas Encomendas */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-900">Próximas Encomendas</h3>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-berry-700 hover:underline"
          >
            Abrir agenda <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {upcomingOrders.length === 0 ? (
          <p className="py-4 text-center text-xs text-stone-500">Nenhum pedido ativo no momento.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {upcomingOrders.map((order) => {
              const st = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.orcamento;
              return (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">{order.order_code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-0.5 font-medium text-stone-700">
                      {order.customer_name} • {order.flavor_notes || order.theme_description || 'Encomenda personalizada'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-stone-900">
                      {formatDateBR(order.delivery_date)} às {order.delivery_time || 'a combinar'}
                    </p>
                    <p className="text-[11px] text-stone-500">Total: {formatBRL(order.total_amount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
