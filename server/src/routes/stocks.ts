// ============================================
// 慢富(SlowRich) - 股票管理路由
// /api/v1/stocks/*
// ============================================

import { Hono } from 'hono';
import { Env, JWTPayload } from '../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { listStocks, getStock, createStock, updateStock, deleteStock } from '../services/stock';

const stocks = new Hono<{ Bindings: Env }>();

// GET /api/v1/stocks - 股票列表
stocks.get('/', authMiddleware, async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('page_size') || '20'), 100);
  const search = c.req.query('search');
  const result = await listStocks(c.env.DB, page, pageSize, search);
  return c.json(result);
});

// GET /api/v1/stocks/:id - 股票详情
stocks.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const result = await getStock(c.env.DB, id);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// POST /api/v1/stocks - 新增股票（管理员）
stocks.post('/', authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json();
  const user = c.get('user') as JWTPayload;
  const result = await createStock(c.env.DB, body.code, body.name, body.market, user.id);
  if (result.code !== 0) return c.json(result, 400);
  return c.json(result, 201);
});

// PUT /api/v1/stocks/:id - 修改股票（管理员）
stocks.put('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = await updateStock(c.env.DB, id, body.name, body.market);
  if (result.code !== 0) return c.json(result, 400);
  return c.json(result);
});

// DELETE /api/v1/stocks/:id - 删除股票（管理员）
stocks.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const result = await deleteStock(c.env.DB, id);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

export default stocks;
