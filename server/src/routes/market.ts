// ============================================
// 慢富(SlowRich) - 市场温度路由
// /api/v1/market/*
// ============================================

import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { getMarketTemperature, triggerMarketFetch } from '../services/market';

const market = new Hono<{ Bindings: Env }>();

// GET /api/v1/market/temperature - 获取市场温度
market.get('/temperature', authMiddleware, async (c) => {
  const days = parseInt(c.req.query('days') || '365');
  const result = await getMarketTemperature(c.env.DB, days);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// POST /api/v1/market/temperature/fetch - 手动触发温度抓取（管理员）
market.post('/temperature/fetch', authMiddleware, adminMiddleware, async (c) => {
  const result = await triggerMarketFetch(c.env.DB);
  if (result.code !== 0) return c.json(result, 400);
  return c.json(result);
});

export default market;
