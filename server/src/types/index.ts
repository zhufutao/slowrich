// ============================================
// 慢富(SlowRich) - 共享类型定义
// ============================================

// --- Environment Bindings ---
export interface Env {
  DB: D1Database;
  BACKTEST_QUEUE: Queue;
  JWT_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  TUSHARE_TOKEN: string;
  CSRF_SECRET: string;
  FRONTEND_URL: string;
  ENVIRONMENT: string;
}

// --- API Response ---
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T | null;
}

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// --- User ---
export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  must_change_password: number;
  last_login_at: string | null;
  login_fail_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  email: string;
  role: 'admin' | 'user';
  must_change_password: boolean;
  created_at: string;
}

// --- Stock ---
export interface Stock {
  id: string;
  code: string;
  name: string;
  market: 'SH' | 'SZ' | 'BJ';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Daily Quote ---
export interface DailyQuote {
  id: string;
  stock_id: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  pre_close: number | null;
  pct_chg: number | null;
  volume: number | null;
  amt: number | null;
  created_at: string;
}

// --- Download Task ---
export interface DownloadTask {
  id: string;
  stock_id: string;
  start_date: string;
  end_date: string;
  data_source: 'auto' | 'akshare' | 'tushare' | 'eastmoney';
  actual_source: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  progress: number;
  downloaded_days: number;
  total_days: number;
  last_downloaded_date: string | null;
  error_msg: string | null;
  error_code: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- Backtest Result ---
export interface BacktestResult {
  id: string;
  stock_id: string;
  stock_name: string;
  user_id: string;
  initial_capital: number;
  start_date: string;
  end_date: string;
  params: string; // JSON
  status: 'running' | 'completed' | 'failed';
  progress: number;
  total_strategies: number;
  completed_strategies: number;
  recommendations: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface BacktestParams {
  dip_threshold_start: number;
  dip_threshold_end: number;
  dip_threshold_step: number;
  sell_next_day: boolean;
  profit_take_start: number;
  profit_take_end: number;
  profit_take_step: number;
  commission_rate: number;  // 佣金费率，默认0.00025
  stamp_tax_rate: number;  // 印花税率，默认0.001
}

// --- Backtest Annual Stats ---
export interface BacktestAnnualStat {
  id: string;
  backtest_id: string;
  year: number;
  strategy_key: string;
  dip_threshold: number;
  sell_strategy: string;
  trigger_count: number;
  annual_return: number;
  win_rate: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
  market_env: string;
  start_capital: number;
  end_capital: number;
  annual_profit: number;
  created_at: string;
}

// --- Backtest Trade ---
export interface BacktestTrade {
  id: string;
  backtest_id: string;
  strategy_key: string;
  trade_date: string;
  buy_price: number;
  sell_date: string | null;
  sell_price: number | null;
  sell_strategy: string | null;
  profit: number | null;
  profit_pct: number | null;
  capital_after: number | null;
  created_at: string;
}

// --- Market Indicator ---
export interface MarketIndicator {
  id: string;
  indicator_date: string;
  indicator_type: string;
  value: number;
  source: string;
  fetched_at: string;
}

// --- Queue Messages ---
export interface BacktestQueueMessage {
  backtest_id: string;
  stock_id: string;
  stock_name: string;
  strategy_key: string;
  dip_threshold: number;
  sell_strategy: string;
  sell_strategy_label: string;
  initial_capital: number;
  start_date: string;
  end_date: string;
  params: BacktestParams;
}

// --- JWT Payload ---
export interface JWTPayload {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

// --- Error Codes ---
export const ErrorCodes = {
  SUCCESS: 0,
  UNKNOWN_ERROR: 10001,
  INVALID_PARAMS: 10002,
  RATE_LIMITED: 10003,
  INTERNAL_ERROR: 10004,

  // Auth
  UNAUTHORIZED: 20001,
  TOKEN_EXPIRED: 20002,
  FORBIDDEN: 20003,
  INVALID_CREDENTIALS: 20004,
  EMAIL_EXISTS: 20005,
  MUST_CHANGE_PASSWORD: 20006,
  ACCOUNT_LOCKED: 20007,

  // Business
  STOCK_EXISTS: 30001,
  STOCK_NOT_FOUND: 30002,
  STOCK_CODE_INVALID: 30003,
  QUOTE_NOT_FOUND: 30004,
  TASK_NOT_FOUND: 30005,
  DATA_SOURCE_UNAVAILABLE: 30006,
  RATE_LIMITED_API: 30007,
  STOCK_CODE_INVALID_OR_DELISTED: 30008,
  NETWORK_ERROR: 30009,
  BACKTEST_PARAMS_INVALID: 30010,
  BACKTEST_NOT_FOUND: 30011,
  DATE_RANGE_INVALID: 30012,
  BACKTEST_FAILED: 30013,
} as const;
