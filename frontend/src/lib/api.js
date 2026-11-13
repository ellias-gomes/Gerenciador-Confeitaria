import { Capacitor } from '@capacitor/core';

const STORAGE_SERVER_KEY = 'confeitaria_server_url';
const STORAGE_TOKEN_KEY = 'confeitaria_auth_token';

export function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getSavedServerUrl() {
  return localStorage.getItem(STORAGE_SERVER_KEY) || '';
}

export function saveServerUrl(url) {
  const cleaned = String(url || '').trim().replace(/\/+$/, '');
  if (cleaned) {
    localStorage.setItem(STORAGE_SERVER_KEY, cleaned);
  } else {
    localStorage.removeItem(STORAGE_SERVER_KEY);
  }
  return cleaned;
}

export function getApiBaseUrl() {
  const saved = getSavedServerUrl();
  if (saved) return saved;
  if (isNativeAndroid()) {
    return 'http://10.0.2.2:8080';
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}

export function getToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  }
}

export async function apiRequest(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const token = getToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
  } catch {
    throw new Error(
      `Não foi possível conectar ao servidor (${baseUrl}). Verifique se o sistema foi iniciado com ./iniciar.sh e se o endereço está correto.`
    );
  }

  let data = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Resposta inesperada do servidor.' };
  }

  if (!response.ok) {
    const err = new Error(data?.error || `Erro ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return data;
}

export async function testServerConnection(customUrl) {
  const target = String(customUrl || getApiBaseUrl()).trim().replace(/\/+$/, '');
  const response = await fetch(`${target}/api/health`);
  if (!response.ok) {
    throw new Error('Servidor respondeu com erro.');
  }
  return response.json();
}
