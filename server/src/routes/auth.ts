// ============================================
// 慢富(SlowRich) - 认证路由
// /api/v1/auth/*
// ============================================

import { Hono } from 'hono';
import { Env, JWTPayload } from '../types';
import { authMiddleware } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rate-limit';
import {
  registerUser, loginUser, refreshAccessToken,
  changePassword, logoutUser, getCurrentUser
} from '../services/auth';
import { setAuthCookies, clearAuthCookies, verifyRefreshToken } from '../middleware/auth';
import { getCookie } from '../utils';

const auth = new Hono<{ Bindings: Env }>();

// POST /api/v1/auth/register - 用户注册
auth.post('/register', registerLimiter, async (c) => {
  const body = await c.req.json();
  const result = await registerUser(c.env.DB, body.email, body.password, body.confirm_password);

  if (result.code !== 0) {
    return c.json(result, 400);
  }

  // 注册成功后自动登录
  const loginResult = await loginUser(
    c.env.DB, body.email, body.password,
    c.env.JWT_SECRET, c.env.REFRESH_TOKEN_SECRET
  );

  if (loginResult.code !== 0) {
    return c.json(loginResult, 400);
  }

  const data = loginResult.data as any;
  setAuthCookies(c, data.access_token, data.refresh_token);

  return c.json({
    code: 0,
    message: 'success',
    data: {
      user: data.user,
      must_change_password: false,
    },
  }, 201);
});

// POST /api/v1/auth/login - 用户登录
auth.post('/login', loginLimiter, async (c) => {
  const body = await c.req.json();
  const result = await loginUser(
    c.env.DB, body.email, body.password,
    c.env.JWT_SECRET, c.env.REFRESH_TOKEN_SECRET
  );

  if (result.code !== 0 && result.code !== 20006) {
    const status = result.code === 20004 ? 401 : 403;
    return c.json(result, status);
  }

  const data = result.data as any;
  setAuthCookies(c, data.access_token, data.refresh_token);

  // 如果需要强制修改密码，返回特殊响应
  if (data.must_change_password) {
    return c.json({
      code: 20006,
      message: '请修改初始密码',
      data: {
        user: data.user,
        must_change_password: true,
      },
    }, 200);
  }

  return c.json({
    code: 0,
    message: 'success',
    data: { user: data.user },
  });
});

// POST /api/v1/auth/logout - 用户登出
auth.post('/logout', authMiddleware, async (c) => {
  const refreshToken = getCookieFromReq(c, 'refresh_token');
  const user = c.get('user') as JWTPayload;
  await logoutUser(c.env.DB, refreshToken, user?.id);
  clearAuthCookies(c);
  return c.json({ code: 0, message: 'success', data: null });
});

// POST /api/v1/auth/refresh - 刷新AccessToken
auth.post('/refresh', async (c) => {
  const refreshToken = getCookieFromReq(c, 'refresh_token');
  if (!refreshToken) {
    return c.json({ code: 20001, message: '未登录', data: null }, 401);
  }

  const result = await refreshAccessToken(
    c.env.DB, refreshToken,
    c.env.JWT_SECRET, c.env.REFRESH_TOKEN_SECRET
  );

  if (result.code !== 0) {
    clearAuthCookies(c);
    return c.json(result, 401);
  }

  const data = result.data as any;
  // 设置新AccessToken Cookie
  const isDev = c.env.ENVIRONMENT === 'development';
  const secureFlag = isDev ? '' : '; Secure';
  const sameSite = isDev ? 'Lax' : 'Strict';
  c.header('Set-Cookie',
    `access_token=${data.access_token}; HttpOnly;${secureFlag}; SameSite=${sameSite}; Path=/api; Max-Age=1800`
  );

  return c.json(result);
});

// PUT /api/v1/auth/password - 修改密码
auth.put('/password', authMiddleware, async (c) => {
  const body = await c.req.json();
  const user = c.get('user') as JWTPayload;
  const result = await changePassword(
    c.env.DB, user.id, body.old_password, body.new_password
  );

  if (result.code !== 0) {
    return c.json(result, 400);
  }

  clearAuthCookies(c);
  return c.json(result);
});

// GET /api/v1/auth/me - 获取当前用户信息
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  const result = await getCurrentUser(c.env.DB, user.id);
  return c.json(result);
});

function getCookieFromReq(c: any, name: string): string | undefined {
  const cookieHeader = c.req.header('Cookie') || '';
  const cookies = cookieHeader.split(';').map(s => s.trim());
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=');
    if (key.trim() === name) {
      return valueParts.join('=').trim();
    }
  }
  return undefined;
}

export default auth;
