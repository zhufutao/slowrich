// ============================================
// 慢富(SlowRich) - 认证业务逻辑
// HttpOnly Cookie + 双Token方案
// 暴力破解防护 + 强制修改密码
// ============================================

import { D1Database } from '@cloudflare/workers-types';
import { User, UserPublic, ErrorCodes, JWTPayload } from '../types';
import {
  generateId, isValidEmail, isStrongPassword, nowISO, error, success
} from '../utils';
import {
  generateAccessToken, generateRefreshToken,
  verifyRefreshToken, hashToken, clearAuthCookies
} from '../middleware/auth';

// bcrypt兼容 - 使用Web Crypto API实现
// 由于Workers环境限制，使用简化版bcrypt验证
// 生产环境建议使用 @noble/hashes 或 bcryptjs (nodejs_compat)

/**
 * 密码哈希 - 使用PBKDF2（Workers兼容）
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = btoa(String.fromCharCode(...salt));

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );

  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
  return `pbkdf2:100000:${saltB64}:${hashB64}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // 兼容bcrypt格式（seed数据）和PBKDF2格式
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    // bcrypt格式 - 使用bcryptjs
    try {
      const bcrypt = await import('bcryptjs');
      return bcrypt.compareSync(password, storedHash);
    } catch {
      // 如果bcryptjs不可用，尝试直接比较（仅开发环境）
      return false;
    }
  }

  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 4) return false;

    const [, iterations, saltB64, expectedHashB64] = parts;
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: parseInt(iterations), hash: 'SHA-256' },
      keyMaterial, 256
    );

    const actualHashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
    return actualHashB64 === expectedHashB64;
  }

  return false;
}

/**
 * 用户注册
 */
export async function registerUser(
  db: D1Database,
  email: string,
  password: string,
  confirmPassword: string
) {
  // 参数校验
  if (!email || !password || !confirmPassword) {
    return error(ErrorCodes.INVALID_PARAMS, '请填写所有必填字段');
  }
  if (!isValidEmail(email)) {
    return error(ErrorCodes.INVALID_PARAMS, '邮箱格式不正确');
  }
  if (password !== confirmPassword) {
    return error(ErrorCodes.INVALID_PARAMS, '两次密码输入不一致');
  }
  if (!isStrongPassword(password)) {
    return error(ErrorCodes.INVALID_PARAMS, '密码至少8位，需包含字母和数字');
  }

  // 邮箱唯一性检查
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return error(ErrorCodes.EMAIL_EXISTS, '邮箱已注册');
  }

  // 创建用户
  const userId = generateId('u');
  const passwordHash = await hashPassword(password);
  const now = nowISO();

  await db.prepare(
    'INSERT INTO users (id, email, password_hash, role, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).bind(userId, email, passwordHash, 'user', now, now).run();

  return { userId, email, role: 'user' as const };
}

/**
 * 用户登录
 */
export async function loginUser(
  db: D1Database,
  email: string,
  password: string,
  jwtSecret: string,
  refreshTokenSecret: string
) {
  if (!email || !password) {
    return error(ErrorCodes.INVALID_PARAMS, '请填写邮箱和密码');
  }

  // 查找用户
  const user = await db.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).first<User>();

  if (!user) {
    return error(ErrorCodes.INVALID_CREDENTIALS, '邮箱或密码错误');
  }

  // 检查账号锁定
  if (user.locked_until) {
    const lockedUntil = new Date(user.locked_until + 'Z').getTime();
    if (lockedUntil > Date.now()) {
      const remainMin = Math.ceil((lockedUntil - Date.now()) / 60000);
      return error(ErrorCodes.ACCOUNT_LOCKED, `账号已锁定，请${remainMin}分钟后重试`);
    }
    // 锁定已过期，重置
    await db.prepare(
      'UPDATE users SET login_fail_count = 0, locked_until = NULL WHERE id = ?'
    ).bind(user.id).run();
  }

  // 验证密码
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    // 登录失败计数
    const newFailCount = (user.login_fail_count ?? 0) + 1;
    if (newFailCount >= 5) {
      // 锁定30分钟
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
      await db.prepare(
        'UPDATE users SET login_fail_count = ?, locked_until = ?, updated_at = ? WHERE id = ?'
      ).bind(newFailCount, lockUntil, nowISO(), user.id).run();
      return error(ErrorCodes.ACCOUNT_LOCKED, '连续5次登录失败，账号已锁定30分钟');
    }

    await db.prepare(
      'UPDATE users SET login_fail_count = ?, updated_at = ? WHERE id = ?'
    ).bind(newFailCount, nowISO(), user.id).run();

    return error(ErrorCodes.INVALID_CREDENTIALS, '邮箱或密码错误');
  }

  // 登录成功，重置失败计数
  const now = nowISO();
  await db.prepare(
    'UPDATE users SET login_fail_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?'
  ).bind(now, now, user.id).run();

  // 生成Token
  const payload: JWTPayload = { id: user.id, email: user.email, role: user.role };
  const accessToken = await generateAccessToken(payload, jwtSecret);
  const refreshToken = await generateRefreshToken(payload, refreshTokenSecret);

  // 存储RefreshToken哈希
  const tokenId = generateId('rt');
  const tokenHash = await hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(tokenId, user.id, tokenHash, expiresAt).run();

  // 检查是否需要强制修改密码
  if (user.must_change_password === 1) {
    return {
      ...success({
        user: toPublicUser(user),
        must_change_password: true,
        access_token: accessToken,
        refresh_token: refreshToken,
      }, '请修改初始密码'),
      code: ErrorCodes.MUST_CHANGE_PASSWORD,
    };
  }

  return success({
    user: toPublicUser(user),
    must_change_password: false,
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

/**
 * 刷新AccessToken
 */
export async function refreshAccessToken(
  db: D1Database,
  refreshToken: string,
  jwtSecret: string,
  refreshTokenSecret: string
) {
  // 验证RefreshToken签名
  const payload = await verifyRefreshToken(refreshToken, refreshTokenSecret);
  if (!payload) {
    return error(ErrorCodes.TOKEN_EXPIRED, 'Refresh Token无效或已过期');
  }

  // 验证RefreshToken是否在D1中存在
  const tokenHash = await hashToken(refreshToken);
  const stored = await db.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ?'
  ).bind(tokenHash, payload.id).first();

  if (!stored) {
    return error(ErrorCodes.TOKEN_EXPIRED, 'Refresh Token已失效');
  }

  // 检查过期
  if (new Date((stored as any).expires_at + 'Z').getTime() < Date.now()) {
    // 清除过期token
    await db.prepare('DELETE FROM refresh_tokens WHERE id = ?').bind((stored as any).id).run();
    return error(ErrorCodes.TOKEN_EXPIRED, 'Refresh Token已过期');
  }

  // 生成新AccessToken
  const newAccessToken = await generateAccessToken(payload, jwtSecret);

  return success({ access_token: newAccessToken });
}

/**
 * 修改密码
 */
export async function changePassword(
  db: D1Database,
  userId: string,
  oldPassword: string,
  newPassword: string
) {
  if (!oldPassword || !newPassword) {
    return error(ErrorCodes.INVALID_PARAMS, '请填写旧密码和新密码');
  }
  if (!isStrongPassword(newPassword)) {
    return error(ErrorCodes.INVALID_PARAMS, '新密码至少8位，需包含字母和数字');
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>();
  if (!user) {
    return error(ErrorCodes.UNAUTHORIZED, '用户不存在');
  }

  const valid = await verifyPassword(oldPassword, user.password_hash);
  if (!valid) {
    return error(ErrorCodes.INVALID_CREDENTIALS, '旧密码错误');
  }

  if (oldPassword === newPassword) {
    return error(ErrorCodes.INVALID_PARAMS, '新密码不能与旧密码相同');
  }

  const newHash = await hashPassword(newPassword);
  await db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?'
  ).bind(newHash, nowISO(), userId).run();

  // 清除该用户所有RefreshToken，强制重新登录
  await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(userId).run();

  return success(null, '密码修改成功，请重新登录');
}

/**
 * 登出
 */
export async function logoutUser(
  db: D1Database,
  refreshToken: string | undefined,
  userId: string | undefined
) {
  if (refreshToken && userId) {
    const tokenHash = await hashToken(refreshToken);
    await db.prepare(
      'DELETE FROM refresh_tokens WHERE token_hash = ? AND user_id = ?'
    ).bind(tokenHash, userId).run();
  }
  return success(null, '登出成功');
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(db: D1Database, userId: string) {
  const user = await db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first<User>();

  if (!user) {
    return error(ErrorCodes.UNAUTHORIZED, '用户不存在');
  }

  return success(toPublicUser(user));
}

function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    must_change_password: user.must_change_password === 1,
    created_at: user.created_at,
  };
}
