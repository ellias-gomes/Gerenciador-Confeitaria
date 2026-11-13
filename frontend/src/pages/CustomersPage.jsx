import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, MessageCircle, MapPin, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { buildWhatsappUrl, formatBRL, formatDateBR } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLiveSync } from '../lib/sync';
import Modal from '../components/Modal';

const EMPTY_CUSTOMER = {
  name: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  neighborhood: '',
  reference_point: '',
  notes: '',
};

export default function CustomersPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'confeiteira', 'atendente');
  const canDelete = hasRole('admin', 'confeiteira');

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_CUSTOMER);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await apiRequest('/api/customers');
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useLiveSync(['customers', 'orders'], loadCustomers);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_CUSTOMER);
    setFormOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone,
      whatsapp: c.whatsapp || '',
      email: c.email || '',
      address: c.address || '',
      neighborhood: c.neighborhood || '',
      reference_point: c.reference_point || '',
      notes: c.notes || '',
    });
    setFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiRequest(`/api/customers/${editingId}`, { method: 'PUT', body: form });
      } else {
        await apiRequest('/api/customers', { method: 'POST', body: form });
      }
      setFormOpen(false);
      loadCustomers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Excluir cliente "${c.name}"?`)) return;
    try {
      await apiRequest(`/api/customers/${c.id}`, { method: 'DELETE' });
      loadCustomers();
    } catch (err) {
      setError(err.message);
    }
  };

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.neighborhood || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">Clientes & Contatos</h2>
          <p className="text-xs text-stone-500 sm:text-sm">
            Caderno digital de contatos com endereço, preferências e histórico de encomendas.
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo Cliente
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nome, telefone ou bairro..."
            className="input-field pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-stone-500">Carregando clientes...</div>
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-stone-500">Nenhum cliente encontrado.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="card flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900">{c.name}</h3>
                    <a
                      href={buildWhatsappUrl(c.whatsapp || c.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {c.phone}
                    </a>
                  </div>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">
                    {c.orders_count || 0} pedido(s)
                  </span>
                </div>

                {(c.address || c.neighborhood) && (
                  <p className="mt-2 flex items-start gap-1 text-xs text-stone-600">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <span>
                      {[c.address, c.neighborhood, c.reference_point].filter(Boolean).join(' • ')}
                    </span>
                  </p>
                )}

                {c.notes && (
                  <p className="mt-2 rounded-xl bg-[#fffaf6] p-2 text-xs text-stone-600 border border-[#f3e8e2]">
                    {c.notes}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-stone-100 pt-2.5 text-xs">
                <div className="text-stone-500">
                  Total comprado: <strong className="text-stone-900">{formatBRL(c.total_spent)}</strong>
                  {c.last_order_date && <span className="block text-[10px]">Último: {formatDateBR(c.last_order_date)}</span>}
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDelete(c)} className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Editar Cliente' : 'Cadastrar Cliente'}
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nome completo *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Telefone / WhatsApp *</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Bairro</label>
              <input
                type="text"
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Endereço</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Ponto de referência</label>
              <input
                type="text"
                value={form.reference_point}
                onChange={(e) => setForm({ ...form, reference_point: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-700">Preferências / Observações</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Cliente
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
