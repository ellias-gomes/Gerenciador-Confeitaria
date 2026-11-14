import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Copy,
  RefreshCw,
  Pencil,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ROLE_LABELS } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLiveSync } from '../lib/sync';
import Modal from '../components/Modal';

export default function AdminPage({ onSettingsSaved }) {
  const { user: currentUser, setTeam: setAuthTeam } = useAuth();
  const [users, setUsers] = useState([]);
  const [team, setTeam] = useState(null);
  const [teamJoinRole, setTeamJoinRole] = useState('confeiteira');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const [settings, setSettings] = useState({
    bakery_name: '',
    labor_hour_rate: '22.00',
    default_indirect_cost_pct: '10',
    default_profit_margin_pct: '40',
    card_fee_pct: '3.5',
    daily_order_limit: '8',
    whatsapp_greeting: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'confeiteira',
  });

  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'confeiteira',
    password: '',
    active: true,
  });

  const loadData = useCallback(async () => {
    try {
      const [uRes, sRes, tRes] = await Promise.all([
        apiRequest('/api/users'),
        apiRequest('/api/settings'),
        apiRequest('/api/teams/current'),
      ]);
      setUsers(uRes.users || []);
      setSettings((prev) => ({ ...prev, ...(sRes.settings || {}) }));
      if (tRes?.team) {
        setTeam(tRes.team);
        setTeamNameInput(tRes.team.name || '');
        setTeamJoinRole(tRes.team.default_join_role || 'confeiteira');
        if (setAuthTeam) setAuthTeam(tRes.team);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [setAuthTeam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useLiveSync(['users', 'settings', 'teams'], loadData);

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/api/teams/current', {
        method: 'PUT',
        body: {
          name: teamNameInput,
          default_join_role: teamJoinRole,
        },
      });
      setTeam(res.team);
      if (setAuthTeam) setAuthTeam(res.team);
      setSuccess('Configurações da equipe atualizadas!');
      if (onSettingsSaved) onSettingsSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRegenerateInvite = async () => {
    if (!window.confirm('Gerar um novo código de convite? O código anterior deixará de funcionar.')) return;
    setError('');
    try {
      const res = await apiRequest('/api/teams/current', {
        method: 'PUT',
        body: { regenerate_code: true },
      });
      setTeam(res.team);
      if (setAuthTeam) setAuthTeam(res.team);
      setSuccess('Novo código de convite gerado!');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyInvite = async () => {
    if (!team?.invite_code) return;
    try {
      await navigator.clipboard.writeText(team.invite_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignora erro de clipboard
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await apiRequest('/api/settings', { method: 'PUT', body: settings });
      setSuccess('Parâmetros da confeitaria salvos com sucesso!');
      if (onSettingsSaved) onSettingsSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/users', { method: 'POST', body: newUser });
      setNewUserOpen(false);
      setNewUser({ name: '', email: '', phone: '', password: '', role: 'confeiteira' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateUserRole = async (u, role) => {
    setError('');
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'PUT', body: { role } });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (u) => {
    setError('');
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'PUT', body: { active: !u.active } });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setEditUserForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'visualizador',
      password: '',
      active: Boolean(u.active),
    });
  };

  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: editUserForm.name,
        email: editUserForm.email,
        phone: editUserForm.phone,
        role: editUserForm.role,
        active: editUserForm.active,
      };
      if (editUserForm.password.trim()) {
        payload.password = editUserForm.password.trim();
      }
      await apiRequest(`/api/users/${editingUser.id}`, { method: 'PUT', body: payload });
      setEditingUser(null);
      setSuccess('Integrante atualizado com sucesso!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Remover o usuário ${u.name}?`)) return;
    try {
      await apiRequest(`/api/users/${u.id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">Equipe, Acessos & Parâmetros</h2>
          <p className="text-xs text-stone-500 sm:text-sm">
            Compartilhe os dados da confeitaria com sua equipe e defina o que cada integrante pode fazer.
          </p>
        </div>
        <button type="button" onClick={() => setNewUserOpen(true)} className="btn-primary">
          <UserPlus className="h-4 w-4" />
          Novo Integrante
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Compartilhamento e Código de Convite da Equipe */}
      {team && (
        <form onSubmit={handleSaveTeam} className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <Users className="h-4 w-4 text-berry-700" />
              Compartilhamento da Equipe
            </h3>
            <span className="rounded-full bg-berry-50 px-2.5 py-1 text-[11px] font-semibold text-berry-800">
              {team.members_count || users.length} membro(s)
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nome da Equipe</label>
              <input
                type="text"
                value={teamNameInput}
                onChange={(e) => setTeamNameInput(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Nível ao entrar com convite
              </label>
              <select
                value={teamJoinRole}
                onChange={(e) => setTeamJoinRole(e.target.value)}
                className="input-field"
              >
                <option value="confeiteira">Confeiteira (Produção e Estoque)</option>
                <option value="atendente">Atendente (Pedidos e Clientes)</option>
                <option value="visualizador">Visualizador (Somente Leitura)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Código de Convite</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl border border-berry-200 bg-berry-50/60 px-3 py-2.5 font-mono text-sm font-extrabold tracking-wider text-berry-900">
                  {team.invite_code}
                </div>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="btn-secondary shrink-0 px-3 py-2.5 text-xs"
                  title="Copiar código"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedCode ? 'Copiado!' : 'Copiar'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateInvite}
                  className="btn-secondary shrink-0 px-2.5 py-2.5 text-xs"
                  title="Gerar novo código"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-xl bg-stone-50 p-3 text-[11px] text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="font-bold text-berry-800">Proprietária (Admin):</span> acesso total, equipe e configurações.
            </div>
            <div>
              <span className="font-bold text-amber-800">Confeiteira:</span> cria/edita insumos, estoques, receitas, pedidos e clientes.
            </div>
            <div>
              <span className="font-bold text-sky-800">Atendente:</span> cria/edita pedidos, clientes e simulações.
            </div>
            <div>
              <span className="font-bold text-stone-800">Visualizador:</span> apenas consulta dados sem alterar.
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-secondary text-xs font-semibold">
              <Save className="h-3.5 w-3.5" />
              Salvar Dados da Equipe
            </button>
          </div>
        </form>
      )}

      {/* Equipe */}
      <div className="card space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
          <ShieldCheck className="h-4 w-4 text-berry-700" />
          Integrantes da Equipe ({users.length})
        </h3>

        <div className="divide-y divide-stone-100">
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            const roleMeta = ROLE_LABELS[u.role] || ROLE_LABELS.visualizador;

            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">{u.name}</span>
                    {isSelf && <span className="rounded-full bg-berry-50 px-2 py-0.5 text-[10px] font-bold text-berry-700">Você</span>}
                    {!u.active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Inativo</span>}
                  </div>
                  <p className="text-stone-500">{u.email} {u.phone ? `• ${u.phone}` : ''}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={u.role}
                    disabled={isSelf}
                    onChange={(e) => handleUpdateUserRole(u, e.target.value)}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${roleMeta.color}`}
                  >
                    <option value="admin">Proprietária (Admin)</option>
                    <option value="confeiteira">Confeiteira (Produção)</option>
                    <option value="atendente">Atendente (Vendas)</option>
                    <option value="visualizador">Visualizador (Consulta)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => openEditUser(u)}
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>

                  {!isSelf && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        className="btn-secondary px-2.5 py-1.5 text-xs"
                      >
                        {u.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                        title="Excluir usuário"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Parâmetros Financeiros */}
      <form onSubmit={handleSaveSettings} className="card space-y-4">
        <h3 className="text-sm font-bold text-stone-900">Parâmetros de Precificação da Confeitaria</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nome da Confeitaria</label>
            <input
              type="text"
              value={settings.bakery_name}
              onChange={(e) => setSettings({ ...settings, bakery_name: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Valor da hora trabalhada (R$)</label>
            <input
              type="number"
              step="0.5"
              value={settings.labor_hour_rate}
              onChange={(e) => setSettings({ ...settings, labor_hour_rate: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Gás / Luz / Perdas padrão (%)</label>
            <input
              type="number"
              step="0.5"
              value={settings.default_indirect_cost_pct}
              onChange={(e) => setSettings({ ...settings, default_indirect_cost_pct: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Margem de lucro padrão (%)</label>
            <input
              type="number"
              step="1"
              value={settings.default_profit_margin_pct}
              onChange={(e) => setSettings({ ...settings, default_profit_margin_pct: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Taxa média cartão / maquininha (%)</label>
            <input
              type="number"
              step="0.1"
              value={settings.card_fee_pct}
              onChange={(e) => setSettings({ ...settings, card_fee_pct: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Limite diário sugerido de pedidos</label>
            <input
              type="number"
              value={settings.daily_order_limit}
              onChange={(e) => setSettings({ ...settings, daily_order_limit: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-stone-700">Saudação padrão do resumo WhatsApp</label>
            <input
              type="text"
              value={settings.whatsapp_greeting}
              onChange={(e) => setSettings({ ...settings, whatsapp_greeting: e.target.value })}
              className="input-field"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary">
            <Save className="h-4 w-4" />
            Salvar Parâmetros
          </button>
        </div>
      </form>

      <Modal open={newUserOpen} onClose={() => setNewUserOpen(false)} title="Cadastrar Novo Integrante" maxWidth="max-w-lg">
        <form onSubmit={handleCreateUser} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nome *</label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">E-mail *</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Telefone</label>
            <input
              type="text"
              value={newUser.phone}
              onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nível de Acesso *</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="input-field"
            >
              <option value="admin">Proprietária (Admin - Acesso Total)</option>
              <option value="confeiteira">Confeiteira (Receitas, Preços, Pedidos e Compras)</option>
              <option value="atendente">Atendente (Pedidos e Clientes)</option>
              <option value="visualizador">Visualizador (Somente Leitura)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Senha inicial *</label>
            <input
              type="password"
              minLength={6}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setNewUserOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Criar Usuário
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editingUser)} onClose={() => setEditingUser(null)} title="Editar Integrante" maxWidth="max-w-lg">
        <form onSubmit={handleSaveEditUser} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nome *</label>
            <input
              type="text"
              value={editUserForm.name}
              onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">E-mail *</label>
            <input
              type="email"
              value={editUserForm.email}
              onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Telefone</label>
            <input
              type="text"
              value={editUserForm.phone}
              onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nível de Acesso *</label>
            <select
              value={editUserForm.role}
              disabled={editingUser?.id === currentUser?.id}
              onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
              className="input-field"
            >
              <option value="admin">Proprietária (Admin - Acesso Total)</option>
              <option value="confeiteira">Confeiteira (Receitas, Preços, Estoque e Pedidos)</option>
              <option value="atendente">Atendente (Pedidos e Clientes)</option>
              <option value="visualizador">Visualizador (Somente Leitura)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nova senha (opcional)</label>
            <input
              type="password"
              minLength={6}
              value={editUserForm.password}
              onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
              placeholder="Deixe vazio para manter a senha atual"
              className="input-field"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Alterações
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
