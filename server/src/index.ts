// ============================================
// 慢富(SlowRich) - 后端API服务入口
// Cloudflare Workers + Hono
// ============================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env, ErrorCodes, BacktestQueueMessage } from './types';
import { error } from './utils';

// 路由模块
import authRoutes from './routes/auth';
import stockRoutes from './routes/stocks';
import downloadRoutes from './routes/download';
import quoteRoutes from './routes/quotes';
import backtestRoutes from './routes/backtest';
import marketRoutes from './routes/market';

// 创建Hono应用
const app = new Hono<{ Bindings: Env }>();

// ============================================
// 全局中间件
// ============================================

// 请求日志
app.use('*', logger());

// CORS配置
app.use('/api/*', async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => {
      // 允许前端域名
      const allowed = [
        c.env.FRONTEND_URL,
        'https://slowerich.pages.dev',
        'http://localhost:5173',
        'http://localhost:3000',
      ];
      if (!origin || allowed.includes(origin)) return origin;
      return '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// 安全头
app.use('/api/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  const isDev = c.env.ENVIRONMENT === 'development';
  if (!isDev) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

// 请求体大小限制
app.use('/api/*', async (c, next) => {
  const contentType = c.req.header('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const contentLength = parseInt(c.req.header('Content-Length') || '0');
    if (contentLength > 1024 * 1024) { // 1MB限制
      return c.json(error(ErrorCodes.INVALID_PARAMS, '请求体过大'), 413);
    }
  }
  await next();
});

// ============================================
// 健康检查
// ============================================

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// API路由注册（v1版本）
// ============================================

app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/stocks', stockRoutes);
app.route('/api/v1/download', downloadRoutes);
app.route('/api/v1/quotes', quoteRoutes);
app.route('/api/v1/backtest', backtestRoutes);
app.route('/api/v1/market', marketRoutes);

// ============================================
// 兼容旧路径（无版本号）
// ============================================

app.route('/api/auth', authRoutes);
app.route('/api/stocks', stockRoutes);
app.route('/api/download', downloadRoutes);
app.route('/api/quotes', quoteRoutes);
app.route('/api/backtest', backtestRoutes);
app.route('/api/market', marketRoutes);

// ============================================
// 404处理
// ============================================

app.notFound((c) => {
  return c.json(error(ErrorCodes.INVALID_PARAMS, '接口不存在'), 404);
});

// ============================================
// 全局错误处理
// ============================================

app.onError((err, c) => {
  console.error(`[Error] ${err.message}`, err.stack);
  return c.json(
    error(ErrorCodes.INTERNAL_ERROR, '服务器内部错误'),
    500
  );
});

// ============================================
// Workers导出
// ============================================

export default {
  // HTTP请求处理
  fetch: app.fetch,

  // Queue消费者 - 回测分片计算
  async queue(batch: MessageBatch<BacktestQueueMessage>, env: Env): Promise<void> {
    const { default: backtestConsumer } = await import('./workers/backtest-consumer');
    return backtestConsumer.queue(batch, env);
  },

  // Cron定时任务 - 市场温度抓取
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const { default: cronWorker } = await import('./workers/cron-market');
    return cronWorker.scheduled(event, env, ctx);
  },
};
