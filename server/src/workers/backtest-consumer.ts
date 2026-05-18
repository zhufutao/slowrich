// ============================================
// 慢富(SlowRich) - Queue消费者Worker
// 消费回测分片消息，计算单策略结果
// ============================================

import { BacktestQueueMessage, BacktestParams, DailyQuote, Env } from '../types';
import { generateId, nowISO, strategyKey } from '../utils';
import { runSingleStrategy } from '../engine/backtest';
import { calculateStrategyScores, recommendStrategies } from '../engine/scoring';

export default {
  async queue(
    batch: MessageBatch<BacktestQueueMessage>,
    env: Env
  ): Promise<void> {
    for (const message of batch.messages) {
      const msg = message.body;
      try {
        await processSingleStrategy(env, msg);
        message.ack();
      } catch (e: any) {
        console.error(`策略计算失败 [${msg.strategy_key}]: ${e.message}`);
        message.retry();
      }
    }

    // 检查回测是否全部完成
    const backtestIds = new Set(batch.messages.map(m => m.body.backtest_id));
    for (const backtestId of backtestIds) {
      await checkAndFinalizeBacktest(env, backtestId);
    }
  },
};

/**
 * 处理单个策略计算（幂等）
 * 重复消费时先检查是否已有结果，避免重复写入
 */
async function processSingleStrategy(env: Env, msg: BacktestQueueMessage): Promise<void> {
  const { backtest_id, stock_id, strategy_key, dip_threshold, sell_strategy, initial_capital, start_date, end_date, params } = msg;

  // 0. 幂等检查：如果该策略已有结果，跳过重复计算
  const existing = await env.DB.prepare(
    'SELECT id FROM backtest_annual_stats WHERE backtest_id = ? AND strategy_key = ? LIMIT 1'
  ).bind(backtest_id, strategy_key).first();

  if (existing) {
    console.warn(`[BacktestConsumer] 策略${strategy_key}已有结果，跳过重复计算 (backtest_id=${backtest_id})`);
    // 仍需更新进度（因为重复消息可能导致进度不更新）
    await env.DB.prepare(
      'UPDATE backtest_results SET completed_strategies = MIN(completed_strategies + 1, total_strategies), updated_at = ? WHERE id = ? AND completed_strategies < total_strategies'
    ).bind(nowISO(), backtest_id).run();
    return;
  }

  // 1. 获取行情数据
  const quotes = await env.DB.prepare(
    'SELECT trade_date, open, high, low, close, pre_close, pct_chg, volume, amt FROM daily_quotes WHERE stock_id = ? AND trade_date >= ? AND trade_date <= ? ORDER BY trade_date ASC'
  ).bind(stock_id, start_date, end_date).all<DailyQuote>();

  if (!quotes.results || quotes.results.length === 0) {
    console.error(`无行情数据: stock_id=${stock_id}, ${start_date}~${end_date}`);
    return;
  }

  // 2. 执行回测计算
  const quoteData = quotes.results.map(q => ({
    trade_date: q.trade_date,
    open: q.open ?? 0,
    high: q.high ?? 0,
    low: q.low ?? 0,
    close: q.close ?? 0,
    pre_close: q.pre_close ?? 0,
    pct_chg: q.pct_chg ?? 0,
    volume: q.volume ?? 0,
    amt: q.amt ?? 0,
  }));

  const { annualStats, trades } = runSingleStrategy(
    quoteData, dip_threshold, sell_strategy, initial_capital, params
  );

  // 3. 写入年度统计
  const now = nowISO();
  for (const stat of annualStats) {
    const statId = generateId('bas');
    await env.DB.prepare(
      `INSERT OR REPLACE INTO backtest_annual_stats
       (id, backtest_id, year, strategy_key, dip_threshold, sell_strategy, trigger_count, annual_return, win_rate, win_count, loss_count, max_drawdown, market_env, start_capital, end_capital, annual_profit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      statId, backtest_id, stat.year, stat.strategy_key, stat.dip_threshold,
      stat.sell_strategy, stat.trigger_count, stat.annual_return, stat.win_rate,
      stat.win_count, stat.loss_count, stat.max_drawdown, stat.market_env,
      stat.start_capital, stat.end_capital, stat.annual_profit, now
    ).run();
  }

  // 4. 写入交易明细
  for (const trade of trades) {
    const tradeId = generateId('bt');
    await env.DB.prepare(
      `INSERT INTO backtest_trades
       (id, backtest_id, strategy_key, trade_date, buy_price, sell_date, sell_price, sell_strategy, profit, profit_pct, capital_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tradeId, backtest_id, trade.strategy_key, trade.trade_date, trade.buy_price,
      trade.sell_date, trade.sell_price, trade.sell_strategy, trade.profit,
      trade.profit_pct, trade.capital_after, now
    ).run();
  }

  // 5. 更新进度（使用条件更新避免重复计数）
  await env.DB.prepare(
    `UPDATE backtest_results
     SET completed_strategies = MIN(completed_strategies + 1, total_strategies),
         progress = CASE WHEN total_strategies > 0
           THEN CAST(MIN(completed_strategies + 1, total_strategies) AS REAL) / total_strategies * 100
           ELSE 100 END,
         updated_at = ?
     WHERE id = ? AND completed_strategies < total_strategies`
  ).bind(now, backtest_id).run();
}

/**
 * 检查回测是否全部完成，若完成则汇总推荐策略
 */
async function checkAndFinalizeBacktest(env: Env, backtestId: string): Promise<void> {
  const result = await env.DB.prepare(
    'SELECT * FROM backtest_results WHERE id = ?'
  ).bind(backtestId).first<{ status: string; total_strategies: number; completed_strategies: number }>();

  if (!result || result.status !== 'running') return;

  // 检查是否所有策略都完成了
  if (result.completed_strategies < result.total_strategies) return;

  // 获取所有年度统计
  const stats = await env.DB.prepare(
    'SELECT * FROM backtest_annual_stats WHERE backtest_id = ?'
  ).bind(backtestId).all();

  if (!stats.results || stats.results.length === 0) {
    await env.DB.prepare(
      "UPDATE backtest_results SET status = 'failed', updated_at = ? WHERE id = ?"
    ).bind(nowISO(), backtestId).run();
    return;
  }

  // 计算综合评分
  const scores = calculateStrategyScores(stats.results as any[]);

  // 推荐策略
  const recommendations = recommendStrategies(scores);

  // 更新回测结果
  await env.DB.prepare(
    "UPDATE backtest_results SET status = 'completed', progress = 100, recommendations = ?, updated_at = ? WHERE id = ?"
  ).bind(JSON.stringify(recommendations), nowISO(), backtestId).run();
}
