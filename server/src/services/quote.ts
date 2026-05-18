// ============================================
// 慢富(SlowRich) - 行情数据业务逻辑
// ============================================

import { D1Database } from '@cloudflare/workers-types';
import { DailyQuote, ErrorCodes } from '../types';
import { paginate, error, success, isValidDate } from '../utils';

/**
 * 查询行情数据（分页）
 */
export async function listQuotes(
  db: D1Database,
  stockId: string,
  startDate: string,
  endDate: string,
  page: number = 1,
  pageSize: number = 20
) {
  if (!stockId) {
    return error(ErrorCodes.INVALID_PARAMS, '请指定股票');
  }
  if (!startDate || !endDate) {
    return error(ErrorCodes.INVALID_PARAMS, '请指定日期范围');
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return error(ErrorCodes.DATE_RANGE_INVALID, '日期格式无效');
  }

  const offset = (page - 1) * pageSize;

  // 查询总数
  const countResult = await db.prepare(
    'SELECT COUNT(*) as total FROM daily_quotes WHERE stock_id = ? AND trade_date >= ? AND trade_date <= ?'
  ).bind(stockId, startDate, endDate).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // 分页查询
  const listResult = await db.prepare(
    'SELECT * FROM daily_quotes WHERE stock_id = ? AND trade_date >= ? AND trade_date <= ? ORDER BY trade_date ASC LIMIT ? OFFSET ?'
  ).bind(stockId, startDate, endDate, pageSize, offset).all<DailyQuote>();

  return success({
    list: listResult.results || [],
    ...paginate(total, page, pageSize),
  });
}
