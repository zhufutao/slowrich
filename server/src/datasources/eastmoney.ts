// ============================================
// 慢富(SlowRich) - 东方财富HTTP数据源适配器
// 主数据源：免费、无需认证、JSON格式
// ============================================

import { DailyQuote } from '../types';
import { generateId, nowISO } from '../utils';

interface EastMoneyKlineResponse {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  data: {
    code: string;
    market: number;
    name: string;
    decimal: number;
    dktotal: number;
    preKPrice: number;
    klines: string[];
  } | null;
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
 * 东方财富股票代码转换为secid格式
 */
export function toSecId(code: string, market: string): string {
  // 东方财富市场编号: 0=SZ, 1=SH, 0=BJ
  const marketNum = market === 'SH' ? '1' : '0';
  return `${marketNum}.${code}`;
}

/**
 * 从东方财富获取日K线数据
 */
export async function fetchDailyQuotesFromEastMoney(
  code: string,
  market: string,
  startDate: string,
  endDate: string
): Promise<{ data: RawQuote[]; source: string }> {
  const secId = toSecId(code, market);

  // 东方财富日K线接口
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?` +
    `secid=${secId}&` +
    `fields1=f1,f2,f3,f4,f5,f6&` +
    `fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&` +
    `klt=101&` +       // 日K线
    `fqt=0&` +          // 不复权
    `beg=${startDate.replace(/-/g, '')}&` +
    `end=${endDate.replace(/-/g, '')}&` +
    `lmt=10000&` +      // 最大返回条数
    `ut=fa5fd1943c7b386f172d6893dbfba10b&` + // 固定ut
    `cb=`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`东方财富API请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as EastMoneyKlineResponse;

  if (json.rc !== 0 || !json.data || !json.data.klines) {
    throw new Error(`东方财富API返回异常: rc=${json.rc}`);
  }

  const klines = json.data.klines;
  const quotes: RawQuote[] = [];

  // 东方财富K线数据格式：日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
  for (const kline of klines) {
    const parts = kline.split(',');
    if (parts.length < 11) continue;

    const dateStr = parts[0];           // 2024-01-02
    const open = parseFloat(parts[1]);    // 开盘
    const close = parseFloat(parts[2]);   // 收盘
    const high = parseFloat(parts[3]);    // 最高
    const low = parseFloat(parts[4]);     // 最低
    const volume = parseInt(parts[5]);    // 成交量(手) → 需×100转股
    const amt = parseFloat(parts[6]);     // 成交额
    const pctChg = parseFloat(parts[8]);  // 涨跌幅

    // 过滤日期范围
    if (dateStr < startDate || dateStr > endDate) continue;

    quotes.push({
      trade_date: dateStr,
      open,
      high,
      low,
      close,
      volume: volume * 100, // 手 → 股
      amt,
      pct_chg: pctChg,
      pre_close: 0, // 需要从上一日close获取
    });
  }

  // 填充pre_close
  for (let i = 1; i < quotes.length; i++) {
    quotes[i].pre_close = quotes[i - 1].close;
  }

  return { data: quotes, source: 'eastmoney' };
}

/**
 * 将RawQuote转换为DailyQuote格式
 */
export function rawQuoteToDailyQuote(raw: RawQuote, stockId: string): Omit<DailyQuote, 'created_at'> {
  return {
    id: generateId('dq'),
    stock_id: stockId,
    trade_date: raw.trade_date,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    pre_close: raw.pre_close,
    pct_chg: raw.pct_chg,
    volume: raw.volume,
    amt: raw.amt,
  };
}

/**
 * 获取交易日历（从东方财富）
 */
export async function fetchTradeCalendarFromEastMoney(
  year: number
): Promise<string[]> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?` +
    `secid=1.000001&` + // 上证指数
    `fields1=f1&` +
    `fields2=f51&` +
    `klt=101&fqt=0&` +
    `beg=${year}0101&end=${year}1231&` +
    `lmt=10000&` +
    `ut=fa5fd1943c7b386f172d6893dbfba10b&cb=`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`东方财富交易日历请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as any;
  if (json.rc !== 0 || !json.data?.klines) {
    throw new Error('东方财富交易日历返回异常');
  }

  return json.data.klines.map((k: string) => k.split(',')[0]);
}

/**
 * 获取全市场PE/PB数据（用于计算市场温度）
 */
export async function fetchMarketValuation(): Promise<{
  pe: number; pb: number; date: string;
}> {
  // 东方财富全A股等权PE/PB
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?` +
    `fields=f1,f2,f3,f12,f13,f14,f152,f168,f169,f170&` +
    `secids=1.000001,0.399001&` + // 上证指数+深证成指
    `ut=fa5fd1943c7b386f172d6893dbfba10b`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`东方财富市场估值请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as any;
  const today = new Date().toISOString().slice(0, 10);

  // 简化：使用指数PE/PB作为温度参考
  // 实际生产中应使用全市场PE/PB百分位
  let pe = 0, pb = 0;
  if (json.data?.diff) {
    for (const item of json.data.diff) {
      pe += parseFloat(item.f152 || '0');
      pb += parseFloat(item.f168 || '0');
    }
    pe /= json.data.diff.length;
    pb /= json.data.diff.length;
  }

  return { pe, pb, date: today };
}
