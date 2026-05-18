// ============================================
// 慢富(SlowRich) - JWT认证 + 管理员权限中间件
// HttpOnly Cookie方案，消除XSS风险
// ============================================

import { Context, Next } from 'hono';
import { Env, JWTPayload, ErrorCodes } from '../types';
import { error } from '../utils';

// JWT简易实现（Workers环境无node:crypto的createVerify，使用Web Crypto API）

/**
 * Base64URL编码
 */
function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

/**
 * 使用Web Crypto API签名JWT
 */
async function signJWT(payload: JWTPayload, secret: string, expiresInSec: number): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + expiresInSec };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const message = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signatureB64 = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${message}.${signatureB64}`;
}

/**
 * 使用Web Crypto API验证JWT
 */
async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const message = `${headerB64}.${payloadB64}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureStr = base64UrlDecode(signatureB64);
    const signatureBytes = new Uint8Array(signatureStr.length);
    for (let i = 0; i < signatureStr.length; i++) {
      signatureBytes[i] = signatureStr.charCodeAt(i);
    }

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(message)
    );

    if (!valid) return null;

    const claims = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) return null;

    return {
      id: claims.id,
      email: claims.email,
      role: claims.role,
    };
  } catch {
    return null;
  }
}

/**
 * 生成AccessToken（30分钟有效）
 */
export async function generateAccessToken(payload: JWTPayload, secret: string): Promise<string> {
  return signJWT(payload, secret, 30 * 60);
}

/**
 * 生成RefreshToken（7天有效）
 */
export async function generateRefreshToken(payload: JWTPayload, secret: string): Promise<string> {
  return signJWT(payload, secret, 7 * 24 * 60 * 60);
}

/**
 * 验证AccessToken
 */
export async function verifyAccessToken(token: string, secret: string): Promise<JWTPayload | null> {
  return verifyJWT(token, secret);
}

/**
 * 验证RefreshToken
 */
export async function verifyRefreshToken(token: string, secret: string): Promise<JWTPayload | null> {
  return verifyJWT(token, secret);
}

/**
 * Hash RefreshToken用于存储（SHA-256）
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 认证中间件 - 从HttpOnly Cookie获取AccessToken
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const token = getCookie(c, 'access_token');

  if (!token) {
    return c.json(error(ErrorCodes.UNAUTHORIZED, '未登录'), 401);
  }

  const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
  if (!payload) {
    // Token过期或无效，尝试refresh
    return c.json(error(ErrorCodes.TOKEN_EXPIRED, 'Token已过期'), 401);
  }

  // 检查账号是否被锁定
  const user = await c.env.DB.prepare(
    'SELECT locked_until FROM users WHERE id = ?'
  ).bind(payload.id).first<{ locked_until: string | null }>();

  if (user?.locked_until) {
    const lockedUntil = new Date(user.locked_until + 'Z').getTime();
    if (lockedUntil > Date.now()) {
      return c.json(error(ErrorCodes.ACCOUNT_LOCKED, '账号已锁定，请稍后重试'), 403);
    }
  }

  c.set('user', payload);
  await next();
}

/**
 * 管理员权限中间件
 */
export async function adminMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user') as JWTPayload | undefined;
  if (!user || user.role !== 'admin') {
    return c.json(error(ErrorCodes.FORBIDDEN, '权限不足'), 403);
  }
  await next();
}

/**
 * 设置认证Cookie
 */
export function setAuthCookies(
  c: Context<{ Bindings: Env }>,
  accessToken: string,
  refreshToken: string
) {
  const isDev = c.env.ENVIRONMENT === 'development';
  const secureFlag = isDev ? '' : '; Secure';
  const sameSite = isDev ? 'Lax' : 'None';

  // AccessToken: 30分钟, Path=/api
  c.header('Set-Cookie', [
    `access_token=${accessToken}; HttpOnly;${secureFlag}; SameSite=${sameSite}; Path=/api; Max-Age=1800`,
    `refresh_token=${refreshToken}; HttpOnly;${secureFlag}; SameSite=${sameSite}; Path=/api/auth/refresh; Max-Age=604800`,
  ].join(', '));
}

/**
 * 清除认证Cookie
 */
export function clearAuthCookies(c: Context<{ Bindings: Env }>) {
  const isDev = c.env.ENVIRONMENT === 'development';
  const secureFlag = isDev ? '' : '; Secure';
  const sameSite = isDev ? 'Lax' : 'None';

  c.header('Set-Cookie', [
    `access_token=; HttpOnly;${secureFlag}; SameSite=${sameSite}; Path=/api; Max-Age=0`,
    `refresh_token=; HttpOnly;${secureFlag}; SameSite=${sameSite}; Path=/api/auth/refresh; Max-Age=0`,
  ].join(', '));
}

/**
 * 从Cookie中获取值
 */
function getCookie(c: Context, name: string): string | undefined {
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
