# 慢富 (SlowRich)

A股策略回测平台 — 跌幅抄底 + 浮盈卖出遍历，集思录温度大盘见顶指标。

## 项目结构

- `server/` — 后端 API (Hono + Cloudflare Workers + D1)
- `client/` — 前端界面 (Vite + React 19 + TailwindCSS v4 + Recharts)
- `docs-prd/` — 产品需求文档、API规范、数据模型
- `docs-arch/` — 架构评审、安全评审、风险登记

## 技术栈

- **后端**: Hono, Cloudflare Workers, D1, Queue
- **前端**: Vite, React 19, TailwindCSS v4, Recharts
- **数据源**: 东方财富 HTTP API (主), Tushare Pro (备)
- **部署**: Cloudflare Workers + Cloudflare Pages

## 快速开始

### 后端
```bash
cd server
npm install
npx wrangler dev
```

### 前端
```bash
cd client
npm install
npm run dev
```

## 部署

- 后端: `cd server && npx wrangler deploy`
- 前端: `cd client && npx wrangler pages deploy dist`

## License

MIT
