import type { User } from '../types';

const USER_KEY = 'slowerich_user';

// Cookie-based auth: no token stored in localStorage
// Login/refresh handled by backend Set-Cookie automatically
export function getToken(): string | null {
  // Token is in HttpOnly Cookie, not accessible via JS
  // Return a placeholder to indicate "has session" for route guards
  return getUser() ? 'cookie-based' : null;
}

export function setToken(_token: string): void {
  // No-op: token is set by backend via Set-Cookie header
}

export function removeToken(): void {
  // No-op: token is cleared by backend logout endpoint via Set-Cookie with expired date
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function isAdmin(): boolean {
  const user = getUser();
  return user?.role === 'admin';
}

export function isLoggedIn(): boolean {
  return !!getUser();
}

export function clearAuth(): void {
  removeUser();
}
