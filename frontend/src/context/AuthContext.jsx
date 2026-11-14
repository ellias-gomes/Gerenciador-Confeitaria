import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest, getToken, setToken } from '../lib/api';
import { startLiveSync, stopLiveSync } from '../lib/sync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setTeam(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data.user);
      setTeam(data.team || null);
      startLiveSync();
    } catch {
      setToken('');
      setUser(null);
      setTeam(null);
      stopLiveSync();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const applySession = (data) => {
    setToken(data.token);
    setUser(data.user);
    setTeam(data.team || null);
    stopLiveSync();
    startLiveSync();
  };

  const login = async (email, password) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    applySession(data);
    return data.user;
  };

  const register = async (payload) => {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: payload,
    });
    applySession(data);
    return data.user;
  };

  const createTeam = async (payload) => {
    const data = await apiRequest('/api/teams', {
      method: 'POST',
      body: payload,
    });
    applySession(data);
    return data;
  };

  const joinTeam = async (invite_code) => {
    const data = await apiRequest('/api/teams/join', {
      method: 'POST',
      body: { invite_code },
    });
    applySession(data);
    return data;
  };

  const logout = () => {
    setToken('');
    setUser(null);
    setTeam(null);
    stopLiveSync();
  };

  const hasRole = (...roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        team,
        setTeam,
        loading,
        login,
        register,
        createTeam,
        joinTeam,
        logout,
        refreshUser: loadSession,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
