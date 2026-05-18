// ============================================
// 慢富(SlowRich) - 回测算法核心引擎
// 跌幅触发 + 买入卖出逻辑 + 交易成本
// ============================================

import { BacktestParams, DailyQuote, BacktestTrade, BacktestAnnualStat } from '../types';
import { generateId, strategyKey, getMarketEnv } from '../utils';

interface QuoteData {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  pre_close: number;
  pct_chg: number;
  volume: number;
  amt: number;
}

interface TradeRecord {
  trade_date: string;
  buy_price: number;
  sell_date: string | null;
  sell_price: number | null;
  sell_strategy: string | null;
  profit: number | null;
  profit_pct: number | null;
  capital_after: number | null;
}

interface YearlyStats {
  year: number;
  trigger_count: number;
  win_count: number;
  loss_count: number;
  start_capital: number;
  end_capital: number;
  annual_profit: number;
  annual_return: number;
  win_rate: number;
  max_drawdown: number;
  market_env: string;
  trades: TradeRecord[];
}

/**
 * 执行单策略回测
 * 一个策略组合 = 一个跌幅阈值 + 一个卖出策略
 */
export function runSingleStrategy(
  quotes: QuoteData[],
  dipThreshold: number,
  sellStrategy: string,
  initialCapital: number,
  params: BacktestParams
): { annualStats: Omit<BacktestAnnualStat, 'id' | 'backtest_id' | 'created_at'>[]; trades: Omit<BacktestTrade, 'id' | 'backtest_id' | 'created_at'>[] } {
  const commissionRate = params.commission_rate ?? 0.00025; // 佣金万2.5
  const stampTaxRate = params.stamp_tax_rate ?? 0.001;       // 印花税千1
  const minCommission = 5; // 最低佣金5元

  let capital = initialCapital;
  let holding = false;
  let buyPrice = 0;
  let buyDate = '';
  let capitalPeak = initialCapital; // 用于计算最大回撤
  let maxDrawdown = 0;

  // 按年分组统计
  const yearlyData = new Map<number, {
    startCapital: number;
    endCapital: number;
    triggerCount: number;
    winCount: number;
    lossCount: number;
    trades: TradeRecord[];
    peakCapital: number;
    maxDrawdown: number;
  }>();

  // 初始化年份
  for (const q of quotes) {
    const year = parseInt(q.trade_date.substring(0, 4));
    if (!yearlyData.has(year)) {
      yearlyData.set(year, {
        startCapital: capital,
        endCapital: capital,
        triggerCount: 0,
        winCount: 0,
        lossCount: 0,
        trades: [],
        peakCapital: capital,
        maxDrawdown: 0,
      });
    }
  }

  // 计算该年度指数涨跌幅（用于市场环境判断）
  const yearFirstLast = new Map<number, { first: QuoteData; last: QuoteData }>();
  for (const q of quotes) {
    const year = parseInt(q.trade_date.substring(0, 4));
    const entry = yearFirstLast.get(year);
    if (!entry) {
      yearFirstLast.set(year, { first: q, last: q });
    } else {
      entry.last = q;
    }
  }

  // 遍历行情数据
  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    const year = parseInt(q.trade_date.substring(0, 4));
    const yd = yearlyData.get(year)!;

    if (holding) {
      // 持仓中，检查卖出条件
      let sold = false;
      let sellPrice = 0;
      let actualSellStrategy = '';

      if (sellStrategy === 'next_day_close') {
        // 欋日收盘卖出
        sellPrice = q.close;
        actualSellStrategy = 'next_day_close';
        sold = true;
      } else {
        // 浮盈卖出策略
        const profitPctTarget = parseFloat(sellStrategy.replace('profit_take_', ''));

        // 用最高价模拟盘中价（标注前视偏差风险）
        const highPct = (q.high - buyPrice) / buyPrice * 100;

        if (highPct >= profitPctTarget) {
          // 盘中达到目标浮盈，以目标价卖出
          sellPrice = buyPrice * (1 + profitPctTarget / 100);
          actualSellStrategy = sellStrategy;
          sold = true;
        } else {
          // 未达目标，收盘价卖出
          sellPrice = q.close;
          actualSellStrategy = sellStrategy + '_fallback_close';
          sold = true;
        }
      }

      if (sold) {
        // 计算交易成本
        const buyAmount = capital; // 全仓买入时的金额
        const sellAmount = sellPrice / buyPrice * buyAmount;
        const buyCommission = Math.max(buyAmount * commissionRate, minCommission);
        const sellCommission = Math.max(sellAmount * commissionRate, minCommission);
        const stampTax = sellAmount * stampTaxRate;

        const profit = sellAmount - buyAmount - buyCommission - sellCommission - stampTax;
        const profitPct = profit / buyAmount * 100;
        capital = buyAmount + profit;

        const trade: TradeRecord = {
          trade_date: buyDate,
          buy_price: buyPrice,
          sell_date: q.trade_date,
          sell_price: sellPrice,
          sell_strategy: actualSellStrategy,
          profit: Math.round(profit * 100) / 100,
          profit_pct: Math.round(profitPct * 100) / 100,
          capital_after: Math.round(capital * 100) / 100,
        };

        yd.trades.push(trade);
        if (profit > 0) yd.winCount++;
        else yd.lossCount++;

        holding = false;

        // 更新资金峰值和最大回撤
        if (capital > capitalPeak) capitalPeak = capital;
        const drawdown = (capitalPeak - capital) / capitalPeak * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        if (drawdown > yd.maxDrawdown) yd.maxDrawdown = drawdown;
      }
    } else {
      // 空仓，检查买入条件
      // 跌幅判断：当日收盘跌幅 >= 跌幅阈值
      if (q.pct_chg <= -dipThreshold) {
        // 触发抄底，以收盘价买入（全仓）
        holding = true;
        buyPrice = q.close;
        buyDate = q.trade_date;
        yd.triggerCount++;
      }
    }

    // 更新年末资金
    yd.endCapital = capital;
    yd.peakCapital = Math.max(yd.peakCapital, capital);
    const dd = (yd.peakCapital - capital) / yd.peakCapital * 100;
    if (dd > yd.maxDrawdown) yd.maxDrawdown = dd;
  }

  // 生成年度统计
  const annualStats: Omit<BacktestAnnualStat, 'id' | 'backtest_id' | 'created_at'>[] = [];
  const sKey = strategyKey(dipThreshold, sellStrategy);

  for (const [year, yd] of yearlyData) {
    const annualProfit = yd.endCapital - yd.startCapital;
    const annualReturn = yd.startCapital > 0
      ? (annualProfit / yd.startCapital * 100)
      : 0;
    const totalTrades = yd.winCount + yd.lossCount;
    const winRate = totalTrades > 0 ? (yd.winCount / totalTrades * 100) : 0;

    // 市场环境
    const yearData = yearFirstLast.get(year);
    let marketEnv = '震荡市';
    if (yearData) {
      const yearPctChg = (yearData.last.close - yearData.first.close) / yearData.first.close * 100;
      marketEnv = getMarketEnv(yearPctChg);
    }

    annualStats.push({
      year,
      strategy_key: sKey,
      dip_threshold: dipThreshold,
      sell_strategy: sellStrategy,
      trigger_count: yd.triggerCount,
      annual_return: Math.round(annualReturn * 100) / 100,
      win_rate: Math.round(winRate * 100) / 100,
      win_count: yd.winCount,
      loss_count: yd.lossCount,
      max_drawdown: Math.round(yd.maxDrawdown * 100) / 100,
      market_env: marketEnv,
      start_capital: Math.round(yd.startCapital * 100) / 100,
      end_capital: Math.round(yd.endCapital * 100) / 100,
      annual_profit: Math.round(annualProfit * 100) / 100,
    });
  }

  // 生成交易明细
  const trades: Omit<BacktestTrade, 'id' | 'backtest_id' | 'created_at'>[] = [];
  for (const [, yd] of yearlyData) {
    for (const t of yd.trades) {
      trades.push({
        strategy_key: sKey,
        trade_date: t.trade_date,
        buy_price: t.buy_price,
        sell_date: t.sell_date,
        sell_price: t.sell_price,
        sell_strategy: t.sell_strategy,
        profit: t.profit,
        profit_pct: t.profit_pct,
        capital_after: t.capital_after,
      });
    }
  }

  return { annualStats, trades };
}

/**
 * 生成策略组合列表
 */
export function generateStrategyCombinations(params: BacktestParams): {
  dipThreshold: number;
  sellStrategy: string;
  sellStrategyLabel: string;
}[] {
  const combinations: { dipThreshold: number; sellStrategy: string; sellStrategyLabel: string }[] = [];

  // 生成跌幅阈值序列
  const dipThresholds: number[] = [];
  for (let d = params.dip_threshold_start; d <= params.dip_threshold_end + 0.001; d += params.dip_threshold_step) {
    dipThresholds.push(Math.round(d * 10) / 10);
  }

  // 生成卖出策略列表
  const sellStrategies: { key: string; label: string }[] = [];
  if (params.sell_next_day) {
    sellStrategies.push({ key: 'next_day_close', label: '次日收盘卖出' });
  }
  for (let p = params.profit_take_start; p <= params.profit_take_end + 0.001; p += params.profit_take_step) {
    const pct = Math.round(p * 10) / 10;
    sellStrategies.push({ key: `profit_take_${pct}`, label: `浮盈${pct}%卖出` });
  }

  // 笛卡尔积
  for (const dip of dipThresholds) {
    for (const sell of sellStrategies) {
      combinations.push({
        dipThreshold: dip,
        sellStrategy: sell.key,
        sellStrategyLabel: sell.label,
      });
    }
  }

  return combinations;
}
