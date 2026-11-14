import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Me, Platform } from '../shared/types';

export interface AppConfig {
  google: boolean;
  platforms: Record<Platform, 'live' | 'demo' | 'off'>;
  baseUrl: string;
}

interface AuthState {
  me: Me | null;
  config: AppConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await api<{ user: Me | null }>('/api/auth/me');
    setMe(r.user);
  }, []);

  useEffect(() => {
    Promise.all([refresh(), api<AppConfig>('/api/config').then(setConfig)]).finally(() => setLoading(false));
  }, [refresh]);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    setMe(null);
  };

  return <Ctx.Provider value={{ me, config, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** The public origin for share links: the configured base URL, falling back to this page's origin. */
export function useShareOrigin() {
  const { config } = useAuth();
  return config?.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : location.origin;
}
