import type { ApiResponse } from '../types';
import { clearAuth } from './auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Cookie-based auth: credentials='include' sends HttpOnly cookies automatically
  // No Authorization header needed
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data: ApiResponse<T> = await response.json();

  if (data.code === 20001 || data.code === 20002) {
    clearAuth();
    window.location.href = '/login';
    throw new ApiError(data.code, '登录已过期，请重新登录');
  }

  if (data.code !== 0) {
    throw new ApiError(data.code, data.message);
  }

  return data.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
