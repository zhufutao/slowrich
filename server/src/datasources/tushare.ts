// ============================================
// 慢富(SlowRich) - Tushare Pro HTTP数据源适配器
// 备用数据源：需Token，有积分限制
// ============================================

import { DailyQuote } from '../types';
import { generateId } from '../utils';

/**
 * 安全解析浮点数：NaN/null/undefined → 0
 * 注意：不用 || 因为 0 是合法值；不用 ?? 因为 NaN ?? 0 仍是 NaN
 */
function safeFloat(val: string | number | null | undefined): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 安全解析整数：NaN/null/undefined → 0
 */
function safeInt(val: string | number | null | undefined): number {
  const n = typeof val === 'number' ? val : parseInt(String(val ?? ''));
  return Number.isFinite(n) ? n : 0;
}

interface TushareDailyResponse {
  request_id: string;
  code: number;
  msg: string;
  data: {
    fields: string[];
    items: (string | number)[][];
  };
}

interface RawQuote {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amt: number;
  pct_chg: number;
  pre_close: number;
}

/**
 * Tushare市场代码映射
 */
function toTushareCode(code: string, market: string): string {
  return `${code}.${market === 'SH' ? 'SH' : market === 'SZ' ? 'SZ' : 'BJ'}`;
}

/**
 * 从Tushare Pro获取日K线数据
 */
export async function fetchDailyQuotesFromTushare(
  code: string,
  market: string,
  startDate: string,
  endDate: string,
  token: string
): Promise<{ data: RawQuote[]; source: string }> {
  const tsCode = toTushareCode(code, market);

  const response = await fetch('https://api.tushare.pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: 'daily',
      token,
      params: {
        ts_code: tsCode,
        start_date: startDate.replace(/-/g, ''),
        end_date: endDate.replace(/-/g, ''),
      },
      fields: 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount',
    }),
  });

  if (!response.ok) {
    throw new Error(`Tushare API请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as TushareDailyResponse;

  if (json.code !== 0 || !json.data?.items) {
    throw new Error(`Tushare API返回异常: ${json.msg}`);
  }

  const { fields, items } = json.data;
  const fieldIndex: Record<string, number> = {};
  fields.forEach((f, i) => { fieldIndex[f] = i; });

  const quotes: RawQuote[] = items.map(item => ({
    trade_date: formatTushareDate(String(item[fieldIndex.trade_date])),
    open: safeFloat(item[fieldIndex.open]),
    high: safeFloat(item[fieldIndex.high]),
    low: safeFloat(item[fieldIndex.low]),
    close: safeFloat(item[fieldIndex.close]),
    pre_close: safeFloat(item[fieldIndex.pre_close]),
    volume: Math.round(safeFloat(item[fieldIndex.vol]) * 100), // 手 → 股
    amt: safeFloat(item[fieldIndex.amount]) * 1000, // 千元 → 元
    pct_chg: safeFloat(item[fieldIndex.pct_chg]),
  })).reverse(); // Tushare默认降序，改为升序

  return { data: quotes, source: 'tushare' };
}

/**
 * Tushare日期格式转换: 20240102 → 2024-01-02
 */
function formatTushareDate(date: string): string {
  if (date.length === 8) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  return date;
}

/**
 * Tushare获取交易日历
 */
export async function fetchTradeCalendarFromTushare(
  year: number,
  token: string
): Promise<string[]> {
  const response = await fetch('https://api.tushare.pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: 'trade_cal',
      token,
      params: {
        exchange: 'SSE',
        start_date: `${year}0101`,
        end_date: `${year}1231`,
        is_open: '1',
      },
      fields: 'cal_date,is_open',
    }),
  });

  if (!response.ok) {
    throw new Error(`Tushare交易日历请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as any;
  if (json.code !== 0 || !json.data?.items) {
    throw new Error(`Tushare交易日历返回异常: ${json.msg}`);
  }

  return json.data.items
    .filter((item: any[]) => item[1] === '1')
    .map((item: any[]) => formatTushareDate(String(item[0])))
    .sort();
}
