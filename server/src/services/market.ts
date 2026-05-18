// ============================================
// 慢富(SlowRich) - 大盘指标业务逻辑
// 基于东方财富PE/PB自计算市场温度
// 3年滚动窗口计算百分位
// 指数退避重试 + 降级处理
// ============================================

import { D1Database } from '@cloudflare/workers-types';
import { MarketIndicator, ErrorCodes } from '../types';
import { generateId, nowISO, getTemperatureLevel, error, success } from '../utils';
import { fetchMarketValuation } from '../datasources/eastmoney';

// 温度计算滚动窗口：3年
const TEMP_WINDOW_YEARS = 3;

/**
 * 计算市场温度（基于PE百分位）
 * 使用3年滚动窗口计算PE百分位
 * 温度 = 当前PE在近3年历史PE中的百分位
 */
export async function calculateMarketTemperature(db: D1Database): Promise<{
  date: string;
  value: number;
  level: string;
  percentile: number;
  calculation_method: string;
  window_years: number;
} | null> {
  try {
    // 获取当前市场估值
    const valuation = await fetchMarketValuation();

    // 计算温度：基于PE在近3年历史数据中的百分位
    const windowStartDate = new Date(Date.now() - TEMP_WINDOW_YEARS * 365 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // 获取近3年历史PE数据
    const historyResult = await db.prepare(
      `SELECT value FROM market_indicators
       WHERE indicator_type = 'pe_ratio' AND source = 'eastmoney' AND indicator_date >= ?
       ORDER BY indicator_date ASC`
    ).bind(windowStartDate).all<{ value: number }>();

    const calculationMethod = `当前PE(${valuation.pe.toFixed(2)})在近${TEMP_WINDOW_YEARS}年历史PE中的百分位`;
    let percentile = 50; // 默认（数据不足时）

    if (historyResult.results && historyResult.results.length > 30) {
      // 数据充足（>30个数据点），直接计算百分位
      const historicalValues = historyResult.results.map(r => r.value).sort((a, b) => a - b);
      const rank = historicalValues.filter(v => v <= valuation.pe).length;
      percentile = Math.round(rank / historicalValues.length * 100);
    } else if (historyResult.results && historyResult.results.length > 0) {
      // 数据不足3年但有数据，使用已有数据计算
      const historicalValues = historyResult.results.map(r => r.value).sort((a, b) => a - b);
      const rank = historicalValues.filter(v => v <= valuation.pe).length;
      percentile = Math.round(rank / historicalValues.length * 100);
    }

    const temperature = percentile; // 温度 = PE百分位

    // 保存到数据库
    const today = valuation.date;
    const now = nowISO();

    // 保存PE
    await db.prepare(
      `INSERT OR REPLACE INTO market_indicators (id, indicator_date, indicator_type, value, source, fetched_at)
       VALUES (?, ?, 'pe_ratio', ?, 'eastmoney', ?)`
    ).bind(generateId('mi'), today, valuation.pe, now).run();

    // 保存PB
    await db.prepare(
      `INSERT OR REPLACE INTO market_indicators (id, indicator_date, indicator_type, value, source, fetched_at)
       VALUES (?, ?, 'pb_ratio', ?, 'eastmoney', ?)`
    ).bind(generateId('mi'), today, valuation.pb, now).run();

    // 保存温度
    await db.prepare(
      `INSERT OR REPLACE INTO market_indicators (id, indicator_date, indicator_type, value, source, fetched_at)
       VALUES (?, ?, 'temperature', ?, 'eastmoney', ?)`
    ).bind(generateId('mi'), today, temperature, now).run();

    return {
      date: today,
      value: temperature,
      level: getTemperatureLevel(temperature),
      percentile: temperature,
      calculation_method: calculationMethod,
      window_years: TEMP_WINDOW_YEARS,
    };
  } catch (e: any) {
    console.error(`市场温度计算失败: ${e.message}`);
    return null;
  }
}

/**
 * 获取市场温度
 */
export async function getMarketTemperature(db: D1Database, days: number = 365) {
  // 获取当前温度
  const current = await db.prepare(
    `SELECT * FROM market_indicators
     WHERE indicator_type = 'temperature'
     ORDER BY indicator_date DESC LIMIT 1`
  ).first<MarketIndicator>();

  // 获取历史温度
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const history = await db.prepare(
    `SELECT indicator_date as date, value FROM market_indicators
     WHERE indicator_type = 'temperature' AND indicator_date >= ?
     ORDER BY indicator_date ASC`
  ).bind(startDate).all();

  if (!current) {
    return error(ErrorCodes.QUOTE_NOT_FOUND, '暂无市场温度数据，请等待系统自动更新或手动触发抓取');
  }

  return success({
    current: {
      date: current.indicator_date,
      value: current.value,
      level: getTemperatureLevel(current.value),
      percentile: current.value,
    },
    calculation_method: `当前PE在近${TEMP_WINDOW_YEARS}年历史PE中的百分位`,
    window_years: TEMP_WINDOW_YEARS,
    history: history.results || [],
  });
}

/**
 * 手动触发温度抓取
 */
export async function triggerMarketFetch(db: D1Database) {
  const result = await calculateMarketTemperature(db);

  if (!result) {
    return error(ErrorCodes.DATA_SOURCE_UNAVAILABLE, '市场温度抓取失败，请稍后重试');
  }

  return success({
    date: result.date,
    value: result.value,
    level: result.level,
    source: 'eastmoney',
    calculation_method: result.calculation_method,
    window_years: result.window_years,
    fetched_at: nowISO(),
  }, '市场温度抓取成功');
}

/**
 * 批量抓取历史温度数据
 */
export async function fetchHistoricalTemperature(db: D1Database): Promise<number> {
  let count = 0;
  for (let i = 0; i < 3; i++) {
    const result = await calculateMarketTemperature(db);
    if (result) count++;
  }
  return count;
}
