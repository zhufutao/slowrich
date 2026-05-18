# 慢富(SlowRich) 接口定义文档

> 版本：v1.0 | 日期：2026-05-17 | 作者：产品经理

---

## 1. 通用规范

### 1.1 基础信息

- 基础路径：`/api`
- 协议：HTTPS
- 认证方式：JWT Bearer Token（Header: `Authorization: Bearer <token>`）
- 内容类型：`application/json`

### 1.2 统一响应格式

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

**错误响应：**
```json
{
  "code": 40001,
  "message": "邮箱已注册",
  "data": null
}
```

### 1.3 分页规范

**请求参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | integer | 1 | 页码（从1开始） |
| page_size | integer | 20 | 每页条数（最大100） |

**分页响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 150,
    "page": 1,
    "page_size": 20,
    "total_pages": 8
  }
}
```

### 1.4 错误码规范

#### 通用错误码（1xxxx）

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 10001 | 未知错误 |
| 10002 | 请求参数错误 |
| 10003 | 请求频率超限 |
| 10004 | 服务器内部错误 |

#### 认证错误码（2xxxx）

| 错误码 | 说明 |
|--------|------|
| 20001 | 未登录/Token无效 |
| 20002 | Token已过期 |
| 20003 | 权限不足 |
| 20004 | 邮箱或密码错误 |
| 20005 | 邮箱已注册 |

#### 业务错误码（3xxxx）

| 错误码 | 说明 |
|--------|------|
| 30001 | 股票代码已存在 |
| 30002 | 股票代码不存在 |
| 30003 | 股票代码格式无效 |
| 30004 | 行情数据不存在 |
| 30005 | 下载任务不存在 |
| 30006 | 数据源不可用(DATA_SOURCE_UNAVAILABLE) |
| 30007 | 请求频率超限(RATE_LIMITED) |
| 30008 | 股票代码无效或已退市(STOCK_CODE_INVALID) |
| 30009 | 网络错误(NETWORK_ERROR) |
| 30010 | 回测参数无效 |
| 30011 | 回测任务不存在 |
| 30012 | 日期区间无效 |
| 30013 | 回测计算失败 |

---

## 2. M1 账号登录注册系统

### 2.1 用户注册

**POST** `/api/auth/register`

请求：
```json
{
  "email": "user@example.com",
  "password": "123456",
  "confirm_password": "123456"
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "u_abc123",
      "email": "user@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 2.2 用户登录

**POST** `/api/auth/login`

请求：
```json
{
  "email": "admin@666",
  "password": "666666"
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "u_admin001",
      "email": "admin@666",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 2.3 用户登出

**POST** `/api/auth/logout`

请求：无

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": null
}
```

### 2.4 获取当前用户信息

**GET** `/api/auth/me`

请求：无（需Token）

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "u_admin001",
    "email": "admin@666",
    "role": "admin",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

---

## 3. M2 股票代码管理

### 3.1 股票列表

**GET** `/api/stocks?page=1&page_size=20&search=招商`

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "s_001",
        "code": "600036",
        "name": "招商银行",
        "market": "SH",
        "created_by": "u_admin001",
        "created_at": "2026-05-01T10:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

### 3.2 新增股票

**POST** `/api/stocks`

请求（需管理员权限）：
```json
{
  "code": "600036",
  "name": "招商银行",
  "market": "SH"
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "s_001",
    "code": "600036",
    "name": "招商银行",
    "market": "SH",
    "created_by": "u_admin001",
    "created_at": "2026-05-01T10:00:00Z"
  }
}
```

### 3.3 修改股票

**PUT** `/api/stocks/:id`

请求（需管理员权限）：
```json
{
  "name": "招商银行(更新)",
  "market": "SH"
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "s_001",
    "code": "600036",
    "name": "招商银行(更新)",
    "market": "SH",
    "created_by": "u_admin001",
    "created_at": "2026-05-01T10:00:00Z"
  }
}
```

### 3.4 删除股票

**DELETE** `/api/stocks/:id`

请求（需管理员权限）：无

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": null
}
```

---

## 4. M3 数据下载引擎

### 4.1 创建下载任务

**POST** `/api/download/tasks`

请求：
```json
{
  "stock_id": "s_001",
  "start_date": "2020-01-01",
  "end_date": "2025-12-31",
  "data_source": "auto"
}
```

`data_source` 可选值：`auto`(自动选择) / `akshare` / `tushare`

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "dt_001",
    "stock_id": "s_001",
    "stock_name": "招商银行",
    "start_date": "2020-01-01",
    "end_date": "2025-12-31",
    "data_source": "akshare",
    "status": "pending",
    "progress": 0,
    "error_msg": null,
    "created_at": "2026-05-17T09:00:00Z"
  }
}
```

### 4.2 下载任务列表

**GET** `/api/download/tasks?page=1&page_size=20&status=running`

`status` 可选值：pending / running / completed / failed / partial

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "dt_001",
        "stock_id": "s_001",
        "stock_name": "招商银行",
        "start_date": "2020-01-01",
        "end_date": "2025-12-31",
        "data_source": "akshare",
        "status": "running",
        "progress": 45,
        "downloaded_days": 675,
        "total_days": 1500,
        "error_msg": null,
        "created_at": "2026-05-17T09:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

### 4.3 获取单个下载任务

**GET** `/api/download/tasks/:id`

响应同上单个任务对象。

### 4.4 断点续传

**POST** `/api/download/tasks/:id/resume`

请求：
```json
{
  "data_source": "auto"
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "dt_001",
    "status": "running",
    "progress": 45,
    "resume_from": "2022-06-15"
  }
}
```

### 4.5 重试下载

**POST** `/api/download/tasks/:id/retry`

请求：
```json
{
  "data_source": "tushare"
}
```

响应同断点续传。

---

## 5. M4 行情数据查看

### 5.1 查询行情数据

**GET** `/api/quotes/:stock_id?start_date=2024-01-01&end_date=2024-12-31&page=1&page_size=20`

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "trade_date": "2024-01-02",
        "open": 32.50,
        "high": 33.10,
        "low": 32.20,
        "close": 32.80,
        "pre_close": 32.45,
        "pct_chg": 1.08,
        "volume": 58230000,
        "amt": 1902345000.00
      }
    ],
    "total": 242,
    "page": 1,
    "page_size": 20,
    "total_pages": 13
  }
}
```

---

## 6. M5 策略回测

### 6.1 发起回测

**POST** `/api/backtest`

请求：
```json
{
  "stock_id": "s_001",
  "initial_capital": 100000,
  "start_date": "2015-01-01",
  "end_date": "2024-12-31",
  "dip_threshold_start": 3.0,
  "dip_threshold_end": 10.0,
  "dip_threshold_step": 0.5,
  "sell_next_day": true,
  "profit_take_start": 5.0,
  "profit_take_end": 10.0,
  "profit_take_step": 0.5
}
```

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "bt_001",
    "status": "running",
    "message": "回测计算中，请稍候"
  }
}
```

### 6.2 获取回测结果

**GET** `/api/backtest/:id`

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "bt_001",
    "stock_id": "s_001",
    "stock_name": "招商银行",
    "initial_capital": 100000,
    "start_date": "2015-01-01",
    "end_date": "2024-12-31",
    "status": "completed",
    "params": {
      "dip_threshold_start": 3.0,
      "dip_threshold_end": 10.0,
      "dip_threshold_step": 0.5,
      "sell_next_day": true,
      "profit_take_start": 5.0,
      "profit_take_end": 10.0,
      "profit_take_step": 0.5
    },
    "recommendations": {
      "gold": {
        "dip_threshold": 5.0,
        "sell_strategy": "profit_take_7.0",
        "composite_score": 0.72,
        "avg_annual_return": 12.5,
        "avg_win_rate": 58.3,
        "avg_max_drawdown": 15.2
      },
      "silver": {
        "dip_threshold": 4.0,
        "sell_strategy": "next_day_close",
        "composite_score": 0.65,
        "avg_annual_return": 9.8,
        "avg_win_rate": 55.1,
        "avg_max_drawdown": 18.5
      },
      "bronze": {
        "dip_threshold": 6.0,
        "sell_strategy": "profit_take_8.0",
        "composite_score": 0.58,
        "avg_annual_return": 7.2,
        "avg_win_rate": 48.6,
        "avg_max_drawdown": 22.1
      }
    }
  }
}
```

### 6.3 获取年度统计

**GET** `/api/backtest/:id/annual?dip_threshold=5.0&sell_strategy=profit_take_7.0`

`dip_threshold` 和 `sell_strategy` 为可选筛选参数，不传则返回所有策略组合的年度统计。

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "strategy_key": "dip_5.0_profit_take_7.0",
    "annual_stats": [
      {
        "year": 2015,
        "trigger_count": 18,
        "annual_return": 15.6,
        "win_rate": 61.1,
        "win_count": 11,
        "loss_count": 7,
        "max_drawdown": 12.3,
        "market_env": "震荡市",
        "start_capital": 100000.00,
        "end_capital": 115600.00,
        "annual_profit": 15600.00
      },
      {
        "year": 2016,
        "trigger_count": 22,
        "annual_return": -3.2,
        "win_rate": 40.9,
        "win_count": 9,
        "loss_count": 13,
        "max_drawdown": 25.1,
        "market_env": "熊市",
        "start_capital": 115600.00,
        "end_capital": 111905.28,
        "annual_profit": -3694.72
      }
    ]
  }
}
```

### 6.4 获取策略对比

**GET** `/api/backtest/:id/comparison`

返回所有策略组合的汇总统计，用于对比表展示。

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "strategies": [
      {
        "strategy_key": "dip_3.0_next_day_close",
        "dip_threshold": 3.0,
        "sell_strategy": "next_day_close",
        "sell_strategy_label": "次日收盘卖出",
        "avg_annual_return": 8.5,
        "avg_win_rate": 52.3,
        "avg_max_drawdown": 20.1,
        "total_triggers": 245,
        "composite_score": 0.61
      },
      {
        "strategy_key": "dip_3.0_profit_take_5.0",
        "dip_threshold": 3.0,
        "sell_strategy": "profit_take_5.0",
        "sell_strategy_label": "浮盈5.0%卖出",
        "avg_annual_return": 10.2,
        "avg_win_rate": 55.6,
        "avg_max_drawdown": 18.3,
        "total_triggers": 245,
        "composite_score": 0.66
      }
    ]
  }
}
```

### 6.5 获取资金曲线

**GET** `/api/backtest/:id/capital-curve?dip_threshold=5.0&sell_strategy=profit_take_7.0`

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "strategy_key": "dip_5.0_profit_take_7.0",
    "initial_capital": 100000,
    "curve": [
      { "year": 2015, "end_capital": 115600.00 },
      { "year": 2016, "end_capital": 111905.28 },
      { "year": 2017, "end_capital": 128691.07 }
    ]
  }
}
```

---

## 7. M6 大盘见顶指标

### 7.1 获取市场温度

**GET** `/api/market/temperature?days=365`

`days`：返回最近N天的数据，默认365。

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "current": {
      "date": "2026-05-16",
      "value": 35.2,
      "level": "适中",
      "percentile": 42.5
    },
    "history": [
      {
        "date": "2026-05-15",
        "value": 34.8
      },
      {
        "date": "2026-05-14",
        "value": 36.1
      }
    ]
  }
}
```

### 7.2 手动触发温度抓取

**POST** `/api/market/temperature/fetch`

请求（需管理员权限）：无

响应：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "date": "2026-05-16",
    "value": 35.2,
    "source": "jisilu",
    "fetched_at": "2026-05-17T09:00:00Z"
  }
}
```

---

*文档结束。配套文档：[PRD](./PRD.md)、[数据模型](./data-model.md)*
