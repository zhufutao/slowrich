// ============================================
// 慢富(SlowRich) - 股票业务逻辑
// ============================================

import { D1Database } from '@cloudflare/workers-types';
import { Stock, ErrorCodes } from '../types';
import { generateId, isValidStockCode, nowISO, paginate, error, success } from '../utils';

/**
 * 获取股票列表（分页+搜索）
 */
export async function listStocks(
  db: D1Database,
  page: number = 1,
  pageSize: number = 20,
  search?: string
) {
  const offset = (page - 1) * pageSize;
  let countSql = 'SELECT COUNT(*) as total FROM stocks';
  let listSql = 'SELECT * FROM stocks';
  const bindings: any[] = [];

  if (search) {
    countSql += ' WHERE code LIKE ? OR name LIKE ?';
    listSql += ' WHERE code LIKE ? OR name LIKE ?';
    bindings.push(`%${search}%`, `%${search}%`);
  }

  listSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const countResult = await db.prepare(countSql).bind(...bindings).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const listResult = await db.prepare(listSql).bind(...bindings, pageSize, offset).all<Stock>();

  return success({
    list: listResult.results || [],
    ...paginate(total, page, pageSize),
  });
}

/**
 * 获取单个股票详情
 */
export async function getStock(db: D1Database, id: string) {
  const stock = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(id).first<Stock>();
  if (!stock) {
    return error(ErrorCodes.STOCK_NOT_FOUND, '股票不存在');
  }
  return success(stock);
}

/**
 * 新增股票
 */
export async function createStock(
  db: D1Database,
  code: string,
  name: string,
  market: string,
  createdBy: string
) {
  // 参数校验
  if (!code || !name || !market) {
    return error(ErrorCodes.INVALID_PARAMS, '请填写股票代码、名称和市场');
  }
  if (!isValidStockCode(code)) {
    return error(ErrorCodes.STOCK_CODE_INVALID, '股票代码格式无效，应为6位数字');
  }
  if (!['SH', 'SZ', 'BJ'].includes(market)) {
    return error(ErrorCodes.INVALID_PARAMS, '市场应为SH/SZ/BJ');
  }

  // 唯一性检查
  const existing = await db.prepare('SELECT id FROM stocks WHERE code = ?').bind(code).first();
  if (existing) {
    return error(ErrorCodes.STOCK_EXISTS, '股票代码已存在');
  }

  const id = generateId('s');
  const now = nowISO();
  await db.prepare(
    'INSERT INTO stocks (id, code, name, market, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, code, name, market, createdBy, now, now).run();

  return success({
    id, code, name, market, created_by: createdBy, created_at: now, updated_at: now,
  }, '创建成功');
}

/**
 * 修改股票
 */
export async function updateStock(
  db: D1Database,
  id: string,
  name?: string,
  market?: string
) {
  const stock = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(id).first<Stock>();
  if (!stock) {
    return error(ErrorCodes.STOCK_NOT_FOUND, '股票不存在');
  }

  const updates: string[] = [];
  const bindings: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    bindings.push(name);
  }
  if (market !== undefined) {
    if (!['SH', 'SZ', 'BJ'].includes(market)) {
      return error(ErrorCodes.INVALID_PARAMS, '市场应为SH/SZ/BJ');
    }
    updates.push('market = ?');
    bindings.push(market);
  }

  if (updates.length === 0) {
    return error(ErrorCodes.INVALID_PARAMS, '无更新内容');
  }

  updates.push('updated_at = ?');
  bindings.push(nowISO());
  bindings.push(id);

  await db.prepare(
    `UPDATE stocks SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const updated = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(id).first<Stock>();
  return success(updated);
}

/**
 * 删除股票
 */
export async function deleteStock(db: D1Database, id: string) {
  const stock = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(id).first<Stock>();
  if (!stock) {
    return error(ErrorCodes.STOCK_NOT_FOUND, '股票不存在');
  }

  // CASCADE会自动删除关联的daily_quotes
  await db.prepare('DELETE FROM stocks WHERE id = ?').bind(id).run();
  return success(null, '删除成功');
}
