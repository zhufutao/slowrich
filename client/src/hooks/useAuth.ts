import { useState, useCallback, useEffect } from 'react';
import type { User } from '../types';
import { getUser, setUser, clearAuth } from '../utils/auth';
import { api } from '../utils/api';

export function useAuth() {
  const [user, setUserState] = useState<User | null>(getUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!getUser();

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ user: User; must_change_password?: boolean }>('/auth/login', { email, password });
      // Cookie-based: token set by backend Set-Cookie
      setUser(data.user);
      setUserState(data.user);
      return { ...data.user, must_change_password: data.must_change_password } as User & { must_change_password: boolean };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, confirm_password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ user: User; token: string }>('/auth/register', { email, password, confirm_password });
      // Cookie-based: token set by backend Set-Cookie
      setUser(data.user);
      setUserState(data.user);
      return data.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '注册失败';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    clearAuth();
    setUserState(null);
  }, []);

  const changePassword = useCallback(async (old_password: string, new_password: string, confirm_password: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.put('/auth/password', { old_password, new_password, confirm_password });
      // After password change, refresh user info
      const freshUser = await api.get<User>('/auth/me');
      setUser(freshUser);
      setUserState(freshUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '修改密码失败';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    if (!getUser()) return;
    try {
      const freshUser = await api.get<User>('/auth/me');
      setUser(freshUser);
      setUserState(freshUser);
    } catch {
      clearAuth();
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    if (getUser() && !user) {
      checkAuth();
    }
  }, []);

  return {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    register,
    logout,
    changePassword,
    checkAuth,
    isAdmin: user?.role === 'admin',
  };
}
