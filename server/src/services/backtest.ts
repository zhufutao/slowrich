// ============================================
// 慢富(SlowRich) - 回测任务管理服务
// Queue消息拆分、进度追踪、结果汇总
// ============================================

import { D1Database, Queue } from '@cloudflare/workers-types';
import { BacktestResult, BacktestParams, BacktestAnnualStat, BacktestQueueMessage, ErrorCodes, JWTPayload } from '../types';
import { generateId, nowISO, isValidDate, strategyKey, safeJsonParse, error, success, paginate } from '../utils';
import { generateStrategyCombinations } from '../engine/backtest';
import { calculateStrategyScores, recommendStrategies } from '../engine/scoring';

/**
 * 发起回测 - 创建任务 + 拆分Queue消息
 */
export async function createBacktest(
  db: D1Database,
  queue: Queue,
  stockId: string,
  initialCapital: number,
  startDate: string,
  endDate: string,
  params: BacktestParams,
  user: JWTPayload
) {
  // 参数校验
  if (!stockId || !initialCapital || !startDate || !endDate) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '请填写所有必填参数');
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return error(ErrorCodes.DATE_RANGE_INVALID, '日期格式无效');
  }
  if (startDate > endDate) {
    return error(ErrorCodes.DATE_RANGE_INVALID, '结束日期不能早于起始日期');
  }
  if (initialCapital < 10000 || initialCapital > 10000000) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '初始资金范围: 10,000 ~ 10,000,000');
  }
  if (params.dip_threshold_start > params.dip_threshold_end) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '跌幅起始值不能大于结束值');
  }
  if (params.profit_take_start > params.profit_take_end) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '浮盈起始值不能大于结束值');
  }

  // 交易成本参数范围校验
  if (params.commission_rate < 0 || params.commission_rate > 0.01) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '佣金费率范围: 0 ~ 1%');
  }
  if (params.stamp_tax_rate < 0 || params.stamp_tax_rate > 0.01) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '印花税率范围: 0 ~ 1%');
  }

  // 验证股票存在
  const stock = await db.prepare('SELECT * FROM stocks WHERE id = ?').bind(stockId).first();
  if (!stock) {
    return error(ErrorCodes.STOCK_NOT_FOUND, '股票不存在');
  }

  // 检查行情数据是否存在
  const dataCheck = await db.prepare(
    'SELECT COUNT(*) as cnt FROM daily_quotes WHERE stock_id = ? AND trade_date >= ? AND trade_date <= ?'
  ).bind(stockId, startDate, endDate).first<{ cnt: number }>();

  if (!dataCheck || dataCheck.cnt === 0) {
    return error(ErrorCodes.QUOTE_NOT_FOUND, '该股票在指定日期范围内无行情数据，请先下载数据');
  }

  // 生成策略组合
  const strategies = generateStrategyCombinations(params);
  if (strategies.length === 0) {
    return error(ErrorCodes.BACKTEST_PARAMS_INVALID, '参数组合为空，请检查参数设置');
  }

  // 创建回测记录
  const backtestId = generateId('bt');
  const now = nowISO();
  const defaultParams: BacktestParams = {
    commission_rate: 0.00025,
    stamp_tax_rate: 0.001,
    ...params,
  };

  await db.prepare(
    `INSERT INTO backtest_results (id, stock_id, stock_name, user_id, initial_capital, start_date, end_date, params, status, progress, total_strategies, completed_strategies, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', 0, ?, 0, ?, ?)`
  ).bind(
    backtestId, stockId, (stock as any).name, user.id,
    initialCapital, startDate, endDate,
    JSON.stringify(defaultParams),
    strategies.length, now, now
  ).run();

  // 拆分Queue消息 - 每个策略组合一条消息
  const messages: BacktestQueueMessage[] = strategies.map(s => ({
    backtest_id: backtestId,
    stock_id: stockId,
    stock_name: (stock as any).name,
    strategy_key: strategyKey(s.dipThreshold, s.sellStrategy),
    dip_threshold: s.dipThreshold,
    sell_strategy: s.sellStrategy,
    sell_strategy_label: s.sellStrategyLabel,
    initial_capital: initialCapital,
    start_date: startDate,
    end_date: endDate,
    params: defaultParams,
  }));

  // 发送消息到Queue
  for (const msg of messages) {
    await queue.send(msg);
  }

  return success({
    id: backtestId,
    status: 'running',
    total_strategies: strategies.length,
    message: '回测计算中，请稍候',
  }, '回测任务已创建');
}

/**
 * 获取回测结果
 */
export async function getBacktestResult(db: D1Database, backtestId: string) {
  const result = await db.prepare(
    'SELECT * FROM backtest_results WHERE id = ?'
  ).bind(backtestId).first<BacktestResult>();

  if (!result) {
    return error(ErrorCodes.BACKTEST_NOT_FOUND, '回测结果不存在');
  }

  const recommendations = safeJsonParse(result.recommendations, null);
  const params = safeJsonParse(result.params, {});

  return success({
    ...result,
    params,
    recommendations,
  });
}

/**
 * 获取年度统计
 */
export async function getBacktestAnnualStats(
  db: D1Database,
  backtestId: string,
  dipThreshold?: number,
  sellStrategy?: string
) {
  const backtest = await db.prepare(
    'SELECT id FROM backtest_results WHERE id = ?'
  ).bind(backtestId).first();

  if (!backtest) {
    return error(ErrorCodes.BACKTEST_NOT_FOUND, '回测结果不存在');
  }

  let sql = 'SELECT * FROM backtest_annual_stats WHERE backtest_id = ?';
  const bindings: any[] = [backtestId];

  if (dipThreshold !== undefined) {
    sql += ' AND dip_threshold = ?';
    bindings.push(dipThreshold);
  }
  if (sellStrategy) {
    sql += ' AND sell_strategy = ?';
    bindings.push(sellStrategy);
  }

  sql += ' ORDER BY year ASC, strategy_key ASC';

  const result = await db.prepare(sql).bind(...bindings).all<BacktestAnnualStat>();

  return success({
    backtest_id: backtestId,
    annual_stats: result.results || [],
  });
}

/**
 * 获取策略对比
 */
export async function getBacktestComparison(db: D1Database, backtestId: string) {
  const backtest = await db.prepare(
    'SELECT id FROM backtest_results WHERE id = ?'
  ).bind(backtestId).first();

  if (!backtest) {
    return error(ErrorCodes.BACKTEST_NOT_FOUND, '回测结果不存在');
  }

  // 按策略聚合年度统计
  const stats = await db.prepare(
    `SELECT
      strategy_key,
      dip_threshold,
      sell_strategy,
      COUNT(*) as year_count,
      AVG(annual_return) as avg_annual_return,
      AVG(win_rate) as avg_win_rate,
      AVG(max_drawdown) as avg_max_drawdown,
      SUM(trigger_count) as total_triggers
    FROM backtest_annual_stats
    WHERE backtest_id = ?
    GROUP BY strategy_key
    ORDER BY avg_annual_return DESC`
  ).bind(backtestId).all();

  // 计算综合评分
  const strategies = (stats.results || []).map((s: any) => ({
    strategy_key: s.strategy_key,
    dip_threshold: s.dip_threshold,
    sell_strategy: s.sell_strategy,
    sell_strategy_label: s.sell_strategy === 'next_day_close'
      ? '次日收盘卖出'
      : `浮盈${s.sell_strategy.replace('profit_take_', '')}%卖出`,
    avg_annual_return: Math.round(s.avg_annual_return * 100) / 100,
    avg_win_rate: Math.round(s.avg_win_rate * 100) / 100,
    avg_max_drawdown: Math.round(s.avg_max_drawdown * 100) / 100,
    total_triggers: s.total_triggers,
  }));

  // 应用评分算法
  const scores = calculateStrategyScores(
    strategies.map(s => ({
      ...s,
      backtest_id: backtestId,
      year: 0,
      trigger_count: s.total_triggers,
      annual_return: s.avg_annual_return,
      win_rate: s.avg_win_rate,
      max_drawdown: s.avg_max_drawdown,
      market_env: '',
      start_capital: 0,
      end_capital: 0,
      annual_profit: 0,
      id: '',
      created_at: '',
    }))
  );

  // 合并评分到策略对比
  const scoreMap = new Map(scores.map(s => [s.strategy_key, s.composite_score]));
  const strategiesWithScore = strategies.map(s => ({
    ...s,
    composite_score: scoreMap.get(s.strategy_key) ?? 0,
  })).sort((a, b) => b.composite_score - a.composite_score);

  return success({ strategies: strategiesWithScore });
}

/**
 * 获取资金曲线
 */
export async function getBacktestCapitalCurve(
  db: D1Database,
  backtestId: string,
  dipThreshold?: number,
  sellStrategy?: string
) {
  const backtest = await db.prepare(
    'SELECT id, initial_capital FROM backtest_results WHERE id = ?'
  ).bind(backtestId).first<BacktestResult>();

  if (!backtest) {
    return error(ErrorCodes.BACKTEST_NOT_FOUND, '回测结果不存在');
  }

  // 获取年度统计（按策略筛选）
  let sql = 'SELECT year, start_capital, end_capital, strategy_key FROM backtest_annual_stats WHERE backtest_id = ?';
  const bindings: any[] = [backtestId];

  if (dipThreshold !== undefined && sellStrategy) {
    const sKey = strategyKey(dipThreshold, sellStrategy);
    sql += ' AND strategy_key = ?';
    bindings.push(sKey);
  }

  sql += ' ORDER BY strategy_key, year ASC';

  const result = await db.prepare(sql).bind(...bindings).all();

  // 按策略分组
  const curveMap = new Map<string, { year: number; end_capital: number }[]>();
  for (const row of (result.results || [])) {
    const key = (row as any).strategy_key;
    if (!curveMap.has(key)) curveMap.set(key, []);
    curveMap.get(key)!.push({
      year: (row as any).year,
      end_capital: (row as any).end_capital,
    });
  }

  const curves = Array.from(curveMap.entries()).map(([strategyKey, curve]) => ({
    strategy_key: strategyKey,
    initial_capital: backtest.initial_capital,
    curve,
  }));

  return success(curves.length === 1 ? curves[0] : { curves });
}

/**
 * 删除回测记录
 */
export async function deleteBacktest(db: D1Database, backtestId: string, userId: string, isAdmin: boolean) {
  const result = await db.prepare(
    'SELECT * FROM backtest_results WHERE id = ?'
  ).bind(backtestId).first<BacktestResult>();

  if (!result) {
    return error(ErrorCodes.BACKTEST_NOT_FOUND, '回测结果不存在');
  }

  if (!isAdmin && result.user_id !== userId) {
    return error(ErrorCodes.FORBIDDEN, '无权删除此回测记录');
  }

  // CASCADE会自动删除annual_stats和trades
  await db.prepare('DELETE FROM backtest_results WHERE id = ?').bind(backtestId).run();
  return success(null, '删除成功');
}
