import React, { useState } from 'react';
import { Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import { getApiBaseUrl, getSavedServerUrl, saveServerUrl, testServerConnection } from '../lib/api';

export default function ServerConfigModal({ open, onClose, onSaved }) {
  const [url, setUrl] = useState(getSavedServerUrl() || getApiBaseUrl());
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await testServerConnection(url);
      setStatus({ ok: true, message: `Conectado com sucesso: ${res.bakery_name}` });
    } catch (err) {
      setStatus({ ok: false, message: err.message || 'Falha ao conectar nesse endereço.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveServerUrl(url);
    if (onSaved) onSaved();
    onClose();
  };

  const handleReset = () => {
    saveServerUrl('');
    setUrl(getApiBaseUrl());
    setStatus({ ok: true, message: 'Endereço restaurado para o padrão.' });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Conexão com o Servidor"
      subtitle="Para sincronizar Web e App Android usando os mesmos dados em tempo real"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div className="rounded-xl bg-amber-50 p-3.5 text-xs text-amber-900">
          <p className="font-semibold">Como conectar o celular Android ao computador:</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>No computador, rode <code>./iniciar.sh 8080</code>.</li>
            <li>Copie o endereço <strong>Rede/Android</strong> exibido no terminal (ex.: <code>http://192.168.1.15:8080</code>).</li>
            <li>Garanta que o celular está no mesmo Wi-Fi e informe esse endereço abaixo.</li>
          </ol>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-700">
            Endereço da API / Servidor
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.15:8080"
              className="input-field"
              required
            />
            <button type="button" onClick={handleTest} disabled={testing} className="btn-secondary shrink-0">
              <Wifi className="h-4 w-4" />
              {testing ? 'Testando...' : 'Testar'}
            </button>
          </div>
        </div>

        {status && (
          <div
            className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium ${
              status.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
            }`}
          >
            {status.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{status.message}</span>
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <button type="button" onClick={handleReset} className="btn-secondary text-xs">
            Usar Padrão
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Conexão
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
