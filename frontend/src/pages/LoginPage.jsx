import React, { useState } from 'react';
import { CakeSlice, Wifi, Lock, Mail, User, Phone, Users, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ServerConfigModal from '../components/ServerConfigModal';
import { getApiBaseUrl } from '../lib/api';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [teamMode, setTeamMode] = useState('create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const payload = { name, email, phone, password };
        if (teamMode === 'create') {
          payload.team_name = teamName.trim() || `Confeitaria de ${name.trim().split(' ')[0] || 'Doces'}`;
        } else {
          payload.invite_code = inviteCode.trim().toUpperCase();
        }
        await register(payload);
      }
    } catch (err) {
      setError(err.message || 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#fffaf6] via-[#fff1f2] to-[#fef3c7] p-4">
      <div className="w-full max-w-md rounded-3xl border border-[#f0e4dc] bg-white p-6 shadow-xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-berry-700 text-white shadow-md">
            <CakeSlice className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-stone-900">Doce Gestão</h1>
          <p className="mt-1 text-xs text-stone-500">
            Confeitaria Artesanal • Web & Android Sincronizados
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`rounded-lg py-2 text-xs font-bold transition ${
              mode === 'login' ? 'bg-white text-berry-800 shadow-sm' : 'text-stone-600'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`rounded-lg py-2 text-xs font-bold transition ${
              mode === 'register' ? 'bg-white text-berry-800 shadow-sm' : 'text-stone-600'
            }`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {mode === 'register' && (
            <>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  Como deseja começar?
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTeamMode('create')}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                      teamMode === 'create'
                        ? 'bg-berry-700 text-white shadow-sm'
                        : 'bg-white text-stone-600 border border-stone-200'
                    }`}
                  >
                    Criar minha Equipe
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeamMode('join')}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                      teamMode === 'join'
                        ? 'bg-berry-700 text-white shadow-sm'
                        : 'bg-white text-stone-600 border border-stone-200'
                    }`}
                  >
                    Entrar com Convite
                  </button>
                </div>

                {teamMode === 'create' ? (
                  <div className="mt-2.5">
                    <label className="mb-1 block text-xs font-semibold text-stone-700">Nome da Confeitaria / Equipe</label>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="Ex: Atelier Doce Sabor"
                        className="input-field pl-10"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5">
                    <label className="mb-1 block text-xs font-semibold text-stone-700">Código de Convite</label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="Ex: DOCE-1A2B"
                        className="input-field pl-10 uppercase"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nome completo</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Maria da Silva"
                    className="input-field pl-10"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="input-field pl-10"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">E-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="input-field pl-10"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Senha</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input-field pl-10"
                minLength={6}
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Aguarde...' : mode === 'login' ? 'Acessar Confeitaria' : 'Cadastrar e Entrar'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="mt-3 text-center text-[11px] text-stone-500">
            {teamMode === 'create'
              ? 'Ao criar sua equipe você entra como Proprietária (Admin) com acesso completo e ganha um código para convidar colegas.'
              : 'Você entrará compartilhando estoques, receitas, pedidos e clientes da equipe convidada.'}
          </p>
        )}

        <div className="mt-5 border-t border-stone-100 pt-4 flex items-center justify-between gap-2 text-[11px] text-stone-500">
          <span className="truncate">Servidor: {getApiBaseUrl()}</span>
          <button
            type="button"
            onClick={() => setServerModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-berry-700 hover:underline"
          >
            <Wifi className="h-3.5 w-3.5" />
            Alterar IP
          </button>
        </div>
      </div>

      <ServerConfigModal open={serverModalOpen} onClose={() => setServerModalOpen(false)} />
    </div>
  );
}
