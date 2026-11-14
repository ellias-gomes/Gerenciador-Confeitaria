import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  BookOpen,
  ClipboardList,
  Calculator,
  Users,
  ShieldCheck,
  LogOut,
  Wifi,
  Menu,
  X,
  CakeSlice,
  ArrowLeftRight,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/format';
import { useSyncStatus } from '../lib/sync';
import ServerConfigModal from './ServerConfigModal';
import Modal from './Modal';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard, roles: ['admin', 'confeiteira', 'atendente', 'visualizador'] },
  { id: 'ingredients', label: 'Insumos & Preços', shortLabel: 'Insumos', icon: Package, roles: ['admin', 'confeiteira', 'atendente', 'visualizador'] },
  { id: 'recipes', label: 'Receitas', icon: BookOpen, roles: ['admin', 'confeiteira', 'atendente', 'visualizador'] },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList, roles: ['admin', 'confeiteira', 'atendente', 'visualizador'] },
  { id: 'planner', label: 'Calculadora', shortLabel: 'Calcular', icon: Calculator, roles: ['admin', 'confeiteira', 'atendente', 'visualizador'] },
  { id: 'customers', label: 'Clientes', icon: Users, roles: ['admin', 'confeiteira', 'atendente', 'visualizador'] },
  { id: 'admin', label: 'Equipe & Config.', shortLabel: 'Equipe', icon: ShieldCheck, roles: ['admin'] },
];

export default function Layout({ activeTab, onChangeTab, bakeryName, children }) {
  const { user, team, logout, hasRole, createTeam, joinTeam } = useAuth();
  const syncStatus = useSyncStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamTab, setTeamTab] = useState('join');
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [teamError, setTeamError] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(...item.roles));
  const primaryMobileItems = visibleItems.slice(0, 5);
  const roleMeta = ROLE_LABELS[user?.role] || ROLE_LABELS.visualizador;

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    setTeamError('');
    setTeamBusy(true);
    try {
      if (teamTab === 'create') {
        await createTeam({ name: newTeamName });
      } else {
        await joinTeam(inviteCode);
      }
      setTeamModalOpen(false);
      setNewTeamName('');
      setInviteCode('');
    } catch (err) {
      setTeamError(err.message || 'Não foi possível trocar de equipe.');
    } finally {
      setTeamBusy(false);
    }
  };

  const syncBadge =
    syncStatus === 'connected'
      ? { text: 'Sincronizado', dot: 'bg-emerald-500' }
      : syncStatus === 'reconnecting' || syncStatus === 'connecting'
      ? { text: 'Sincronizando...', dot: 'bg-amber-400 animate-pulse' }
      : { text: 'Offline', dot: 'bg-stone-400' };

  return (
    <div className="min-h-screen bg-[#fffaf6] pb-20 md:flex md:pb-0">
      {/* Sidebar Desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[#f0e4dc] bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-[#f0e4dc] px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-berry-700 text-white shadow-sm">
            <CakeSlice className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-stone-900">{bakeryName || 'Doce Gestão'}</h1>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
              <span className={`h-2 w-2 rounded-full ${syncBadge.dot}`} />
              <span>{syncBadge.text}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? 'bg-berry-700 text-white shadow-sm'
                    : 'text-stone-600 hover:bg-berry-50 hover:text-berry-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#f0e4dc] p-4 space-y-3">
          <div className="rounded-xl bg-[#fffaf6] p-3 border border-[#f0e4dc]">
            <p className="truncate text-xs font-bold text-stone-900">{user?.name}</p>
            <p className="truncate text-[11px] text-stone-500">{user?.email}</p>
            {team?.name && (
              <p className="mt-1 truncate text-[11px] font-medium text-stone-600">
                Equipe: <span className="font-semibold text-stone-800">{team.name}</span>
              </p>
            )}
            <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roleMeta.color}`}>
              {roleMeta.label}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTeamError('');
              setTeamModalOpen(true);
            }}
            className="btn-secondary w-full px-2.5 py-2 text-xs"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Criar / Trocar Equipe
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setServerModalOpen(true)}
              className="btn-secondary flex-1 px-2 py-2 text-xs"
              title="Configurar endereço do servidor"
            >
              <Wifi className="h-3.5 w-3.5" />
              Servidor
            </button>
            <button
              type="button"
              onClick={logout}
              className="btn-secondary px-3 py-2 text-xs text-rose-700 hover:bg-rose-50"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Top Header Mobile */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#f0e4dc] bg-white/95 px-4 py-3 backdrop-blur-sm md:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-berry-700 text-white">
              <CakeSlice className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-stone-900">{bakeryName || team?.name || 'Doce Gestão'}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
                <span className={`h-1.5 w-1.5 rounded-full ${syncBadge.dot}`} />
                <span>{syncBadge.text}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="rounded-xl border border-stone-200 p-2 text-stone-700"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="border-b border-[#f0e4dc] bg-white p-4 shadow-md md:hidden space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-[#fffaf6] p-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-stone-900">{user?.name}</p>
                {team?.name && <p className="truncate text-[11px] text-stone-500">Equipe: {team.name}</p>}
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roleMeta.color}`}>
                  {roleMeta.label}
                </span>
              </div>
              <button type="button" onClick={logout} className="btn-secondary shrink-0 px-3 py-1.5 text-xs text-rose-700">
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChangeTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                      activeTab === item.id ? 'bg-berry-700 text-white' : 'bg-stone-50 text-stone-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTeamError('');
                  setTeamModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-berry-50 px-3 py-2 text-xs font-semibold text-berry-900"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Criar / Trocar Equipe
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setServerModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
              >
                <Wifi className="h-4 w-4" />
                Configurar Servidor
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {user?.role === 'visualizador' && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <div className="flex items-start gap-2.5 min-w-0">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-bold">Modo Visualizador (somente leitura)</p>
                  <p className="text-[11px] text-amber-800">
                    Para adicionar ou editar insumos, receitas, pedidos e clientes, peça à administradora da equipe para liberar seu acesso, ou crie sua própria confeitaria.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTeamTab('create');
                  setTeamError('');
                  setTeamModalOpen(true);
                }}
                className="btn-secondary shrink-0 border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Criar / Trocar Equipe
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Bottom Navigation Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-[#f0e4dc] bg-white/95 px-1 py-1.5 backdrop-blur-sm md:hidden">
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold transition ${
                active ? 'text-berry-700' : 'text-stone-500'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'stroke-[2.5]' : ''}`} />
              <span>{item.shortLabel || item.label}</span>
            </button>
          );
        })}
      </nav>

      <ServerConfigModal
        open={serverModalOpen}
        onClose={() => setServerModalOpen(false)}
        onSaved={() => window.location.reload()}
      />

      <Modal open={teamModalOpen} onClose={() => setTeamModalOpen(false)} title="Minha Equipe" maxWidth="max-w-md">
        <div className="space-y-4 text-xs">
          {team && (
            <div className="rounded-xl border border-[#f0e4dc] bg-[#fffaf6] p-3">
              <p className="text-[11px] font-semibold text-stone-500">Equipe atual</p>
              <p className="text-sm font-bold text-stone-900">{team.name}</p>
              <p className="mt-0.5 text-[11px] text-stone-600">Seu cargo: {roleMeta.label}</p>
            </div>
          )}

          <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => {
                setTeamTab('join');
                setTeamError('');
              }}
              className={`rounded-lg py-2 text-xs font-bold transition ${
                teamTab === 'join' ? 'bg-white text-berry-800 shadow-sm' : 'text-stone-600'
              }`}
            >
              Entrar com Código
            </button>
            <button
              type="button"
              onClick={() => {
                setTeamTab('create');
                setTeamError('');
              }}
              className={`rounded-lg py-2 text-xs font-bold transition ${
                teamTab === 'create' ? 'bg-white text-berry-800 shadow-sm' : 'text-stone-600'
              }`}
            >
              Criar Nova Equipe
            </button>
          </div>

          <form onSubmit={handleTeamSubmit} className="space-y-3">
            {teamTab === 'join' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Código de Convite da Equipe</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Ex: DOCE-1A2B"
                  className="input-field uppercase"
                  required
                />
                <p className="mt-1 text-[11px] text-stone-500">
                  Peça o código para a proprietária/administradora na aba &quot;Equipe &amp; Config.&quot;.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nome da Nova Confeitaria / Equipe</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Ex: Atelier Sweet Cake"
                  className="input-field"
                  required
                />
                <p className="mt-1 text-[11px] text-stone-500">
                  Você se tornará Proprietária (Admin) desta equipe com dados próprios e um código para convidar outras pessoas.
                </p>
              </div>
            )}

            {teamError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {teamError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setTeamModalOpen(false)} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={teamBusy} className="btn-primary">
                {teamBusy ? 'Processando...' : teamTab === 'join' ? 'Entrar na Equipe' : 'Criar Equipe'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
