// ============================================
// 慢富(SlowRich) - 工具函数
// ============================================

import { ErrorCodes, ApiResponse } from '../types';

/**
 * 生成唯一ID，格式: prefix_randomstring
 */
export function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${id}`;
}

/**
 * 构建成功响应
 */
export function success<T>(data: T, message = 'success'): ApiResponse<T> {
  return { code: ErrorCodes.SUCCESS, message, data };
}

/**
 * 构建错误响应
 */
export function error(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

/**
 * 计算分页信息
 */
export function paginate(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  };
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 验证密码强度：至少8位，含字母和数字
 */
export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

/**
 * 验证股票代码格式
 */
export function isValidStockCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * 验证日期格式 YYYY-MM-DD
 */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

/**
 * 获取当前ISO时间字符串
 */
export function nowISO(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * 生成策略键
 */
export function strategyKey(dipThreshold: number, sellStrategy: string): string {
  return `dip_${dipThreshold}_${sellStrategy}`;
}

/**
 * 生成卖出策略标签
 */
export function sellStrategyLabel(sellStrategy: string): string {
  if (sellStrategy === 'next_day_close') return '次日收盘卖出';
  const pct = sellStrategy.replace('profit_take_', '');
  return `浮盈${pct}%卖出`;
}

/**
 * 判断市场环境
 */
export function getMarketEnv(yearPctChg: number): string {
  if (yearPctChg > 20) return '牛市';
  if (yearPctChg < -20) return '熊市';
  return '震荡市';
}

/**
 * 判断温度等级
 */
export function getTemperatureLevel(value: number): string {
  if (value <= 20) return '极冷';
  if (value <= 40) return '冷';
  if (value <= 60) return '适中';
  if (value <= 80) return '热';
  return '极热';
}

/**
 * 延时函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全的JSON解析
 */
export function safeJsonParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
