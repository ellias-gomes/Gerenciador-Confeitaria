import { useEffect, useState } from 'react';
import { getApiBaseUrl, getToken } from './api';

const listeners = new Set();
let sharedEventSource = null;
let sharedStatus = 'disconnected';
const statusListeners = new Set();

function notifyStatus(status) {
  sharedStatus = status;
  statusListeners.forEach((fn) => fn(status));
}

export function startLiveSync() {
  const token = getToken();
  if (!token) return;

  if (sharedEventSource) {
    sharedEventSource.close();
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/events?token=${encodeURIComponent(token)}`;
  notifyStatus('connecting');

  const es = new EventSource(url);
  sharedEventSource = es;

  es.addEventListener('connected', () => {
    notifyStatus('connected');
  });

  es.addEventListener('sync', (event) => {
    try {
      const payload = JSON.parse(event.data);
      listeners.forEach((fn) => fn(payload));
    } catch {
      // ignora payload inválido
    }
  });

  es.onerror = () => {
    notifyStatus('reconnecting');
  };
}

export function stopLiveSync() {
  if (sharedEventSource) {
    sharedEventSource.close();
    sharedEventSource = null;
  }
  notifyStatus('disconnected');
}

export function useSyncStatus() {
  const [status, setStatus] = useState(sharedStatus);
  useEffect(() => {
    statusListeners.add(setStatus);
    return () => statusListeners.delete(setStatus);
  }, []);
  return status;
}

export function useLiveSync(resources, onSync) {
  useEffect(() => {
    const allowed = Array.isArray(resources) ? new Set(resources) : null;
    const handler = (payload) => {
      if (!allowed || allowed.has(payload.resource)) {
        onSync(payload);
      }
    };
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, [onSync, resources]);
}
