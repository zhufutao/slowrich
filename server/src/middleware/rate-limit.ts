// ============================================
// 慢富(SlowRich) - 速率限制中间件
// 使用Cloudflare内置能力 + 简易KV计数器
// ============================================

import { Context, Next } from 'hono';
import { Env, ErrorCodes } from '../types';
import { error } from '../utils';

// 内存计数器（单Worker实例级别，冷启动重置）
const counters = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  windowMs: number;    // 时间窗口（毫秒）
  maxRequests: number; // 窗口内最大请求数
}

/**
 * 创建速率限制中间件
 */
export function rateLimit(config: RateLimitConfig) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // 使用IP + 用户ID作为限制键
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
    const user = c.get('user') as any;
    const key = user ? `${ip}:${user.id}` : ip;

    const now = Date.now();
    const record = counters.get(key);

    if (!record || now > record.resetAt) {
      counters.set(key, { count: 1, resetAt: now + config.windowMs });
    } else {
      record.count++;
      if (record.count > config.maxRequests) {
        return c.json(
          error(ErrorCodes.RATE_LIMITED, '请求频率超限，请稍后重试'),
          429
        );
      }
    }

    await next();
  };
}

// 预配置的限制器
export const loginLimiter = rateLimit({ windowMs: 60_000, maxRequests: 5 });       // 5次/分钟
export const registerLimiter = rateLimit({ windowMs: 3600_000, maxRequests: 3 });  // 3次/小时
export const backtestLimiter = rateLimit({ windowMs: 60_000, maxRequests: 3 });    // 3次/分钟
export const apiLimiter = rateLimit({ windowMs: 60_000, maxRequests: 60 });        // 60次/分钟

/**
 * CSRF Token验证中间件
 * 对POST/PUT/DELETE请求验证CSRF Token
 */
export async function csrfMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return next();
  }

  const csrfTokenHeader = c.req.header('X-CSRF-Token');
  const csrfTokenCookie = getCookie(c, 'csrf_token');

  if (!csrfTokenHeader || !csrfTokenCookie || csrfTokenHeader !== csrfTokenCookie) {
    return c.json(error(ErrorCodes.FORBIDDEN, 'CSRF验证失败'), 403);
  }

  await next();
}

/**
 * 生成CSRF Token并设置Cookie
 */
export function setCsrfCookie(c: Context<{ Bindings: Env }>, token: string) {
  const isDev = c.env.ENVIRONMENT === 'development';
  const secureFlag = isDev ? '' : '; Secure';
  // csrf_token不设HttpOnly，前端需要读取
  c.header('Set-Cookie', 
    `csrf_token=${token};${secureFlag}; SameSite=Lax; Path=/api; Max-Age=604800`,
    { append: true }
  );
}

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
