import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MeResponse } from '@aism/core';
import { apiRequest, onUnauthorized, setCsrfToken } from '../lib/api';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  me: MeResponse | null;
  setupAvailable: boolean;
  login(email: string, password: string): Promise<void>;
  setup(input: { setupToken: string; email: string; password: string; name?: string }): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [setupAvailable, setSetupAvailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const state = await apiRequest<{ setupAvailable: boolean }>('/api/auth/state');
      setSetupAvailable(state.setupAvailable);
      try {
        const session = await apiRequest<MeResponse>('/api/auth/me');
        setCsrfToken(session.session.csrfToken);
        setMe(session);
        setStatus('authenticated');
      } catch {
        setCsrfToken(null);
        setMe(null);
        setStatus('anonymous');
      }
    } catch {
      setCsrfToken(null);
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onUnauthorized(() => {
        setCsrfToken(null);
        setMe(null);
        setStatus('anonymous');
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiRequest<MeResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setCsrfToken(session.session.csrfToken);
    setMe(session);
    setStatus('authenticated');
    setSetupAvailable(false);
  }, []);

  const setup = useCallback(
    async (input: { setupToken: string; email: string; password: string; name?: string }) => {
      const session = await apiRequest<MeResponse>('/api/auth/setup', {
        method: 'POST',
        body: input,
      });
      setCsrfToken(session.session.csrfToken);
      setMe(session);
      setStatus('authenticated');
      setSetupAvailable(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken(null);
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, setupAvailable, login, setup, logout, refresh }),
    [status, me, setupAvailable, login, setup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
