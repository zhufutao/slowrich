# 慢富(SlowRich) 后端API文档

> 版本：v1.0 | 日期：2026-05-17 | 作者：后端架构师

---

## 1. 部署架构

```
┌────────────────────────────────────────────────────────────────┐
│                      Cloudflare Workers                        │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Hono    │  │  Queue   │  │  Cron    │  │  D1 Database │  │
│  │  API     │  │Consumer  │  │  Worker  │  │  (SQLite)    │  │
│  │  Server  │  │(回测)    │  │(温度)    │  │              │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │             │             │                │          │
│       │    ┌────────▼────────┐    │                │          │
│       │    │ Cloudflare Queue│    │                │          │
│       │    │ (backtest-queue)│    │                │          │
│       │    └─────────────────┘    │                │          │
└───────┼───────────────────────────┼────────────────┼──────────┘
        │                           │                │
        ▼                           ▼                ▼
┌───────────────┐         ┌─────────────────┐  ┌──────────┐
│ 东方财富HTTP  │         │ 东方财富HTTP    │  │  D1 API  │
│ (行情数据源)  │         │ (市场估值)      │  │          │
└───────────────┘         └─────────────────┘  └──────────┘
```

## 2. 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 运行时 | Cloudflare Workers | Serverless API |
| 框架 | Hono v4 | 轻量级Web框架 |
| 数据库 | Cloudflare D1 (SQLite) | 边缘数据库 |
| 回测计算 | Cloudflare Queue + 分片 | 195个策略×Queue消息 |
| 定时任务 | Workers Cron Trigger | 每交易日15:30 |
| 数据源 | 东方财富HTTP(主)+Tushare HTTP(备) | 纯HTTP请求 |
| 认证 | HttpOnly Cookie + 双Token | AccessToken(30min) + RefreshToken(7天) |

## 3. 项目结构

```
slowerich-backend/
├── src/
│   ├── index.ts                    # 应用入口
│   ├── types/
│   │   └── index.ts                # 共享类型定义
│   ├── utils/
│   │   └── index.ts                # 工具函数
│   ├── middleware/
│   │   ├── auth.ts                 # JWT认证+管理员权限
│   │   └── rate-limit.ts           # 速率限制+CSRF
│   ├── routes/
│   │   ├── auth.ts                 # /api/v1/auth/*
│   │   ├── stocks.ts               # /api/v1/stocks/*
│   │   ├── download.ts             # /api/v1/download/*
│   │   ├── quotes.ts               # /api/v1/quotes/*
│   │   ├── backtest.ts             # /api/v1/backtest/*
│   │   └── market.ts               # /api/v1/market/*
│   ├── services/
│   │   ├── auth.ts                 # 认证业务逻辑
│   │   ├── stock.ts                # 股票管理逻辑
│   │   ├── download.ts             # 数据下载引擎
│   │   ├── quote.ts                # 行情查询逻辑
│   │   ├── backtest.ts             # 回测任务管理
│   │   └── market.ts               # 大盘指标逻辑
│   ├── datasources/
│   │   ├── eastmoney.ts            # 东方财富数据源
│   │   ├── tushare.ts              # Tushare数据源
│   │   └── adapter.ts              # 统一DataAdapter层
│   ├── engine/
│   │   ├── backtest.ts             # 回测算法核心
│   │   └── scoring.ts              # 综合评分算法
│   ├── workers/
│   │   ├── backtest-consumer.ts    # Queue消费者
│   │   └── cron-market.ts          # Cron Worker
│   └── db/
│       ├── schema.sql              # 建表SQL
│       └── seed.sql                # 初始数据
├── wrangler.toml                   # Workers配置
├── package.json
└── tsconfig.json
```

## 4. API接口总览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/v1/auth/register | 用户注册 | 无 |
| POST | /api/v1/auth/login | 用户登录 | 无 |
| POST | /api/v1/auth/logout | 用户登出 | 必须 |
| POST | /api/v1/auth/refresh | 刷新Token | Cookie |
| PUT | /api/v1/auth/password | 修改密码 | 必须 |
| GET | /api/v1/auth/me | 当前用户 | 必须 |
| GET | /api/v1/stocks | 股票列表 | 必须 |
| GET | /api/v1/stocks/:id | 股票详情 | 必须 |
| POST | /api/v1/stocks | 新增股票 | 管理员 |
| PUT | /api/v1/stocks/:id | 修改股票 | 管理员 |
| DELETE | /api/v1/stocks/:id | 删除股票 | 管理员 |
| POST | /api/v1/download/tasks | 创建下载任务 | 必须 |
| GET | /api/v1/download/tasks | 下载任务列表 | 必须 |
| GET | /api/v1/download/tasks/:id | 下载任务详情 | 必须 |
| POST | /api/v1/download/tasks/:id/resume | 断点续传 | 必须 |
| POST | /api/v1/download/tasks/:id/retry | 重试下载 | 必须 |
| GET | /api/v1/quotes/:stock_id | 行情数据查询 | 必须 |
| POST | /api/v1/backtest | 发起回测 | 必须 |
| GET | /api/v1/backtest/:id | 回测结果 | 必须 |
| GET | /api/v1/backtest/:id/annual | 年度统计 | 必须 |
| GET | /api/v1/backtest/:id/comparison | 策略对比 | 必须 |
| GET | /api/v1/backtest/:id/capital-curve | 资金曲线 | 必须 |
| DELETE | /api/v1/backtest/:id | 删除回测 | 必须 |
| GET | /api/v1/market/temperature | 市场温度 | 必须 |
| POST | /api/v1/market/temperature/fetch | 手动抓取温度 | 管理员 |

## 5. 关键设计决策

### 5.1 回测Queue分片方案
- 每个策略组合 = 1条Queue消息
- 15跌幅 × 13卖出策略 = 195条消息
- 单策略CPU ≈ 0.024ms，远低于30ms限制
- Queue自动重试（3次，指数退避）
- **幂等处理**：消费者先检查是否已有结果，避免重复消息导致结果重复写入
- 前端每2秒轮询进度

### 5.2 数据源主备切换
- 主：东方财富HTTP API（免费、无需认证）
- 备：Tushare Pro HTTP API（需Token、有积分限制）
- 统一DataAdapter层处理字段映射和单位转换
- 指数退避重试（1s/2s/4s，最多3次）
- **主备切换状态提示**：FetchResult包含fallback/fallbackFrom/fallbackReason字段，前端可展示"已自动切换至备用数据源"提示
- **切换日志记录**：Console日志记录切换过程，下载任务的error_msg字段记录切换信息

### 5.3 认证安全
- HttpOnly Cookie存储Token（防XSS）
- AccessToken 30分钟 + RefreshToken 7天
- SameSite=Strict（防CSRF）
- 登录失败5次锁定30分钟
- 首次登录强制修改默认密码

### 5.4 回测算法
- 交易成本：佣金万2.5 + 印花税千1（**用户可在创建回测时自定义**commission_rate/stamp_tax_rate参数）
- 浮盈卖出用最高价模拟（页面标注"乐观估计"）
- 综合评分归一化到0-1区间
- 新增backtest_trades表存储交易明细

### 5.5 市场温度
- 自行计算方案（基于东方财富PE/PB百分位）
- **3年滚动窗口**计算PE百分位，数据不足时使用已有数据
- API响应中标注calculation_method和window_years字段
- Cron每日15:30自动抓取
- 失败指数退避重试（最多4次）

## 6. 部署步骤

```bash
# 1. 安装依赖
npm install

# 2. 创建D1数据库
wrangler d1 create slowerich-db

# 3. 更新wrangler.toml中的database_id

# 4. 执行建表SQL
wrangler d1 execute slowerich-db --file=src/db/schema.sql

# 5. 插入初始数据
wrangler d1 execute slowerich-db --file=src/db/seed.sql

# 6. 配置Secrets
wrangler secret put JWT_SECRET
wrangler secret put REFRESH_TOKEN_SECRET
wrangler secret put TUSHARE_TOKEN
wrangler secret put CSRF_SECRET

# 7. 部署
wrangler deploy
```
