# 慢富(SlowRich) 数据模型文档

> 版本：v1.0 | 日期：2026-05-17 | 作者：产品经理
> 数据库：Cloudflare D1 (SQLite)

---

## 1. ER 关系图

```
┌──────────┐       ┌──────────────┐       ┌───────────────┐
│  users   │       │    stocks    │       │ download_tasks│
├──────────┤       ├──────────────┤       ├───────────────┤
│ id (PK)  │──┐    │ id (PK)      │───┐   │ id (PK)       │
│ email    │  │    │ code         │   │   │ stock_id (FK) │
│ password │  │    │ name         │   │   │ start_date    │
│ role     │  │    │ market       │   │   │ end_date      │
└──────────┘  │    │ created_by(FK)│   │   │ data_source   │
              │    └──────────────┘   │   │ status        │
              │         │             │   │ progress      │
              │         │             │   └───────────────┘
              │         ▼             │
              │    ┌──────────────┐   │
              │    │ daily_quotes │   │
              │    ├──────────────┤   │
              │    │ id (PK)      │   │
              │    │ stock_id (FK)│───┘
              │    │ trade_date   │
              │    │ open/high/low│
              │    │ close        │
              │    │ pre_close    │
              │    │ pct_chg      │
              │    │ volume/amt   │
              │    └──────────────┘
              │
              │    ┌───────────────────┐       ┌───────────────────────┐
              │    │ backtest_results  │       │ backtest_annual_stats │
              │    ├───────────────────┤       ├───────────────────────┤
              └───>│ id (PK)           │───┐   │ id (PK)               │
                   │ stock_id (FK)     │   │   │ backtest_id (FK)      │<──┘
                   │ user_id (FK)      │   │   │ year                  │
                   │ initial_capital   │   │   │ strategy_key          │
                   │ start_date        │   │   │ dip_threshold         │
                   │ end_date          │   │   │ sell_strategy         │
                   │ params (JSON)     │   │   │ trigger_count         │
                   │ status            │   │   │ annual_return         │
                   │ recommendations   │   │   │ win_rate              │
                   │   (JSON)          │   │   │ win_count             │
                   └───────────────────┘   │   │ loss_count            │
                                           │   │ max_drawdown          │
                                           │   │ market_env            │
                                           │   │ start_capital         │
                                           │   │ end_capital           │
                                           │   │ annual_profit         │
                                           │   └───────────────────────┘

    ┌─────────────────────┐
    │ market_indicators   │
    ├─────────────────────┤
    │ id (PK)             │
    │ indicator_date      │
    │ indicator_type      │
    │ value               │
    │ source              │
    │ fetched_at          │
    └─────────────────────┘
```

---

## 2. 表结构定义

### 2.1 users - 用户表

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- 用户ID，格式 u_xxx
  email TEXT NOT NULL UNIQUE,       -- 邮箱，唯一
  password_hash TEXT NOT NULL,      -- 密码哈希（bcrypt）
  role TEXT NOT NULL DEFAULT 'user', -- 角色：admin / user
  created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- 创建时间
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))   -- 更新时间
);

-- 索引
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- 初始数据：默认管理员
-- INSERT INTO users (id, email, password_hash, role) VALUES ('u_admin001', 'admin@666', '<bcrypt_hash_of_666666>', 'admin');
```

### 2.2 stocks - 股票代码表

```sql
CREATE TABLE stocks (
  id TEXT PRIMARY KEY,              -- 股票ID，格式 s_xxx
  code TEXT NOT NULL,               -- 股票代码，如 600036
  name TEXT NOT NULL,               -- 股票名称，如 招商银行
  market TEXT NOT NULL,             -- 市场：SH / SZ / BJ
  created_by TEXT,                  -- 创建人用户ID
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 索引
CREATE UNIQUE INDEX idx_stocks_code ON stocks(code);
CREATE INDEX idx_stocks_market ON stocks(market);
```

### 2.3 daily_quotes - 日行情表

```sql
CREATE TABLE daily_quotes (
  id TEXT PRIMARY KEY,              -- 行情ID，格式 dq_xxx
  stock_id TEXT NOT NULL,           -- 股票ID
  trade_date TEXT NOT NULL,         -- 交易日期，格式 YYYY-MM-DD
  open REAL,                        -- 开盘价
  high REAL,                        -- 最高价
  low REAL,                         -- 最低价
  close REAL,                       -- 收盘价
  pre_close REAL,                   -- 前收盘价
  pct_chg REAL,                     -- 涨跌幅(%)
  volume INTEGER,                   -- 成交量(股)
  amt REAL,                         -- 成交额(元)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

-- 索引（核心查询索引）
CREATE UNIQUE INDEX idx_quotes_stock_date ON daily_quotes(stock_id, trade_date);
CREATE INDEX idx_quotes_trade_date ON daily_quotes(trade_date);
```

> **D1兼容说明**：行情数据量大时（单股10年约2400条，100只股票约24万条），查询走索引即可，无需分表。D1单库10GB限制下，预计可存储约500只股票×10年数据（约120万条，约500MB），满足需求。

### 2.4 download_tasks - 下载任务表

```sql
CREATE TABLE download_tasks (
  id TEXT PRIMARY KEY,              -- 任务ID，格式 dt_xxx
  stock_id TEXT NOT NULL,           -- 股票ID
  start_date TEXT NOT NULL,         -- 下载起始日期
  end_date TEXT NOT NULL,           -- 下载结束日期
  data_source TEXT NOT NULL DEFAULT 'auto', -- 数据源：auto / akshare / tushare
  actual_source TEXT,               -- 实际使用的数据源
  status TEXT NOT NULL DEFAULT 'pending',   -- 状态：pending / running / completed / failed / partial
  progress INTEGER NOT NULL DEFAULT 0,      -- 进度百分比 0-100
  downloaded_days INTEGER NOT NULL DEFAULT 0, -- 已下载天数
  total_days INTEGER NOT NULL DEFAULT 0,    -- 总天数
  last_downloaded_date TEXT,        -- 最后下载日期（断点续传用）
  error_msg TEXT,                   -- 错误信息
  user_id TEXT,                     -- 创建人
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES stocks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 索引
CREATE INDEX idx_download_stock ON download_tasks(stock_id);
CREATE INDEX idx_download_status ON download_tasks(status);
```

### 2.5 backtest_results - 回测结果表

```sql
CREATE TABLE backtest_results (
  id TEXT PRIMARY KEY,              -- 回测ID，格式 bt_xxx
  stock_id TEXT NOT NULL,           -- 股票ID
  user_id TEXT NOT NULL,            -- 发起用户ID
  initial_capital REAL NOT NULL,    -- 初始资金
  start_date TEXT NOT NULL,         -- 回测起始日期
  end_date TEXT NOT NULL,           -- 回测结束日期
  params TEXT NOT NULL,             -- 回测参数（JSON格式）
  status TEXT NOT NULL DEFAULT 'running', -- 状态：running / completed / failed
  recommendations TEXT,             -- 推荐策略（JSON格式，含gold/silver/bronze）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES stocks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 索引
CREATE INDEX idx_backtest_stock ON backtest_results(stock_id);
CREATE INDEX idx_backtest_user ON backtest_results(user_id);
```

**params JSON 结构：**
```json
{
  "dip_threshold_start": 3.0,
  "dip_threshold_end": 10.0,
  "dip_threshold_step": 0.5,
  "sell_next_day": true,
  "profit_take_start": 5.0,
  "profit_take_end": 10.0,
  "profit_take_step": 0.5
}
```

**recommendations JSON 结构：**
```json
{
  "gold": {
    "dip_threshold": 5.0,
    "sell_strategy": "profit_take_7.0",
    "composite_score": 0.72,
    "avg_annual_return": 12.5,
    "avg_win_rate": 58.3,
    "avg_max_drawdown": 15.2
  },
  "silver": { ... },
  "bronze": { ... }
}
```

### 2.6 backtest_annual_stats - 年度统计表

```sql
CREATE TABLE backtest_annual_stats (
  id TEXT PRIMARY KEY,              -- 统计ID，格式 bas_xxx
  backtest_id TEXT NOT NULL,        -- 回测ID
  year INTEGER NOT NULL,            -- 年份
  strategy_key TEXT NOT NULL,       -- 策略标识，如 dip_5.0_profit_take_7.0
  dip_threshold REAL NOT NULL,      -- 抄底跌幅阈值(%)
  sell_strategy TEXT NOT NULL,      -- 卖出策略：next_day_close / profit_take_X.X
  trigger_count INTEGER NOT NULL,   -- 触发次数
  annual_return REAL NOT NULL,      -- 年化收益率(%)
  win_rate REAL NOT NULL,           -- 胜率(%)
  win_count INTEGER NOT NULL,       -- 盈利次数
  loss_count INTEGER NOT NULL,      -- 亏损次数
  max_drawdown REAL NOT NULL,       -- 最大回撤(%)
  market_env TEXT NOT NULL,         -- 市场环境：牛市/震荡市/熊市
  start_capital REAL NOT NULL,      -- 年初资金
  end_capital REAL NOT NULL,        -- 年末资金
  annual_profit REAL NOT NULL,      -- 年度浮盈
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (backtest_id) REFERENCES backtest_results(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_annual_backtest ON backtest_annual_stats(backtest_id);
CREATE INDEX idx_annual_strategy ON backtest_annual_stats(backtest_id, strategy_key);
CREATE UNIQUE INDEX idx_annual_unique ON backtest_annual_stats(backtest_id, year, strategy_key);
```

> **D1兼容说明**：回测结果可能产生大量年度统计行（如15个跌幅阈值 × 12个卖出策略 × 10年 = 1800行/次回测），使用索引覆盖查询，避免JOIN。策略对比查询直接在 annual_stats 表内聚合，无需关联 backtest_results 表。

### 2.7 market_indicators - 大盘指标表

```sql
CREATE TABLE market_indicators (
  id TEXT PRIMARY KEY,              -- 指标ID，格式 mi_xxx
  indicator_date TEXT NOT NULL,     -- 指标日期，格式 YYYY-MM-DD
  indicator_type TEXT NOT NULL DEFAULT 'temperature', -- 指标类型：temperature / pe_ratio / pb_ratio 等（扩展预留）
  value REAL NOT NULL,              -- 指标值
  source TEXT NOT NULL DEFAULT 'jisilu', -- 数据来源
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')), -- 抓取时间
  UNIQUE(indicator_date, indicator_type, source)
);

-- 索引
CREATE INDEX idx_indicator_date ON market_indicators(indicator_date);
CREATE INDEX idx_indicator_type ON market_indicators(indicator_type, indicator_date);
```

---

## 3. D1 兼容性设计要点

| 要点 | 说明 | 处理方式 |
|------|------|---------|
| 不支持 RIGHT JOIN / FULL OUTER JOIN | D1仅支持LEFT JOIN / INNER JOIN | 使用LEFT JOIN + UNION替代 |
| 单次查询建议 ≤ 1000行 | 大数据量查询需分页 | 所有列表接口强制分页，page_size ≤ 100 |
| 不支持存储过程/触发器 | 业务逻辑需在应用层 | Workers层处理所有业务逻辑 |
| 单库10GB限制 | 大量行情数据可能超限 | 监控数据量，必要时对daily_quotes按年份分表 |
| 批量写入并发有限 | 单次事务建议 ≤ 100条 | 行情数据下载分批写入，每批100条一个事务 |
| JSON字段支持 | SQLite支持JSON扩展 | 回测参数和推荐策略使用JSON TEXT存储 |
| ID生成 | 无自增主键最佳实践 | 使用应用层生成ID（格式如 u_xxx / s_xxx / bt_xxx） |
| 日期函数 | 支持 datetime('now') | 统一使用ISO 8601格式存储时间 |

---

## 4. 数据生命周期

| 表 | 增长估算 | 清理策略 |
|------|---------|---------|
| users | 极小（百级） | 不清理 |
| stocks | 小（百级） | 管理员手动删除 |
| daily_quotes | 中（万~百万级） | 超过5年且无回测引用的行情数据可归档 |
| download_tasks | 小（千级） | 完成超过30天的任务可清理 |
| backtest_results | 中（千级） | 用户可删除自己的回测记录 |
| backtest_annual_stats | 随backtest_results级联 | 级联删除 |
| market_indicators | 小（千级） | 超过3年数据可归档 |

---

*文档结束。配套文档：[PRD](./PRD.md)、[接口定义](./api-spec.md)*
