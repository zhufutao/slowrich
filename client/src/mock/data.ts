import type { Stock, DownloadTask, DailyQuote, BacktestResult, AnnualStat, StrategyComparison, CapitalCurvePoint, MarketTemperature } from '../types';

// Mock Stocks
export const mockStocks: Stock[] = [
  { id: 's_001', code: '600036', name: '招商银行', market: 'SH', created_at: '2026-01-15T10:00:00Z' },
  { id: 's_002', code: '000858', name: '五粮液', market: 'SZ', created_at: '2026-01-15T10:05:00Z' },
  { id: 's_003', code: '601318', name: '中国平安', market: 'SH', created_at: '2026-02-01T08:30:00Z' },
  { id: 's_004', code: '000001', name: '平安银行', market: 'SZ', created_at: '2026-02-10T09:00:00Z' },
  { id: 's_005', code: '600519', name: '贵州茅台', market: 'SH', created_at: '2026-03-01T10:00:00Z' },
];

// Mock Download Tasks
export const mockDownloadTasks: DownloadTask[] = [
  { id: 'dt_001', stock_id: 's_001', stock_name: '招商银行', start_date: '2020-01-01', end_date: '2025-12-31', data_source: 'auto', actual_source: 'eastmoney', status: 'completed', progress: 100, downloaded_days: 1450, total_days: 1450, created_at: '2026-05-10T09:00:00Z' },
  { id: 'dt_002', stock_id: 's_002', stock_name: '五粮液', start_date: '2021-01-01', end_date: '2025-12-31', data_source: 'auto', actual_source: 'eastmoney', status: 'running', progress: 67, downloaded_days: 670, total_days: 1000, created_at: '2026-05-15T14:30:00Z' },
  { id: 'dt_003', stock_id: 's_003', stock_name: '中国平安', start_date: '2019-01-01', end_date: '2025-12-31', data_source: 'auto', actual_source: 'tushare', status: 'failed', progress: 45, downloaded_days: 800, total_days: 1780, last_downloaded_date: '2022-06-15', error_msg: 'DATA_SOURCE_UNAVAILABLE: 东方财富接口超时，Tushare Token无效', created_at: '2026-05-16T10:00:00Z' },
  { id: 'dt_004', stock_id: 's_005', stock_name: '贵州茅台', start_date: '2022-01-01', end_date: '2025-12-31', data_source: 'auto', status: 'pending', progress: 0, downloaded_days: 0, total_days: 960, created_at: '2026-05-17T08:00:00Z' },
];

// Mock Daily Quotes
function generateQuotes(startDate: string, endDate: string): DailyQuote[] {
  const quotes: DailyQuote[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let price = 32.50;
  let d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const change = (Math.random() - 0.48) * 3;
      const pre_close = price;
      price = Math.max(5, price + change);
      const pct_chg = ((price - pre_close) / pre_close) * 100;
      quotes.push({
        trade_date: d.toISOString().split('T')[0],
        open: +(pre_close + (Math.random() - 0.5) * 1).toFixed(2),
        high: +(Math.max(price, pre_close) + Math.random() * 0.5).toFixed(2),
        low: +(Math.min(price, pre_close) - Math.random() * 0.5).toFixed(2),
        close: +price.toFixed(2),
        pre_close: +pre_close.toFixed(2),
        pct_chg: +pct_chg.toFixed(2),
        volume: Math.floor(30000000 + Math.random() * 50000000),
        amt: Math.floor(900000000 + Math.random() * 1500000000),
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return quotes;
}

export const mockQuotes: DailyQuote[] = generateQuotes('2024-01-01', '2024-12-31');

// Mock Backtest Result
export const mockBacktestResult: BacktestResult = {
  id: 'bt_001',
  stock_id: 's_001',
  stock_name: '招商银行',
  initial_capital: 100000,
  start_date: '2015-01-01',
  end_date: '2024-12-31',
  status: 'completed',
  progress: 100,
  params: {
    dip_threshold_start: 3.0,
    dip_threshold_end: 10.0,
    dip_threshold_step: 0.5,
    sell_next_day: true,
    profit_take_start: 5.0,
    profit_take_end: 10.0,
    profit_take_step: 0.5,
    commission_rate: 0.025,
    stamp_tax_rate: 0.1,
  },
  recommendations: {
    gold: { dip_threshold: 5.0, sell_strategy: 'profit_take_7.0', composite_score: 0.72, avg_annual_return: 12.5, avg_win_rate: 58.3, avg_max_drawdown: 15.2 },
    silver: { dip_threshold: 4.0, sell_strategy: 'next_day_close', composite_score: 0.65, avg_annual_return: 9.8, avg_win_rate: 55.1, avg_max_drawdown: 18.5 },
    bronze: { dip_threshold: 6.0, sell_strategy: 'profit_take_8.0', composite_score: 0.58, avg_annual_return: 7.2, avg_win_rate: 48.6, avg_max_drawdown: 22.1 },
  },
};

// Mock Annual Stats
const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const envs = ['牛市', '熊市', '震荡市', '熊市', '牛市', '震荡市', '牛市', '熊市', '震荡市', '震荡市'];

export const mockAnnualStats: AnnualStat[] = years.map((year, i) => {
  const triggerCount = Math.floor(10 + Math.random() * 25);
  const winRate = 30 + Math.random() * 40;
  const winCount = Math.floor(triggerCount * winRate / 100);
  const annualReturn = (Math.random() - 0.3) * 30;
  const maxDrawdown = 5 + Math.random() * 25;
  const startCapital = i === 0 ? 100000 : 100000 * (1 + (Math.random() - 0.3) * 0.15);
  const endCapital = startCapital * (1 + annualReturn / 100);
  return {
    year,
    trigger_count: triggerCount,
    annual_return: +annualReturn.toFixed(1),
    win_rate: +winRate.toFixed(1),
    win_count: winCount,
    loss_count: triggerCount - winCount,
    max_drawdown: +maxDrawdown.toFixed(1),
    market_env: envs[i],
    start_capital: +startCapital.toFixed(2),
    end_capital: +endCapital.toFixed(2),
    annual_profit: +(endCapital - startCapital).toFixed(2),
  };
});

// Mock Strategy Comparison
export const mockStrategyComparison: StrategyComparison[] = [];
for (let dip = 3.0; dip <= 10.0; dip += 0.5) {
  mockStrategyComparison.push({
    strategy_key: `dip_${dip}_next_day_close`,
    dip_threshold: dip,
    sell_strategy: 'next_day_close',
    sell_strategy_label: '次日收盘卖出',
    avg_annual_return: +(5 + Math.random() * 10).toFixed(1),
    avg_win_rate: +(40 + Math.random() * 25).toFixed(1),
    avg_max_drawdown: +(10 + Math.random() * 20).toFixed(1),
    total_triggers: Math.floor(100 + Math.random() * 200),
    composite_score: +(0.4 + Math.random() * 0.35).toFixed(2),
  });
  for (let pt = 5.0; pt <= 10.0; pt += 0.5) {
    mockStrategyComparison.push({
      strategy_key: `dip_${dip}_profit_take_${pt}`,
      dip_threshold: dip,
      sell_strategy: `profit_take_${pt}`,
      sell_strategy_label: `浮盈${pt}%卖出`,
      avg_annual_return: +(6 + Math.random() * 12).toFixed(1),
      avg_win_rate: +(42 + Math.random() * 25).toFixed(1),
      avg_max_drawdown: +(8 + Math.random() * 18).toFixed(1),
      total_triggers: Math.floor(100 + Math.random() * 200),
      composite_score: +(0.45 + Math.random() * 0.35).toFixed(2),
    });
  }
}

// Mock Capital Curve
let capital = 100000;
export const mockCapitalCurve: CapitalCurvePoint[] = years.map((year) => {
  const change = (Math.random() - 0.3) * 0.2;
  capital = capital * (1 + change);
  return { year, end_capital: +capital.toFixed(2) };
});

// Mock Market Temperature
const tempHistory: { date: string; value: number }[] = [];
const today = new Date();
for (let i = 365; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  tempHistory.push({
    date: d.toISOString().split('T')[0],
    value: +(20 + Math.random() * 60).toFixed(1),
  });
}

export const mockMarketTemperature: MarketTemperature = {
  current: {
    date: today.toISOString().split('T')[0],
    value: 35.2,
    level: '适中',
    percentile: 42.5,
  },
  history: tempHistory,
};

// Mock API delay
export async function fetchMockData<T>(data: T, delay = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), delay));
}
