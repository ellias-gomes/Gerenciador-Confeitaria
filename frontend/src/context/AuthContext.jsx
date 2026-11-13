import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest, getToken, setToken } from '../lib/api';
import { startLiveSync, stopLiveSync } from '../lib/sync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data.user);
      startLiveSync();
    } catch {
      setToken('');
      setUser(null);
      stopLiveSync();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email, password) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(data.token);
    setUser(data.user);
    startLiveSync();
    return data.user;
  };

  const register = async (payload) => {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: payload,
    });
    setToken(data.token);
    setUser(data.user);
    startLiveSync();
    return data.user;
  };

  const logout = () => {
    setToken('');
    setUser(null);
    stopLiveSync();
  };

  const hasRole = (...roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser: loadSession, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
