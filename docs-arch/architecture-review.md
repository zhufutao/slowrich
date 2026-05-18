# 慢富(SlowRich) 技术架构评审报告

> 评审人：代码评审官 | 日期：2026-05-17 | 版本：v1.0
> 基于文档：PRD.md v1.0 / api-spec.md v1.0 / data-model.md v1.0

---

## 总体评价

慢富项目采用 Cloudflare Workers + D1 + Pages 全栈 Serverless 架构，技术选型与"轻量级量化回测工具"的产品定位基本匹配。但存在 **1个架构级缺陷**（回测计算无法在Workers中完成）和 **多个设计缺陷** 需要在开发前修正。

**评审结论：有条件通过**——需先解决P0级回测计算架构问题，其余P1/P2项可在开发过程中逐步修正。

---

## 1. Cloudflare 部署方案评审

### 1.1 架构总评

| 组件 | 选型 | 评价 |
|------|------|------|
| 前端 | React + Vite + TailwindCSS → Pages | ✅ 合理，静态资源CDN分发，冷启动无感 |
| 后端 | Workers (Hono) | ⚠️ 计算密集型任务受限，需补充方案 |
| 数据库 | D1 (SQLite) | ✅ 适合读多写少场景，但有写入并发限制 |
| 定时任务 | Workers Cron Trigger | ✅ 适合市场温度抓取，但需增加失败告警 |

### 1.2 Workers 执行限制分析

**Cloudflare Workers 限制（截至2026年）：**

| 限制项 | Free计划 | Paid计划 ($5/月) | Bundled计划 |
|--------|----------|-------------------|-------------|
| CPU时间/请求 | 10ms | 30ms | 30ms |
| Wall时间/请求 | 无限制 | 无限制 | 无限制 |
| 内存 | 128MB | 128MB | 128MB |
| 子请求数 | 50 | 50 | 1000 |
| 脚本大小 | 1MB | 10MB | 10MB |

**关键问题：CPU时间限制与回测计算的矛盾**

回测计算量估算：
- 跌幅阈值：起始3%到结束10%，步长0.5% → 15个阈值
- 卖出策略：次日收盘(1) + 浮盈5%-10%步长0.5%(12) = 13种
- 策略组合总数：15 × 13 = **195个策略**
- 每策略遍历：10年 × 240交易日 = 2400天
- 每天计算：判断触发(1次比较) + 买入/卖出逻辑(若干运算)
- 总计算量：195 × 2400 ≈ **468,000次核心运算**

**结论：在Workers Paid计划的30ms CPU限制内，完全无法完成回测计算。即使采用最激进的优化，单次请求的CPU时间也将达到数秒级别。**

### 1.3 回测计算方案对比（项目经理要求深入对比）

#### 方案A：Durable Objects

| 维度 | 评估 |
|------|------|
| 原理 | Durable Objects提供有状态的单点计算，支持WebSocket长连接，wall-time无硬限制（但CPU仍受30ms/请求限制） |
| CPU限制 | Durable Objects同样受Workers CPU时间限制，但可通过`ctx.waitUntil()`和多次请求分片来规避 |
| 实现方式 | 将回测任务拆分为多个小任务，每次请求处理一批策略组合，通过Durable Object内部状态管理进度 |
| 状态管理 | 内置事务性存储，天然支持断点续传 |
| 通信 | WebSocket实时推送进度，前端无需轮询 |
| 成本 | $0.15/百万请求 + $0.50/GB存储 + WebSocket连接时长费用 |
| 优点 | 状态管理优雅、实时推送、断点续传天然支持 |
| 缺点 | CPU限制仍需分片处理、成本较难预估、调试复杂度高 |

**评分：⭐⭐⭐⭐ (推荐)**

#### 方案B：Cloudflare Queue + 分片计算

| 维度 | 评估 |
|------|------|
| 原理 | 将回测任务拆分为子任务放入Queue，每个子任务处理1-2个策略组合，Workers Consumer逐个消费 |
| CPU限制 | 每个子任务CPU消耗可控（1-2个策略×2400天 ≈ 5000次运算，可在30ms内完成） |
| 实现方式 | 1) 主Worker创建回测任务 2) 拆分为N个Queue消息 3) Consumer Worker逐个消费计算 4) 结果写入D1 5) 全部完成后汇总推荐策略 |
| 状态管理 | 需额外在D1中维护进度计数器 |
| 通信 | 前端轮询进度，或配合Pub/Sub推送 |
| 成本 | Queue: $0.40/百万操作，Workers调用: $0.50/百万请求 |
| 优点 | 实现简单、成本可控、天然支持重试（Queue消息重试机制）、水平扩展 |
| 缺点 | 延迟较高（Queue消费有延迟）、进度追踪需额外设计、无法实时推送 |

**评分：⭐⭐⭐⭐⭐ (最优推荐)**

#### 方案C：前端Web Worker分片计算

| 维度 | 评估 |
|------|------|
| 原理 | 服务端仅提供行情数据，回测计算完全在前端Web Worker中执行 |
| CPU限制 | 无服务端限制，利用用户设备CPU |
| 实现方式 | 1) 前端请求行情数据API 2) 在Web Worker中运行回测算法 3) 结果在前端渲染 |
| 状态管理 | 前端内存管理，刷新页面丢失 |
| 通信 | 无需通信，本地计算 |
| 成本 | 仅数据API调用成本，无额外计算费用 |
| 优点 | 零服务端计算成本、无CPU限制、即时反馈 |
| 缺点 | **10年行情数据传输量大**（2400条×9字段 ≈ 200KB JSON，可接受）、手机端性能差（低端设备可能卡顿）、计算结果不持久（需额外上传保存）、代码需前后端双写（JS回测引擎） |

**评分：⭐⭐⭐ (备选方案)**

#### 🏆 推荐方案：Queue + 分片计算（方案B）

**推荐理由：**

1. **CPU限制可控**：每个子任务处理1-2个策略组合，CPU消耗在30ms限制内
2. **成本最优**：195个子任务 × $0.50/百万请求 ≈ $0.0001/次回测，几乎可忽略
3. **可靠性高**：Queue消息自动重试，子任务失败不影响整体
4. **实现简单**：无需引入Durable Objects的复杂状态管理
5. **进度追踪**：在D1中维护回测任务进度计数器，前端每2秒轮询即可

**补充建议：** 可将方案C作为优化方向——后续版本中将回测算法编译为WASM在Web Worker中运行，服务端仅负责数据提供和结果持久化，可大幅降低服务端成本。

#### 队列方案详细设计

```
┌─────────┐    ┌───────────┐    ┌──────────────┐    ┌────┐
│  前端    │───>│ 主Worker  │───>│ Queue        │───>│ D1 │
│ POST     │    │ 创建任务   │    │ 195条消息     │    │任务│
│ /backtest│    │ 拆分子任务 │    │ 每条1个策略   │    │记录│
└─────────┘    └───────────┘    └──────┬───────┘    └────┘
                                       │
                              ┌────────▼────────┐
                              │ Consumer Worker  │
                              │ 消费消息         │
                              │ 计算单策略结果    │
                              │ 写入annual_stats │
                              │ 更新进度计数器   │
                              └─────────────────┘
                                       │
                              全部完成后 ──> 汇总推荐策略 ──> 写入backtest_results
```

**分片策略：**
- 每条Queue消息 = 1个策略组合（1个跌幅阈值 × 1个卖出策略）
- 消费者处理：遍历该股票在回测区间内的所有交易日，计算年度统计
- 单次消费CPU估算：2400天 × 简单运算 ≈ 5-10ms ✅ 在30ms限制内
- 消费失败：Queue自动重试（默认3次，指数退避）

### 1.4 D1 容量规划

| 数据类型 | 单条大小 | 预估量 | 总大小 | 10GB占比 |
|----------|----------|--------|--------|----------|
| daily_quotes | ~200B | 500只×10年×240天=120万条 | ~240MB | 2.4% |
| backtest_annual_stats | ~200B | 1000次回测×1800条=180万条 | ~360MB | 3.6% |
| download_tasks | ~300B | 10000条 | ~3MB | <0.1% |
| 其他表 | - | - | ~10MB | <0.1% |
| **合计** | - | - | **~613MB** | **6.1%** |

**结论：D1 10GB限制在当前规模下（500只股票×10年数据）不是瓶颈。但需注意：**
1. backtest_annual_stats 增长最快（每次回测1800行），应限制单用户回测历史保留数量
2. 若扩展到2000只股票，daily_quotes将达~960MB，仍可控
3. 建议设置数据归档策略：超过2年的completed下载任务自动清理

### 1.5 Cron Trigger 可靠性评估

| 评估项 | 结论 |
|--------|------|
| 调度精度 | Cron Trigger精确到分钟级，满足"收盘后15:30触发"需求 |
| 执行保证 | 至少执行一次（at-least-once），需幂等设计 |
| 失败重试 | 不自动重试，需在Worker代码中实现重试逻辑 |
| 监控告警 | 无内置告警，需配合Workers Analytics或外部监控 |

**建议：**
1. Cron Worker中实现指数退避重试（1s/2s/4s/8s，最多4次，与PRD一致）
2. 持续失败时写入D1告警记录，前端管理员页面展示
3. 增加Cron执行日志表 `cron_logs`，记录每次执行时间和结果

---

## 2. 数据库设计评审

### 2.1 表结构评审

#### ✅ 合理设计

| 设计点 | 评价 |
|--------|------|
| 所有表使用TEXT主键 | ✅ D1无自增ID最佳实践，应用层生成ID合理 |
| ISO 8601日期格式 | ✅ 与SQLite datetime函数兼容 |
| daily_quotes的(stock_id, trade_date)唯一索引 | ✅ 防止重复数据，核心查询索引 |
| backtest_annual_stats的复合唯一索引 | ✅ 保证数据一致性 |
| ON DELETE CASCADE | ✅ 级联删除合理，避免孤儿数据 |

#### ⚠️ 需要修正

**问题1：缺少回测交易明细表**

PRD要求展示"资金曲线图"，data-model中只有年度汇总（backtest_annual_stats），缺少逐笔交易记录。

```sql
-- 建议新增：回测交易明细表
CREATE TABLE backtest_trades (
  id TEXT PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  trade_date TEXT NOT NULL,        -- 买入日期
  buy_price REAL NOT NULL,          -- 买入价（收盘价）
  sell_date TEXT,                   -- 卖出日期
  sell_price REAL,                  -- 卖出价
  sell_strategy TEXT,               -- 卖出策略
  profit REAL,                      -- 本次盈亏
  capital_after REAL,               -- 交易后资金
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (backtest_id) REFERENCES backtest_results(id) ON DELETE CASCADE
);

CREATE INDEX idx_trades_backtest_strategy ON backtest_trades(backtest_id, strategy_key);
CREATE INDEX idx_trades_date ON backtest_trades(backtest_id, strategy_key, trade_date);
```

**问题2：users表缺少安全字段**

```sql
-- 建议新增字段
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;  -- 强制修改密码标志
ALTER TABLE users ADD COLUMN last_login_at TEXT;                                -- 最后登录时间
ALTER TABLE users ADD COLUMN login_fail_count INTEGER NOT NULL DEFAULT 0;       -- 连续登录失败次数
ALTER TABLE users ADD COLUMN locked_until TEXT;                                 -- 锁定截止时间
```

**问题3：download_tasks缺少索引**

```sql
-- 建议新增索引
CREATE INDEX idx_download_user ON download_tasks(user_id);
CREATE INDEX idx_download_created ON download_tasks(created_at);
```

**问题4：stocks.created_by 外键约束过严**

如果ON DELETE行为为默认（RESTRICT），删除用户将导致其创建的股票无法删除。建议：
- 改为 `ON DELETE SET NULL`（删除用户时保留股票，created_by置空）
- 或不使用外键约束，仅作为逻辑关联

**问题5：market_indicators的UNIQUE约束可能过严**

```sql
UNIQUE(indicator_date, indicator_type, source)
```

这意味着同一日期、同一类型、不同来源的数据可以共存，但同一来源的同日数据会覆盖。这是合理的，但API设计中"手动触发温度抓取"接口可能因重复抓取触发UNIQUE约束冲突。建议使用 `INSERT OR REPLACE` 语义。

### 2.2 索引覆盖率评估

| 核心查询路径 | 涉及表 | 索引覆盖 | 评价 |
|-------------|--------|----------|------|
| 按股票+日期范围查行情 | daily_quotes | idx_quotes_stock_date | ✅ 覆盖 |
| 按状态筛选下载任务 | download_tasks | idx_download_status | ✅ 覆盖 |
| 按回测ID查年度统计 | backtest_annual_stats | idx_annual_backtest | ✅ 覆盖 |
| 按回测ID+策略查年度统计 | backtest_annual_stats | idx_annual_strategy | ✅ 覆盖 |
| 按股票查回测列表 | backtest_results | idx_backtest_stock | ✅ 覆盖 |
| 按用户查回测列表 | backtest_results | idx_backtest_user | ✅ 覆盖 |
| 按用户查下载任务 | download_tasks | ❌ 缺失 | ⚠️ 需新增 |
| 按日期范围查市场指标 | market_indicators | idx_indicator_type | ✅ 部分覆盖 |
| 行情按日期范围查询（仅日期） | daily_quotes | idx_quotes_trade_date | ✅ 覆盖 |

### 2.3 数据一致性风险

**风险1：回测年度资金连续性**

backtest_annual_stats中各年度的 start_capital / end_capital 需要严格连续（后一年start = 前一年end）。当前设计中，Queue分片计算时每个策略独立计算，需确保：
- 策略内各年度顺序计算（非并行），保证资金连续
- 建议在Consumer Worker中按策略内年度顺序处理，不拆分

**风险2：行情数据完整性**

回测依赖完整的日K线数据（无缺口）。当前设计中，下载任务可能因中断导致数据不完整。建议：
- 回测执行前校验行情数据完整性（检查交易日连续性）
- 缺失交易日给出明确提示，而非静默跳过

---

## 3. API 设计评审

### 3.1 RESTful 规范评审

| 评估项 | 当前设计 | 评价 | 建议 |
|--------|----------|------|------|
| 资源命名 | /api/stocks, /api/download/tasks | ✅ 复数名词 | - |
| HTTP方法 | GET/POST/PUT/DELETE | ✅ 语义正确 | - |
| 嵌套资源 | /api/download/tasks/:id/resume | ⚠️ resume是动作而非资源 | 改为POST /api/download/tasks/:id/resume 保持现状（务实选择） |
| 版本控制 | 无 | ⚠️ 缺失 | 建议增加 /api/v1/ 前缀 |
| 统一响应 | {code, message, data} | ✅ 规范 | - |

### 3.2 认证方案评审

**当前方案：JWT Bearer Token + localStorage + 7天有效期**

**问题1：无Refresh Token机制**

```
当前流程：登录 → 获取Token(7天) → 7天后过期 → 重新登录
```

**建议改造为双Token方案：**

```
改造流程：
1. 登录 → 获取AccessToken(30min) + RefreshToken(7天)
2. AccessToken过期 → 用RefreshToken换取新AccessToken
3. RefreshToken过期 → 重新登录
4. 登出 → 服务端吊销RefreshToken（黑名单或删除）

实现要点：
- AccessToken: 短期JWT，存HttpOnly Cookie，30分钟过期
- RefreshToken: 长期随机字符串，存HttpOnly Cookie + D1，7天过期
- /api/auth/refresh: 用RefreshToken换新AccessToken
- /api/auth/logout: 删除D1中的RefreshToken，清除Cookie
```

**问题2：JWT存储位置**

当前方案存储在localStorage，存在XSS攻击窃取风险。详见安全评审报告。

**问题3：缺少登录安全防护**

- 无登录失败次数限制（暴力破解风险）
- 无验证码/人机验证
- 无IP频率限制

**建议新增表和接口：**

```sql
-- RefreshToken存储
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
```

### 3.3 回测接口异步设计评审

**当前方案：POST创建 → 前端轮询GET结果**

结合Queue分片计算方案，建议改造：

```
POST /api/backtest          → 创建回测任务，返回 {id, status: "queued"}
GET  /api/backtest/:id      → 获取回测状态和结果（含进度百分比）
GET  /api/backtest/:id/annual    → 年度统计
GET  /api/backtest/:id/comparison → 策略对比
GET  /api/backtest/:id/capital-curve → 资金曲线
```

**进度轮询优化：**
- 前端每2秒轮询 `GET /api/backtest/:id`
- 响应中增加 `progress` 字段（已完成子任务数/总子任务数）
- 增加策略级别的完成状态（部分结果可先展示）
- 建议未来版本支持SSE（Server-Sent Events）推送进度

### 3.4 缺失的API接口

| 缺失接口 | 说明 | 优先级 |
|----------|------|--------|
| POST /api/auth/refresh | 刷新AccessToken | P0 |
| PUT /api/auth/password | 修改密码（含强制修改） | P0 |
| GET /api/stocks/:id | 单个股票详情 | P1 |
| DELETE /api/backtest/:id | 删除回测记录 | P1 |
| GET /api/download/tasks/:id | 单个下载任务详情（已在spec中但未在路由表体现） | P1 |
| GET /api/market/temperature/latest | 仅获取最新温度（减少数据传输） | P2 |

### 3.5 API安全性补充

**需增加的中间件：**

1. **Rate Limiting**：使用Cloudflare内置的Rate Limiting或Workers KV实现
   - 登录接口：5次/分钟/IP
   - 回测接口：3次/分钟/用户
   - 通用API：60次/分钟/用户

2. **CORS配置**：
   ```
   Access-Control-Allow-Origin: https://slowerich.pages.dev (生产)
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE
   Access-Control-Allow-Credentials: true (配合Cookie)
   ```

3. **请求体大小限制**：Workers默认100MB，建议限制为1MB

---

## 4. 数据源方案评审

### 4.1 AKShare + Tushare 方案评估

| 评估维度 | AKShare | Tushare |
|----------|---------|---------|
| 数据质量 | 中（社区维护，偶有缺失） | 高（专业团队维护） |
| 接口稳定性 | ⚠️ 低（Python包更新频繁，接口可能变更） | ✅ 高（API版本化，长期稳定） |
| 认证方式 | 无需Token | 需Token，有积分权限体系 |
| 频率限制 | 无明确限制（但不建议高频） | 有积分限制，200次/分钟（5000积分） |
| A股日K线 | ✅ ak.stock_zh_a_hist() | ✅ daily() |
| 数据延迟 | 当日数据T+1 | 当日数据T+1 |
| 退市股票 | ✅ 支持 | ✅ 支持 |

### 4.2 主备切换逻辑评审

**当前设计：** AKShare失败时自动切换Tushare重试

**问题1：AKShare是Python库，Workers是JavaScript运行时**

这是一个**重大架构问题**。AKShare和Tushare都是Python库，无法直接在Cloudflare Workers（V8/JavaScript运行时）中调用。

**解决方案：**

| 方案 | 说明 | 评价 |
|------|------|------|
| A: 外部Python服务 | 部署一个独立的Python服务（如VPS/Render/Railway），提供REST API给Workers调用 | ✅ 可行，但增加架构复杂度和成本 |
| B: 纯HTTP数据源 | 放弃AKShare/Tushare Python库，改用直接HTTP请求获取数据 | ✅ 推荐，见下方详细说明 |
| C: Pyodide in Workers | 使用Pyodide（Python in WASM）在Workers中运行Python | ⚠️ 脚本体积大(>10MB)，超出Workers限制 |

**🏆 推荐方案B：纯HTTP数据源**

直接通过HTTP请求获取A股日K线数据，无需依赖Python库：

| 数据源 | HTTP接口 | 说明 |
|--------|----------|------|
| 新浪财经 | `https://finance.sina.com.cn/realstock/company/{code}/hisdata/klc_kl.js` | 免费，无需认证，格式需解析 |
| 腾讯财经 | `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,,,,{count},,` | 免费，无需认证，JSON格式 |
| 东方财富 | `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={market}.{code}&fields1=...&fields2=...&klt=101&fqt=0&beg={start}&end={end}` | 免费，无需认证，JSON格式，**推荐** |

**推荐东方财富数据源理由：**
1. 纯HTTP请求，Workers可直接调用
2. 无需认证Token，无频率限制（合理使用）
3. JSON格式返回，解析简单
4. 支持日期范围查询，减少请求次数
5. 数据质量与AKShare/Tushare相当（部分数据源就是东方财富）

**备用方案：** Tushare Pro HTTP API
- `https://api.tushare.pro` 支持HTTP POST请求
- 需Token，有积分限制
- 适合作为东方财富不可用时的备选

**主备切换改造：**
```
主数据源：东方财富HTTP API（免费、无认证、JSON格式）
备数据源：Tushare Pro HTTP API（需Token、有积分限制）
切换逻辑：主源请求失败（超时/HTTP错误/数据异常）→ 切换Tushare重试
```

### 4.3 断点续传实现评审

**当前设计：** 检查D1中已有数据的最后日期，从下一个交易日开始

**实现要点：**
1. 查询 `SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = ?`
2. 从该日期的下一个交易日开始下载
3. 需要交易日历判断（跳过周末和法定节假日）

**问题：缺少交易日历表**

```sql
-- 建议新增：交易日历表
CREATE TABLE trade_calendar (
  trade_date TEXT PRIMARY KEY,     -- 交易日期
  is_open INTEGER NOT NULL DEFAULT 1,  -- 是否交易日
  year INTEGER NOT NULL,           -- 年份（便于查询）
  month INTEGER NOT NULL           -- 月份
);
CREATE INDEX idx_calendar_year ON trade_calendar(year);
```

数据来源：东方财富交易日历接口或交易所官方日历。

### 4.4 数据格式统一映射

**东方财富字段映射：**

| 东方财富字段 | 标准字段 | 说明 |
|-------------|----------|------|
| 开盘 | open | 直接映射 |
| 收盘 | close | 直接映射 |
| 最高 | high | 直接映射 |
| 最低 | low | 直接映射 |
| 成交量 | volume | 需注意单位（股/手） |
| 成交额 | amt | 需注意单位（元/万元） |
| 涨跌幅 | pct_chg | 直接映射 |
| 前收盘 | pre_close | 需从上一日close获取 |

**Tushare字段映射：**

| Tushare字段 | 标准字段 | 说明 |
|-------------|----------|------|
| open | open | 直接映射 |
| close | close | 直接映射 |
| high | high | 直接映射 |
| low | low | 直接映射 |
| vol | volume | Tushare单位为手，需×100 |
| amount | amt | Tushare单位为千元，需×1000 |
| pct_chg | pct_chg | 直接映射 |
| pre_close | pre_close | 直接映射 |

**建议：** 在Workers中实现统一的DataAdapter层，封装不同数据源的字段映射和单位转换。

---

## 5. 回测算法架构评审

### 5.1 算法正确性评审

#### 规则1：触发条件

> 当日收盘跌幅 ≥ 本轮跌幅阈值时，以收盘价买入（全仓）

**评审意见：**
- ✅ 收盘价买入是合理的假设（与实际交易接近）
- ⚠️ "全仓"策略风险极高——实际交易中不可能每次都全仓，建议增加仓位管理参数（如每次固定投入金额/比例）
- ⚠️ 未考虑涨跌停限制——A股涨跌停板制度下，跌停时可能无法买入
- ⚠️ 未考虑交易成本——佣金(万2.5) + 印花税(卖出千1) + 过户费，对收益影响显著

**建议：** 增加交易成本参数（默认佣金万2.5 + 印花税千1），使回测更接近真实收益。

#### 规则2：卖出策略A - 次日收盘卖出

- ✅ 逻辑简单清晰
- ⚠️ 未考虑T+1限制——A股T+1制度下，当日买入次日才能卖出，次日收盘卖出是合法的最早时间点

#### 规则3：卖出策略B - 盘中浮盈卖出

> 当盘中涨幅达到目标浮盈时卖出（以当日最高价模拟盘中价），若未达目标则收盘价卖出

**评审意见：**
- ⚠️ **前视偏差（Look-ahead Bias）**：使用最高价模拟卖出价存在严重的前视偏差。实际交易中，投资者无法预知当日最高价，也无法保证在最高价成交。
- ⚠️ 更合理的假设：使用均价或开盘价+一定滑点模拟盘中成交
- ⚠️ 或者增加"盘中浮盈卖出"的模拟方式说明，明确标注为乐观估计

**建议：**
1. 将"最高价卖出"改为"均价卖出"（更保守但更接近实际）
2. 或保持最高价卖出，但在结果页面明确标注"使用最高价模拟，实际收益可能低于回测结果"
3. 增加滑点参数（默认0.1%），模拟买卖价差

### 5.2 综合评分公式评审

> 综合评分 = 年化收益率 × 40% + 胜率 × 30% + (1 - 最大回撤) × 30%

**问题：量纲不一致**

- 年化收益率：范围可能是 -50% ~ 100%（负值时公式无意义）
- 胜率：0% ~ 100%
- (1 - 最大回撤)：最大回撤0% ~ 100%，(1-最大回撤) = 0 ~ 1

三者量纲不同，直接加权会导致年化收益率对结果的支配性影响。

**建议改造：**

```
综合评分 = 收益评分 × 40% + 胜率评分 × 30% + 回撤评分 × 30%

其中：
- 收益评分 = max(0, min(1, (年化收益率 - 最小收益率) / (最大收益率 - 最小收益率)))
  （归一化到0-1区间）
- 胜率评分 = 胜率 / 100
- 回撤评分 = max(0, 1 - 最大回撤 / 100)
```

这样各项评分均在0-1区间，加权后综合评分也在0-1区间，且可跨策略横向比较。

### 5.3 计算复杂度与Queue分片可行性

| 参数 | 值 |
|------|-----|
| 策略组合数 | 15跌幅 × 13卖出 = 195 |
| 每策略遍历天数 | 10年 × 240天 = 2400 |
| 每天计算量 | ~10次浮点运算（比较+赋值） |
| 单策略CPU时间 | 2400 × 10 / 10^9 × 1GHz ≈ 0.024ms |
| 单Queue消息CPU | 0.024ms ✅ 远低于30ms限制 |
| 总计算CPU | 195 × 0.024ms ≈ 4.7ms |

**结论：Queue分片方案完全可行，单策略计算CPU消耗远低于Workers限制。**

### 5.4 资金曲线生成

当前设计仅有年度汇总数据，无法生成精确的资金曲线。需要回测交易明细表（见2.2节建议）。

**资金曲线生成逻辑：**
1. 从backtest_trades按日期排序读取交易记录
2. 初始资金 → 逐笔应用盈亏 → 生成每日资金值
3. 聚合为年度资金点（用于折线图）

---

## 6. 文档交叉一致性校验

### 6.1 PRD ↔ API Spec 不一致项

| # | PRD描述 | API Spec | 问题 | 建议 |
|---|---------|----------|------|------|
| 1 | M6: "每个交易日收盘后自动抓取" | API无Cron相关接口 | 缺少Cron状态查询接口 | 增加GET /api/admin/cron-status |
| 2 | M2: "支持按代码/名称模糊搜索" | GET /api/stocks?search= | ✅ 一致 | - |
| 3 | M3: "时间区间 ≤ 5年" | POST /api/download/tasks 无校验说明 | API层需增加校验 | 接口文档补充校验规则 |
| 4 | M5: "回测计算 < 30s" | 无超时设计 | Queue方案下回测可能超过30s | 改为"回测排队+计算总时长 < 60s" |
| 5 | M1: "Token有效期7天" | 无Refresh Token | 需增加 | 见3.2节改造建议 |

### 6.2 API Spec ↔ Data Model 不一致项

| # | API Spec | Data Model | 问题 | 建议 |
|---|----------|------------|------|------|
| 1 | 回测响应含stock_name | backtest_results无stock_name字段 | 需JOIN stocks表或冗余字段 | 建议冗余stock_name到backtest_results |
| 2 | 下载任务含stock_name | download_tasks无stock_name字段 | 同上 | 建议冗余stock_name |
| 3 | /api/auth/me返回created_at | users表有created_at | ✅ 一致 | - |
| 4 | 资金曲线接口返回年度资金 | 无backtest_trades表 | 数据来源缺失 | 见2.2节建议 |

---

## 7. 改进建议汇总

### P0 - 必须在开发前解决

| # | 问题 | 建议 | 影响模块 |
|---|------|------|----------|
| 1 | 回测计算超出Workers CPU限制 | 采用Queue分片计算方案 | M5 |
| 2 | 数据源是Python库，Workers无法调用 | 改用东方财富HTTP API + Tushare HTTP API | M3 |
| 3 | JWT localStorage XSS风险 | 改用HttpOnly Cookie + Refresh Token | M1 |

### P1 - 建议在第一阶段解决

| # | 问题 | 建议 | 影响模块 |
|---|------|------|----------|
| 4 | 默认管理员弱密码 | 首次登录强制修改密码 | M1 |
| 5 | 缺少回测交易明细表 | 新增backtest_trades表 | M5 |
| 6 | 缺少Refresh Token机制 | 双Token方案 | M1 |
| 7 | 综合评分公式量纲不一致 | 归一化到0-1区间 | M5 |
| 8 | 回测算法前视偏差 | 标注风险或改用均价 | M5 |
| 9 | 缺少交易日历表 | 新增trade_calendar表 | M3 |
| 10 | 缺少登录安全防护 | 限制失败次数+IP限流 | M1 |

### P2 - 可在后续迭代解决

| # | 问题 | 建议 | 影响模块 |
|---|------|------|----------|
| 11 | API缺少版本控制 | 增加 /api/v1/ 前缀 | 全局 |
| 12 | 缺少交易成本参数 | 增加佣金/印花税参数 | M5 |
| 13 | 集思录爬虫合规风险 | 评估官方API或用户上传 | M6 |
| 14 | D1批量写入并发 | 分批100条/事务 + Queue | M3 |
| 15 | 回测进度SSE推送 | 后续版本支持 | M5 |

---

*评审报告结束。配套文档：[安全评审报告](./security-review.md)、[风险登记表](./risk-register.md)*
