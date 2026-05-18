-- ============================================
-- 慢富(SlowRich) 数据库建表SQL
-- Cloudflare D1 (SQLite) - 含架构评审修正
-- ============================================

-- 1. users - 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  login_fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. refresh_tokens - Refresh Token存储表
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

-- 3. stocks - 股票代码表
CREATE TABLE IF NOT EXISTS stocks (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL CHECK(market IN ('SH', 'SZ', 'BJ')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_code ON stocks(code);
CREATE INDEX IF NOT EXISTS idx_stocks_market ON stocks(market);

-- 4. daily_quotes - 日行情表
CREATE TABLE IF NOT EXISTS daily_quotes (
  id TEXT PRIMARY KEY,
  stock_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  pre_close REAL,
  pct_chg REAL,
  volume INTEGER,
  amt REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_stock_date ON daily_quotes(stock_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_quotes_trade_date ON daily_quotes(trade_date);

-- 5. download_tasks - 下载任务表
CREATE TABLE IF NOT EXISTS download_tasks (
  id TEXT PRIMARY KEY,
  stock_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  data_source TEXT NOT NULL DEFAULT 'auto' CHECK(data_source IN ('auto', 'akshare', 'tushare', 'eastmoney')),
  actual_source TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  progress INTEGER NOT NULL DEFAULT 0,
  downloaded_days INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  last_downloaded_date TEXT,
  error_msg TEXT,
  error_code TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES stocks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_download_stock ON download_tasks(stock_id);
CREATE INDEX IF NOT EXISTS idx_download_status ON download_tasks(status);
CREATE INDEX IF NOT EXISTS idx_download_user ON download_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_download_created ON download_tasks(created_at);

-- 6. trade_calendar - 交易日历表
CREATE TABLE IF NOT EXISTS trade_calendar (
  trade_date TEXT PRIMARY KEY,
  is_open INTEGER NOT NULL DEFAULT 1,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_year ON trade_calendar(year);
CREATE INDEX IF NOT EXISTS idx_calendar_year_month ON trade_calendar(year, month);

-- 7. backtest_results - 回测结果表
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  stock_id TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  initial_capital REAL NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  total_strategies INTEGER NOT NULL DEFAULT 0,
  completed_strategies INTEGER NOT NULL DEFAULT 0,
  recommendations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES stocks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_backtest_stock ON backtest_results(stock_id);
CREATE INDEX IF NOT EXISTS idx_backtest_user ON backtest_results(user_id);

-- 8. backtest_annual_stats - 年度统计表
CREATE TABLE IF NOT EXISTS backtest_annual_stats (
  id TEXT PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  strategy_key TEXT NOT NULL,
  dip_threshold REAL NOT NULL,
  sell_strategy TEXT NOT NULL,
  trigger_count INTEGER NOT NULL,
  annual_return REAL NOT NULL,
  win_rate REAL NOT NULL,
  win_count INTEGER NOT NULL,
  loss_count INTEGER NOT NULL,
  max_drawdown REAL NOT NULL,
  market_env TEXT NOT NULL,
  start_capital REAL NOT NULL,
  end_capital REAL NOT NULL,
  annual_profit REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (backtest_id) REFERENCES backtest_results(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_annual_backtest ON backtest_annual_stats(backtest_id);
CREATE INDEX IF NOT EXISTS idx_annual_strategy ON backtest_annual_stats(backtest_id, strategy_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_annual_unique ON backtest_annual_stats(backtest_id, year, strategy_key);

-- 9. backtest_trades - 回测交易明细表（新增，支持资金曲线）
CREATE TABLE IF NOT EXISTS backtest_trades (
  id TEXT PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  buy_price REAL NOT NULL,
  sell_date TEXT,
  sell_price REAL,
  sell_strategy TEXT,
  profit REAL,
  profit_pct REAL,
  capital_after REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (backtest_id) REFERENCES backtest_results(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_trades_backtest_strategy ON backtest_trades(backtest_id, strategy_key);
CREATE INDEX IF NOT EXISTS idx_trades_date ON backtest_trades(backtest_id, strategy_key, trade_date);

-- 10. market_indicators - 大盘指标表
CREATE TABLE IF NOT EXISTS market_indicators (
  id TEXT PRIMARY KEY,
  indicator_date TEXT NOT NULL,
  indicator_type TEXT NOT NULL DEFAULT 'temperature',
  value REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'eastmoney',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_date, indicator_type, source)
);
CREATE INDEX IF NOT EXISTS idx_indicator_date ON market_indicators(indicator_date);
CREATE INDEX IF NOT EXISTS idx_indicator_type ON market_indicators(indicator_type, indicator_date);

-- 11. cron_logs - Cron执行日志表（新增）
CREATE TABLE IF NOT EXISTS cron_logs (
  id TEXT PRIMARY KEY,
  cron_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
  message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cron_type ON cron_logs(cron_type);
CREATE INDEX IF NOT EXISTS idx_cron_started ON cron_logs(started_at);
