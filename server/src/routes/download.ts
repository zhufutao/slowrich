// ============================================
// 慢富(SlowRich) - 下载任务路由
// /api/v1/download/tasks/*
// ============================================

import { Hono } from 'hono';
import { Env, JWTPayload } from '../types';
import { authMiddleware } from '../middleware/auth';
import {
  createDownloadTask, listDownloadTasks, getDownloadTask,
  resumeDownloadTask, retryDownloadTask
} from '../services/download';

const download = new Hono<{ Bindings: Env }>();

// POST /api/v1/download/tasks - 创建下载任务
download.post('/tasks', authMiddleware, async (c) => {
  const body = await c.req.json();
  const user = c.get('user') as JWTPayload;
  const result = await createDownloadTask(
    c.env.DB, body.stock_id, body.start_date, body.end_date,
    body.data_source || 'auto', user.id
  );

  if (result.code !== 0) return c.json(result, 400);

  // 异步启动下载（Workers中用waitUntil或后续触发）
  const taskId = (result.data as any).id;
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const { executeDownloadTask } = await import('../services/download');
        await executeDownloadTask(c.env.DB, taskId, c.env.TUSHARE_TOKEN);
      } catch (e: any) {
        console.error(`下载任务异步执行失败: ${e.message}`);
      }
    })()
  );

  return c.json(result, 201);
});

// GET /api/v1/download/tasks - 下载任务列表
download.get('/tasks', authMiddleware, async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('page_size') || '20'), 100);
  const status = c.req.query('status');
  const user = c.get('user') as JWTPayload;
  const userId = user.role === 'admin' ? undefined : user.id;
  const result = await listDownloadTasks(c.env.DB, page, pageSize, status, userId);
  return c.json(result);
});

// GET /api/v1/download/tasks/:id - 单个下载任务
download.get('/tasks/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const result = await getDownloadTask(c.env.DB, id);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// POST /api/v1/download/tasks/:id/resume - 断点续传
download.post('/tasks/:id/resume', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = await resumeDownloadTask(
    c.env.DB, id, body.data_source || 'auto', c.env.TUSHARE_TOKEN
  );
  if (result.code !== 0) return c.json(result, 400);
  return c.json(result);
});

// POST /api/v1/download/tasks/:id/retry - 重试下载
download.post('/tasks/:id/retry', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = await retryDownloadTask(
    c.env.DB, id, body.data_source || 'auto', c.env.TUSHARE_TOKEN
  );
  if (result.code !== 0) return c.json(result, 400);
  return c.json(result);
});

export default download;
