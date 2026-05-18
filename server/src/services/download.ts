// ============================================
// 慢富(SlowRich) - 数据下载引擎
// 断点续传、分批写入、进度追踪
// ============================================

import { D1Database } from '@cloudflare/workers-types';
import { DownloadTask, Stock, DailyQuote, ErrorCodes } from '../types';
import { generateId, nowISO, isValidDate, paginate, error, success } from '../utils';
import { fetchDailyQuotes, fetchTradeCalendar } from '../datasources/adapter';

/**
 * 创建下载任务
 */
export async function createDownloadTask(
  db: D1Database,
  stockId: string,
  startDate: string,
  endDate: string,
  dataSource: string,
  userId: string
) {
  // 参数校验
  if (!stockId || !startDate || !endDate) {
    return error(ErrorCodes.INVALID_PARAMS, '请填写股票、起始日期和结束日期');
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return error(ErrorCodes.DATE_RANGE_INVALID, '日期格式无效');
  }
  if (startDate > endDate) {
    return error(ErrorCodes.DATE_RANGE_INVALID, '结束日期不能早于起始日期');
  }

  // 检查时间区间 ≤ 5年
  const start = new Date(startDate);
  const end = new Date(endDate);
  const yearDiff = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (yearDiff > 5) {
    return error(ErrorCodes.DATE_RANGE_INVALID, '时间区间不能超过5年');
  }

  // 验证股票存在
  const stock = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(stockId).first<Stock>();
  if (!stock) {
    return error(ErrorCodes.STOCK_NOT_FOUND, '股票不存在');
  }

  // 创建任务
  const taskId = generateId('dt');
  const now = nowISO();
  await db.prepare(
    `INSERT INTO download_tasks (id, stock_id, start_date, end_date, data_source, status, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(taskId, stockId, startDate, endDate, dataSource, userId, now, now).run();

  return success({
    id: taskId,
    stock_id: stockId,
    stock_name: stock.name,
    start_date: startDate,
    end_date: endDate,
    data_source: dataSource,
    status: 'pending',
    progress: 0,
    created_at: now,
  }, '下载任务已创建');
}

/**
 * 执行下载任务（由Worker异步调用）
 */
export async function executeDownloadTask(
  db: D1Database,
  taskId: string,
  tushareToken?: string
): Promise<void> {
  // 获取任务信息
  const task = await db.prepare('SELECT * FROM download_tasks WHERE id = ?').bind(taskId).first<DownloadTask>();
  if (!task || task.status === 'completed') return;

  // 获取股票信息
  const stock = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(task.stock_id).first<Stock>();
  if (!stock) {
    await updateTaskError(db, taskId, '股票不存在', 'STOCK_CODE_INVALID');
    return;
  }

  // 更新任务状态为running
  await db.prepare(
    "UPDATE download_tasks SET status = 'running', updated_at = ? WHERE id = ?"
  ).bind(nowISO(), taskId).run();

  try {
    // 确定下载的起始日期（支持断点续传）
    let downloadStart = task.start_date;
    if (task.last_downloaded_date) {
      // 从最后下载日期的下一天开始
      const nextDate = new Date(task.last_downloaded_date + 'T00:00:00Z');
      nextDate.setDate(nextDate.getDate() + 1);
      downloadStart = nextDate.toISOString().slice(0, 10);
    }

    // 获取交易日历
    const years = new Set<number>();
    const sy = new Date(downloadStart).getFullYear();
    const ey = new Date(task.end_date).getFullYear();
    for (let y = sy; y <= ey; y++) years.add(y);

    let tradeDates: string[] = [];
    for (const year of years) {
      const yearDates = await fetchTradeCalendar(year, tushareToken);
      tradeDates = tradeDates.concat(yearDates);
    }
    tradeDates = tradeDates
      .filter(d => d >= downloadStart && d <= task.end_date)
      .sort();

    const totalDays = tradeDates.length;
    if (totalDays === 0) {
      await db.prepare(
        "UPDATE download_tasks SET status = 'completed', progress = 100, updated_at = ? WHERE id = ?"
      ).bind(nowISO(), taskId).run();
      return;
    }

    // 更新总天数
    await db.prepare(
      'UPDATE download_tasks SET total_days = ?, updated_at = ? WHERE id = ?'
    ).bind(totalDays, nowISO(), taskId).run();

    // 获取行情数据
    const result = await fetchDailyQuotes(
      stock.code, stock.market,
      downloadStart, task.end_date,
      task.data_source as any,
      tushareToken
    );

    if (result.error || result.quotes.length === 0) {
      await updateTaskError(db, taskId, result.error || '未获取到数据', result.errorCode || 'DATA_SOURCE_UNAVAILABLE');
      return;
    }

    // 分批写入D1（每批100条，D1事务限制）
    const batchSize = 100;
    let downloadedDays = task.downloaded_days ?? 0;

    for (let i = 0; i < result.quotes.length; i += batchSize) {
      const batch = result.quotes.slice(i, i + batchSize);

      // 构建批量INSERT
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values: any[] = [];

      for (const q of batch) {
        const qWithStock = { ...q, stock_id: task.stock_id };
        const now = nowISO();
        values.push(
          qWithStock.id, qWithStock.stock_id, qWithStock.trade_date,
          qWithStock.open, qWithStock.high, qWithStock.low, qWithStock.close,
          qWithStock.pre_close, qWithStock.pct_chg, qWithStock.volume, qWithStock.amt,
          now
        );
      }

      await db.prepare(
        `INSERT OR REPLACE INTO daily_quotes (id, stock_id, trade_date, open, high, low, close, pre_close, pct_chg, volume, amt, created_at) VALUES ${placeholders}`
      ).bind(...values).run();

      downloadedDays += batch.length;
      const progress = Math.min(Math.round((downloadedDays / totalDays) * 100), 100);
      const lastDate = batch[batch.length - 1].trade_date;

      // 更新进度
      await db.prepare(
        'UPDATE download_tasks SET progress = ?, downloaded_days = ?, last_downloaded_date = ?, actual_source = ?, updated_at = ? WHERE id = ?'
      ).bind(progress, downloadedDays, lastDate, result.source, nowISO(), taskId).run();
    }

    // 标记完成，并记录主备切换信息
    const completionMsg = result.fallback
      ? `主数据源(东方财富)不可用，已自动切换至备用数据源(Tushare)。原因: ${result.fallbackReason}`
      : null;
    await db.prepare(
      "UPDATE download_tasks SET status = 'completed', progress = 100, actual_source = ?, error_msg = ?, updated_at = ? WHERE id = ?"
    ).bind(result.source, completionMsg, nowISO(), taskId).run();

    // 保存交易日历到D1
    await saveTradeCalendar(db, years);

  } catch (e: any) {
    console.error(`下载任务执行失败: ${e.message}`);
    const isPartial = (task.downloaded_days ?? 0) > 0;
    await db.prepare(
      `UPDATE download_tasks SET status = ?, error_msg = ?, error_code = ?, updated_at = ? WHERE id = ?`
    ).bind(
      isPartial ? 'partial' : 'failed',
      e.message.substring(0, 500),
      classifyError(e.message),
      nowISO(),
      taskId
    ).run();
  }
}

/**
 * 获取下载任务列表
 */
export async function listDownloadTasks(
  db: D1Database,
  page: number = 1,
  pageSize: number = 20,
  status?: string,
  userId?: string
) {
  const offset = (page - 1) * pageSize;
  let countSql = 'SELECT COUNT(*) as total FROM download_tasks';
  let listSql = `SELECT dt.*, s.name as stock_name FROM download_tasks dt LEFT JOIN stocks s ON dt.stock_id = s.id`;
  const bindings: any[] = [];
  const conditions: string[] = [];

  if (status) {
    conditions.push('dt.status = ?');
    bindings.push(status);
  }
  if (userId) {
    conditions.push('dt.user_id = ?');
    bindings.push(userId);
  }

  if (conditions.length > 0) {
    const where = ' WHERE ' + conditions.join(' AND ');
    countSql += where;
    listSql += where;
  }

  listSql += ' ORDER BY dt.created_at DESC LIMIT ? OFFSET ?';

  const countResult = await db.prepare(countSql).bind(...bindings).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const listResult = await db.prepare(listSql).bind(...bindings, pageSize, offset).all();

  return success({
    list: listResult.results || [],
    ...paginate(total, page, pageSize),
  });
}

/**
 * 获取单个下载任务
 */
export async function getDownloadTask(db: D1Database, taskId: string) {
  const task = await db.prepare(
    `SELECT dt.*, s.name as stock_name FROM download_tasks dt LEFT JOIN stocks s ON dt.stock_id = s.id WHERE dt.id = ?`
  ).bind(taskId).first();

  if (!task) {
    return error(ErrorCodes.TASK_NOT_FOUND, '下载任务不存在');
  }
  return success(task);
}

/**
 * 断点续传
 */
export async function resumeDownloadTask(
  db: D1Database,
  taskId: string,
  dataSource: string,
  tushareToken?: string
) {
  const task = await db.prepare('SELECT * FROM download_tasks WHERE id = ?').bind(taskId).first<DownloadTask>();
  if (!task) {
    return error(ErrorCodes.TASK_NOT_FOUND, '下载任务不存在');
  }

  if (task.status !== 'failed' && task.status !== 'partial') {
    return error(ErrorCodes.INVALID_PARAMS, '只能续传失败或部分完成的任务');
  }

  // 重置状态
  await db.prepare(
    "UPDATE download_tasks SET status = 'pending', data_source = ?, error_msg = NULL, error_code = NULL, updated_at = ? WHERE id = ?"
  ).bind(dataSource, nowISO(), taskId).run();

  // 异步执行续传
  executeDownloadTask(db, taskId, tushareToken).catch(e => {
    console.error(`续传执行异常: ${e.message}`);
  });

  return success({
    id: taskId,
    status: 'running',
    resume_from: task.last_downloaded_date,
  }, '续传已启动');
}

/**
 * 重试下载
 */
export async function retryDownloadTask(
  db: D1Database,
  taskId: string,
  dataSource: string,
  tushareToken?: string
) {
  const task = await db.prepare('SELECT * FROM download_tasks WHERE id = ?').bind(taskId).first<DownloadTask>();
  if (!task) {
    return error(ErrorCodes.TASK_NOT_FOUND, '下载任务不存在');
  }

  if (task.status !== 'failed') {
    return error(ErrorCodes.INVALID_PARAMS, '只能重试失败的任务');
  }

  // 重置任务
  await db.prepare(
    `UPDATE download_tasks SET status = 'pending', data_source = ?, progress = 0, downloaded_days = 0,
     last_downloaded_date = NULL, error_msg = NULL, error_code = NULL, updated_at = ? WHERE id = ?`
  ).bind(dataSource, nowISO(), taskId).run();

  // 异步执行
  executeDownloadTask(db, taskId, tushareToken).catch(e => {
    console.error(`重试执行异常: ${e.message}`);
  });

  return success({ id: taskId, status: 'running' }, '重试已启动');
}

// --- Helper functions ---

async function updateTaskError(db: D1Database, taskId: string, errorMsg: string, errorCode: string) {
  await db.prepare(
    "UPDATE download_tasks SET status = 'failed', error_msg = ?, error_code = ?, updated_at = ? WHERE id = ?"
  ).bind(errorMsg.substring(0, 500), errorCode, nowISO(), taskId).run();
}

function classifyError(message: string): string {
  if (message.includes('429') || message.includes('频率')) return 'RATE_LIMITED';
  if (message.includes('退市') || message.includes('无效')) return 'STOCK_CODE_INVALID';
  if (message.includes('timeout') || message.includes('ECONNREFUSED')) return 'NETWORK_ERROR';
  return 'DATA_SOURCE_UNAVAILABLE';
}

async function saveTradeCalendar(db: D1Database, years: Set<number>) {
  for (const year of years) {
    // 检查是否已有该年数据
    const existing = await db.prepare(
      'SELECT COUNT(*) as cnt FROM trade_calendar WHERE year = ?'
    ).bind(year).first<{ cnt: number }>();

    if (existing && existing.cnt > 0) continue;

    const dates = await fetchTradeCalendar(year);
    if (dates.length === 0) continue;

    const batchSize = 100;
    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, 1, ?, ?)').join(', ');
      const values: any[] = [];
      for (const d of batch) {
        const [y, m] = d.split('-').map(Number);
        values.push(d, y, m);
      }
      await db.prepare(
        `INSERT OR IGNORE INTO trade_calendar (trade_date, is_open, year, month) VALUES ${placeholders}`
      ).bind(...values).run();
    }
  }
}
