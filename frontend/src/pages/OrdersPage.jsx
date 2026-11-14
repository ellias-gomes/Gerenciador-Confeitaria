import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  MessageCircle,
  MapPin,
  Calendar,
  Pencil,
  Trash2,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  buildWhatsappUrl,
  formatBRL,
  formatDateBR,
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
} from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLiveSync } from '../lib/sync';
import Modal from '../components/Modal';

const EMPTY_ORDER = {
  customer_id: '',
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  delivery_time: '15:00',
  delivery_type: 'retirada',
  delivery_fee: 0,
  discount: 0,
  deposit_paid: 0,
  payment_method: 'Pix',
  status: 'orcamento',
  theme_description: '',
  flavor_notes: '',
  allergy_notes: '',
  general_notes: '',
  items: [],
};

export default function OrdersPage({ initialAction, onConsumeAction }) {
  const { hasRole } = useAuth();
  const canCreateEdit = hasRole('admin', 'confeiteira', 'atendente');
  const canDelete = hasRole('admin', 'confeiteira');

  const [orders, setOrders] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_ORDER);
  const [copiedId, setCopiedId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [ordRes, recRes, custRes] = await Promise.all([
        apiRequest('/api/orders'),
        apiRequest('/api/recipes'),
        apiRequest('/api/customers'),
      ]);
      setOrders(ordRes.orders || []);
      setRecipes(recRes.recipes || []);
      setCustomers(custRes.customers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useLiveSync(['orders', 'customers', 'recipes'], loadData);

  const openCreate = useCallback((prefillCustomer = null) => {
    setEditingId(null);
    const firstRec = recipes[0];
    setForm({
      ...EMPTY_ORDER,
      customer_id: prefillCustomer ? String(prefillCustomer.id) : '',
      customer_name: prefillCustomer?.name || '',
      customer_phone: prefillCustomer?.phone || '',
      customer_address: prefillCustomer
        ? [prefillCustomer.address, prefillCustomer.neighborhood, prefillCustomer.reference_point].filter(Boolean).join(', ')
        : '',
      items: firstRec
        ? [
            {
              recipe_id: firstRec.id,
              item_name: firstRec.name,
              quantity: 1,
              unit_price: firstRec.metrics?.effective_price || 0,
              unit_cost: firstRec.metrics?.total_cost || 0,
              notes: '',
            },
          ]
        : [{ recipe_id: '', item_name: '', quantity: 1, unit_price: 0, unit_cost: 0, notes: '' }],
    });
    setFormOpen(true);
  }, [recipes]);

  useEffect(() => {
    if (!loading && initialAction?.action === 'create' && canCreateEdit) {
      openCreate(initialAction.customer || null);
      if (onConsumeAction) onConsumeAction();
    }
  }, [loading, initialAction, canCreateEdit, openCreate, onConsumeAction]);

  const openEdit = (order) => {
    setEditingId(order.id);
    setForm({
      customer_id: order.customer_id || '',
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address || '',
      delivery_date: order.delivery_date,
      delivery_time: order.delivery_time || '15:00',
      delivery_type: order.delivery_type || 'retirada',
      delivery_fee: order.delivery_fee || 0,
      discount: order.discount || 0,
      deposit_paid: order.deposit_paid || 0,
      payment_method: order.payment_method || 'Pix',
      status: order.status || 'orcamento',
      theme_description: order.theme_description || '',
      flavor_notes: order.flavor_notes || '',
      allergy_notes: order.allergy_notes || '',
      general_notes: order.general_notes || '',
      items: (order.items || []).map((it) => ({
        recipe_id: it.recipe_id || '',
        item_name: it.item_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        unit_cost: it.unit_cost,
        notes: it.notes || '',
      })),
    });
    setFormOpen(true);
  };

  const handleSelectCustomer = (custId) => {
    if (!custId) {
      setForm((prev) => ({ ...prev, customer_id: '' }));
      return;
    }
    const found = customers.find((c) => c.id === Number(custId));
    if (found) {
      setForm((prev) => ({
        ...prev,
        customer_id: found.id,
        customer_name: found.name,
        customer_phone: found.phone,
        customer_address: [found.address, found.neighborhood, found.reference_point].filter(Boolean).join(', '),
      }));
    }
  };

  const addItemRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { recipe_id: '', item_name: '', quantity: 1, unit_price: 0, unit_cost: 0, notes: '' }],
    }));
  };

  const updateItemRow = (index, patch) => {
    setForm((prev) => {
      const next = [...prev.items];
      const current = { ...next[index], ...patch };
      if (patch.recipe_id !== undefined && patch.recipe_id !== '') {
        const rec = recipes.find((r) => r.id === Number(patch.recipe_id));
        if (rec) {
          current.item_name = rec.name;
          current.unit_price = rec.metrics?.effective_price || 0;
          current.unit_cost = rec.metrics?.total_cost || 0;
        }
      }
      next[index] = current;
      return { ...prev, items: next };
    });
  };

  const removeItemRow = (index) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const formSubtotal = form.items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0
  );
  const formTotal = Math.max(
    0,
    formSubtotal +
      (form.delivery_type === 'entrega' ? Number(form.delivery_fee) || 0 : 0) -
      (Number(form.discount) || 0)
  );

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiRequest(`/api/orders/${editingId}`, { method: 'PUT', body: form });
      } else {
        await apiRequest('/api/orders', { method: 'POST', body: form });
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (order, newStatus) => {
    try {
      let deductStock = false;
      if (newStatus === 'em_producao' && order.status !== 'em_producao') {
        deductStock = window.confirm('Deseja dar baixa automática nos ingredientes do estoque para este pedido?');
      }
      await apiRequest(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        body: { status: newStatus, deduct_stock: deductStock },
      });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Excluir o pedido ${order.order_code}?`)) return;
    try {
      await apiRequest(`/api/orders/${order.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopySummary = async (order) => {
    try {
      await navigator.clipboard.writeText(order.whatsapp_summary || '');
      setCopiedId(order.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback silencioso
    }
  };

  const filtered = orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.order_code.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q) ||
        (o.theme_description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">Pedidos & Encomendas</h2>
          <p className="text-xs text-stone-500 sm:text-sm">
            Anote contatos, detalhes de decoração/sabores, entregas e controle de sinal pago.
          </p>
        </div>
        {canCreateEdit && (
          <button type="button" onClick={() => openCreate()} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo Pedido
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
      <div className="card flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, cliente, telefone ou tema..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              statusFilter === '' ? 'bg-berry-700 text-white' : 'bg-stone-100 text-stone-700'
            }`}
          >
            Todos ({orders.length})
          </button>
          {Object.entries(ORDER_STATUS_META).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                statusFilter === key ? 'bg-berry-700 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Pedidos */}
      {loading ? (
        <div className="py-10 text-center text-sm text-stone-500">Carregando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-stone-500">Nenhum pedido encontrado.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const st = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.orcamento;
            const pay = PAYMENT_STATUS_META[order.payment_status] || PAYMENT_STATUS_META.pendente;

            return (
              <div key={order.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-berry-800">{order.order_code}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.color}`}>{st.label}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pay.color}`}>{pay.label}</span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-stone-900">{order.customer_name}</h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
                      <a
                        href={buildWhatsappUrl(order.customer_phone, order.whatsapp_summary)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        {order.customer_phone}
                      </a>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" />
                        {formatDateBR(order.delivery_date)} às {order.delivery_time || 'a combinar'} (
                        {order.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'})
                      </span>
                      {order.customer_address && (
                        <span className="inline-flex items-center gap-1 text-stone-500">
                          <MapPin className="h-3.5 w-3.5 text-stone-400" />
                          {order.customer_address}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-extrabold text-stone-900">{formatBRL(order.total_amount)}</p>
                    <p className="text-xs text-stone-500">
                      Sinal: {formatBRL(order.deposit_paid)} • Falta:{' '}
                      <strong className="text-stone-800">{formatBRL(order.remaining_amount)}</strong>
                    </p>
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      Lucro est.: {formatBRL(order.estimated_profit)}
                    </p>
                  </div>
                </div>

                {/* Itens e descrições */}
                <div className="grid gap-3 rounded-xl bg-[#fffaf6] p-3 text-xs border border-[#f3e8e2] sm:grid-cols-2">
                  <div>
                    <p className="font-bold text-stone-700 mb-1">Itens do Pedido:</p>
                    <ul className="space-y-1">
                      {(order.items || []).map((it) => (
                        <li key={it.id} className="flex justify-between gap-2 text-stone-700">
                          <span>
                            <strong>{it.quantity}x</strong> {it.item_name}
                            {it.notes ? ` (${it.notes})` : ''}
                          </span>
                          <span className="font-semibold">{formatBRL(it.quantity * it.unit_price)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1 text-stone-700">
                    {order.theme_description && (
                      <p>
                        <strong>Tema / Decoração:</strong> {order.theme_description}
                      </p>
                    )}
                    {order.flavor_notes && (
                      <p>
                        <strong>Sabores / Massa:</strong> {order.flavor_notes}
                      </p>
                    )}
                    {order.allergy_notes && (
                      <p className="text-rose-700">
                        <strong>Alergias / Restrições:</strong> {order.allergy_notes}
                      </p>
                    )}
                    {order.general_notes && (
                      <p className="text-stone-500">
                        <strong>Obs.:</strong> {order.general_notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {canCreateEdit && (
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order, e.target.value)}
                        className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800"
                      >
                        {Object.entries(ORDER_STATUS_META).map(([key, meta]) => (
                          <option key={key} value={key}>
                            Status: {meta.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopySummary(order)}
                      className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                    >
                      {copiedId === order.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === order.id ? 'Copiado!' : 'Copiar Resumo'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {canCreateEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(order)}
                        className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                        title="Editar pedido"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(order)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                        title="Excluir pedido"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar Pedido */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Editar Pedido' : 'Anotar Novo Pedido'}
        subtitle="Preencha os contatos, sabores, detalhes de decoração e valores."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Selecionar cliente já cadastrado (opcional)
              </label>
              <select
                value={form.customer_id}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="input-field"
              >
                <option value="">-- Novo cliente ou preencher manualmente --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nome do cliente *</label>
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Telefone / WhatsApp *</label>
              <input
                type="text"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Data entrega / retirada *</label>
              <input
                type="date"
                value={form.delivery_date}
                onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Horário</label>
              <input
                type="time"
                value={form.delivery_time}
                onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Modalidade</label>
              <select
                value={form.delivery_type}
                onChange={(e) => setForm({ ...form, delivery_type: e.target.value })}
                className="input-field"
              >
                <option value="retirada">Retirada no local</option>
                <option value="entrega">Entrega</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Status do Pedido</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input-field"
              >
                {Object.entries(ORDER_STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Endereço de entrega / Referência</label>
              <input
                type="text"
                value={form.customer_address}
                onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                placeholder="Rua, número, bairro, ponto de referência..."
                className="input-field"
              />
            </div>
          </div>

          {/* Itens do pedido */}
          <div className="space-y-2 rounded-2xl border border-[#f0e4dc] bg-[#fffaf6] p-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-stone-800">Itens do Pedido</h4>
              <button type="button" onClick={addItemRow} className="btn-secondary px-3 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
              </button>
            </div>

            {form.items.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2 rounded-xl bg-white p-2 border border-stone-100">
                <div className="col-span-12 sm:col-span-4">
                  <select
                    value={row.recipe_id}
                    onChange={(e) => updateItemRow(idx, { recipe_id: e.target.value })}
                    className="input-field py-2 text-xs"
                  >
                    <option value="">Item avulso / personalizado</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({formatBRL(r.metrics?.effective_price)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <input
                    type="text"
                    value={row.item_name}
                    onChange={(e) => updateItemRow(idx, { item_name: e.target.value })}
                    placeholder="Nome do item"
                    className="input-field py-2 text-xs"
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    value={row.quantity}
                    onChange={(e) => updateItemRow(idx, { quantity: e.target.value })}
                    className="input-field py-2 text-xs"
                    title="Quantidade"
                  />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.unit_price}
                    onChange={(e) => updateItemRow(idx, { unit_price: e.target.value })}
                    className="input-field py-2 text-xs"
                    title="Preço unitário (R$)"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Detalhes criativos e observações */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Tema / Decoração / Dizeres</label>
              <textarea
                rows={2}
                value={form.theme_description}
                onChange={(e) => setForm({ ...form, theme_description: e.target.value })}
                placeholder="Cores, topo de bolo, frase escrita..."
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Sabores / Massa / Recheios</label>
              <textarea
                rows={2}
                value={form.flavor_notes}
                onChange={(e) => setForm({ ...form, flavor_notes: e.target.value })}
                placeholder="Massa de chocolate, recheio de ninho c/ morango..."
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Restrições / Alergias</label>
              <input
                type="text"
                value={form.allergy_notes}
                onChange={(e) => setForm({ ...form, allergy_notes: e.target.value })}
                placeholder="Ex: Sem amendoim, intolerância à lactose..."
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Observações gerais</label>
              <input
                type="text"
                value={form.general_notes}
                onChange={(e) => setForm({ ...form, general_notes: e.target.value })}
                placeholder="Combinar horário por WhatsApp..."
                className="input-field"
              />
            </div>
          </div>

          {/* Financeiro do pedido */}
          <div className="grid gap-3 rounded-2xl bg-berry-50 p-3.5 sm:grid-cols-4 border border-berry-100">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-700">Taxa Entrega (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={form.delivery_type !== 'entrega'}
                value={form.delivery_type === 'entrega' ? form.delivery_fee : 0}
                onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })}
                className="input-field py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-700">Desconto (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                className="input-field py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-700">Sinal / Entrada Pago (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.deposit_paid}
                onChange={(e) => setForm({ ...form, deposit_paid: e.target.value })}
                className="input-field py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-700">Forma de Pagamento</label>
              <select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                className="input-field py-2 text-xs"
              >
                <option value="Pix">Pix</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Cartão Débito">Cartão Débito</option>
                <option value="Cartão Crédito">Cartão Crédito</option>
                <option value="Transferência">Transferência</option>
              </select>
            </div>

            <div className="sm:col-span-4 flex flex-wrap items-center justify-between border-t border-berry-200/70 pt-2 text-xs">
              <span>
                Total do Pedido: <strong className="text-base text-berry-900">{formatBRL(formTotal)}</strong>
              </span>
              <span>
                Falta pagar:{' '}
                <strong className="text-stone-900">
                  {formatBRL(Math.max(0, formTotal - (Number(form.deposit_paid) || 0)))}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Pedido
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
