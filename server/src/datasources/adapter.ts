// ============================================
// 慢富(SlowRich) - 统一DataAdapter层
// 字段映射 + 主备切换 + 错误处理
// ============================================

import { DailyQuote, ErrorCodes } from '../types';
import { fetchDailyQuotesFromEastMoney, rawQuoteToDailyQuote } from './eastmoney';
import { fetchDailyQuotesFromTushare } from './tushare';
import { generateId, nowISO, error, success } from '../utils';

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

export interface FetchResult {
  quotes: Omit<DailyQuote, 'created_at'>[];
  source: string;
  error?: string;
  errorCode?: string;
  fallback?: boolean;       // 是否发生了主备切换
  fallbackFrom?: string;    // 切换前使用的数据源
  fallbackReason?: string;  // 切换原因
}

/**
 * 统一数据获取接口 - 支持主备自动切换
 * 主数据源：东方财富HTTP API
 * 备数据源：Tushare Pro HTTP API
 */
export async function fetchDailyQuotes(
  code: string,
  market: string,
  startDate: string,
  endDate: string,
  preferSource: 'auto' | 'eastmoney' | 'tushare' = 'auto',
  tushareToken?: string
): Promise<FetchResult> {
  const tryEastMoney = preferSource !== 'tushare';
  const tryTushare = preferSource !== 'eastmoney' && tushareToken;

  // 主数据源：东方财富
  let eastMoneyError: string | null = null;
  if (tryEastMoney) {
    try {
      const result = await fetchWithRetry(
        () => fetchDailyQuotesFromEastMoney(code, market, startDate, endDate),
        3 // 最多重试3次
      );

      const quotes = result.data.map(q => rawQuoteToDailyQuote(q, '')); // stock_id后续填充
      return { quotes, source: result.source };
    } catch (e: any) {
      eastMoneyError = e.message;
      console.error(`[DataAdapter] 东方财富数据源失败: ${e.message}`);

      // 如果指定了只用东方财富，直接返回错误
      if (preferSource === 'eastmoney') {
        return {
          quotes: [],
          source: 'eastmoney',
          error: e.message,
          errorCode: 'DATA_SOURCE_UNAVAILABLE',
        };
      }

      // 否则尝试备用数据源
      console.warn(`[DataAdapter] 主数据源(东方财富)失败，自动切换至备用数据源(Tushare)`);
    }
  }

  // 备用数据源：Tushare
  if (tryTushare && tushareToken) {
    try {
      const result = await fetchWithRetry(
        () => fetchDailyQuotesFromTushare(code, market, startDate, endDate, tushareToken),
        3
      );

      const quotes = result.data.map(q => ({
        id: generateId('dq'),
        stock_id: '',
        trade_date: q.trade_date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        pre_close: q.pre_close,
        pct_chg: q.pct_chg,
        volume: q.volume,
        amt: q.amt,
      }));

      // 标记发生了主备切换
      console.info(`[DataAdapter] 已切换至备用数据源(Tushare)，原数据源(东方财富)失败原因: ${eastMoneyError}`);
      return {
        quotes,
        source: result.source,
        fallback: true,
        fallbackFrom: 'eastmoney',
        fallbackReason: eastMoneyError || 'unknown',
      };
    } catch (e: any) {
      console.error(`[DataAdapter] Tushare数据源也失败: ${e.message}`);
      return {
        quotes: [],
        source: 'tushare',
        error: e.message,
        errorCode: classifyError(e.message),
      };
    }
  }

  return {
    quotes: [],
    source: 'none',
    error: '所有数据源不可用',
    errorCode: 'DATA_SOURCE_UNAVAILABLE',
  };
}

/**
 * 带重试的fetch封装（指数退避）
 */
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * 错误分类
 */
function classifyError(message: string): string {
  if (message.includes('429') || message.includes('频率')) {
    return 'RATE_LIMITED';
  }
  if (message.includes('退市') || message.includes('无效')) {
    return 'STOCK_CODE_INVALID';
  }
  if (message.includes('网络') || message.includes('timeout') || message.includes('ECONNREFUSED')) {
    return 'NETWORK_ERROR';
  }
  return 'DATA_SOURCE_UNAVAILABLE';
}

/**
 * 获取交易日历
 */
export async function fetchTradeCalendar(
  year: number,
  tushareToken?: string
): Promise<string[]> {
  // 优先从东方财富获取
  try {
    const { fetchTradeCalendarFromEastMoney } = await import('./eastmoney');
    return await fetchTradeCalendarFromEastMoney(year);
  } catch (e) {
    console.error(`东方财富交易日历获取失败: ${(e as Error).message}`);
  }

  // 备用：Tushare
  if (tushareToken) {
    try {
      const { fetchTradeCalendarFromTushare } = await import('./tushare');
      return await fetchTradeCalendarFromTushare(year, tushareToken);
    } catch (e) {
      console.error(`Tushare交易日历获取失败: ${(e as Error).message}`);
    }
  }

  // 最终降级：基于周末判断（不包含法定节假日）
  console.warn('交易日历数据源不可用，使用周末排除法（不精确）');
  return generateSimpleCalendar(year);
}

/**
 * 简易日历生成（仅排除周末，不含法定节假日）
 */
function generateSimpleCalendar(year: number): string[] {
  const dates: string[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  while (start <= end) {
    const day = start.getDay();
    if (day !== 0 && day !== 6) { // 非周末
      dates.push(start.toISOString().slice(0, 10));
    }
    start.setDate(start.getDate() + 1);
  }

  return dates;
}
