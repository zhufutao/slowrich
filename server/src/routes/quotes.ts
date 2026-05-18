// ============================================
// 慢富(SlowRich) - 行情数据路由
// /api/v1/quotes/*
// ============================================

import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { listQuotes } from '../services/quote';

const quotes = new Hono<{ Bindings: Env }>();

// GET /api/v1/quotes/:stock_id - 查询行情数据
quotes.get('/:stock_id', authMiddleware, async (c) => {
  const stockId = c.req.param('stock_id');
  const startDate = c.req.query('start_date') || '';
  const endDate = c.req.query('end_date') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('page_size') || '20'), 100);

  const result = await listQuotes(c.env.DB, stockId, startDate, endDate, page, pageSize);
  if (result.code !== 0) return c.json(result, 400);
  return c.json(result);
});

export default quotes;
