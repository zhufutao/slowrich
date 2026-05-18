// ============================================
// 慢富(SlowRich) - 回测路由
// /api/v1/backtest/*
// ============================================

import { Hono } from 'hono';
import { Env, JWTPayload, BacktestParams } from '../types';
import { authMiddleware } from '../middleware/auth';
import { backtestLimiter } from '../middleware/rate-limit';
import {
  createBacktest, getBacktestResult, getBacktestAnnualStats,
  getBacktestComparison, getBacktestCapitalCurve, deleteBacktest
} from '../services/backtest';

const backtest = new Hono<{ Bindings: Env }>();

// POST /api/v1/backtest - 发起回测
backtest.post('/', authMiddleware, backtestLimiter, async (c) => {
  const body = await c.req.json();
  const user = c.get('user') as JWTPayload;

  const params: BacktestParams = {
    dip_threshold_start: body.dip_threshold_start ?? 3.0,
    dip_threshold_end: body.dip_threshold_end ?? 10.0,
    dip_threshold_step: body.dip_threshold_step ?? 0.5,
    sell_next_day: body.sell_next_day ?? true,
    profit_take_start: body.profit_take_start ?? 5.0,
    profit_take_end: body.profit_take_end ?? 10.0,
    profit_take_step: body.profit_take_step ?? 0.5,
    commission_rate: body.commission_rate ?? 0.00025,
    stamp_tax_rate: body.stamp_tax_rate ?? 0.001,
  };

  const result = await createBacktest(
    c.env.DB, c.env.BACKTEST_QUEUE,
    body.stock_id, body.initial_capital ?? 100000,
    body.start_date, body.end_date,
    params, user
  );

  if (result.code !== 0) return c.json(result, 400);
  return c.json(result, 201);
});

// GET /api/v1/backtest/:id - 获取回测结果
backtest.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const result = await getBacktestResult(c.env.DB, id);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// GET /api/v1/backtest/:id/annual - 年度统计
backtest.get('/:id/annual', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const dipThreshold = c.req.query('dip_threshold') ? parseFloat(c.req.query('dip_threshold')!) : undefined;
  const sellStrategy = c.req.query('sell_strategy');
  const result = await getBacktestAnnualStats(c.env.DB, id, dipThreshold, sellStrategy);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// GET /api/v1/backtest/:id/comparison - 策略对比
backtest.get('/:id/comparison', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const result = await getBacktestComparison(c.env.DB, id);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// GET /api/v1/backtest/:id/capital-curve - 资金曲线
backtest.get('/:id/capital-curve', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const dipThreshold = c.req.query('dip_threshold') ? parseFloat(c.req.query('dip_threshold')!) : undefined;
  const sellStrategy = c.req.query('sell_strategy');
  const result = await getBacktestCapitalCurve(c.env.DB, id, dipThreshold, sellStrategy);
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

// DELETE /api/v1/backtest/:id - 删除回测记录
backtest.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as JWTPayload;
  const result = await deleteBacktest(c.env.DB, id, user.id, user.role === 'admin');
  if (result.code !== 0) return c.json(result, 404);
  return c.json(result);
});

export default backtest;
