// ============================================
// 慢富(SlowRich) - 综合评分算法
// 归一化到0-1区间后再加权
// ============================================

import { BacktestAnnualStat } from '../types';

interface StrategyScore {
  strategy_key: string;
  dip_threshold: number;
  sell_strategy: string;
  composite_score: number;
  avg_annual_return: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
  total_triggers: number;
}

/**
 * 计算所有策略的综合评分
 * 综合评分 = 收益评分×40% + 胜率评分×30% + 回撤评分×30%
 * 各指标归一化到0-1区间
 */
export function calculateStrategyScores(
  annualStats: BacktestAnnualStat[]
): StrategyScore[] {
  // 按策略分组
  const strategyMap = new Map<string, BacktestAnnualStat[]>();
  for (const stat of annualStats) {
    if (!strategyMap.has(stat.strategy_key)) {
      strategyMap.set(stat.strategy_key, []);
    }
    strategyMap.get(stat.strategy_key)!.push(stat);
  }

  // 计算每策略的平均值
  const rawScores: {
    strategy_key: string;
    dip_threshold: number;
    sell_strategy: string;
    avg_annual_return: number;
    avg_win_rate: number;
    avg_max_drawdown: number;
    total_triggers: number;
  }[] = [];

  for (const [key, stats] of strategyMap) {
    const n = stats.length;
    const avgReturn = stats.reduce((s, x) => s + x.annual_return, 0) / n;
    const avgWinRate = stats.reduce((s, x) => s + x.win_rate, 0) / n;
    const avgDrawdown = stats.reduce((s, x) => s + x.max_drawdown, 0) / n;
    const totalTriggers = stats.reduce((s, x) => s + x.trigger_count, 0);

    rawScores.push({
      strategy_key: key,
      dip_threshold: stats[0].dip_threshold,
      sell_strategy: stats[0].sell_strategy,
      avg_annual_return: Math.round(avgReturn * 100) / 100,
      avg_win_rate: Math.round(avgWinRate * 100) / 100,
      avg_max_drawdown: Math.round(avgDrawdown * 100) / 100,
      total_triggers: totalTriggers,
    });
  }

  // 归一化各指标到0-1区间
  const returns = rawScores.map(s => s.avg_annual_return);
  const winRates = rawScores.map(s => s.avg_win_rate);
  const drawdowns = rawScores.map(s => s.avg_max_drawdown);

  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const returnRange = (maxReturn - minReturn) || 1; // 保留||，因为range=0时需回退到1避免除零

  const scores: StrategyScore[] = rawScores.map(s => {
    // 归一化
    const returnScore = Math.max(0, Math.min(1, (s.avg_annual_return - minReturn) / returnRange));
    const winRateScore = Math.max(0, Math.min(1, s.avg_win_rate / 100));
    const drawdownScore = Math.max(0, 1 - s.avg_max_drawdown / 100);

    // 加权
    const composite = returnScore * 0.4 + winRateScore * 0.3 + drawdownScore * 0.3;

    return {
      strategy_key: s.strategy_key,
      dip_threshold: s.dip_threshold,
      sell_strategy: s.sell_strategy,
      composite_score: Math.round(composite * 10000) / 10000,
      avg_annual_return: s.avg_annual_return,
      avg_win_rate: s.avg_win_rate,
      avg_max_drawdown: s.avg_max_drawdown,
      total_triggers: s.total_triggers,
    };
  });

  return scores;
}

/**
 * 推荐策略评判
 * 🥇黄金策略：综合评分最高
 * 🥈白银策略：胜率≥50%且最大回撤≤20%中年化收益排第二（与黄金不同策略）
 * 🥉青铜策略：胜率≥40%且最大回撤≤30%中年化收益排第三（与黄金/白银不同策略）
 * 
 * 单一策略场景：白银/青铜为null，前端显示"仅有一个策略"
 */
export function recommendStrategies(
  scores: StrategyScore[]
): {
  gold: StrategyScore | null;
  silver: StrategyScore | null;
  bronze: StrategyScore | null;
} {
  if (scores.length === 0) {
    return { gold: null, silver: null, bronze: null };
  }

  // 单一策略场景
  if (scores.length === 1) {
    return { gold: scores[0], silver: null, bronze: null };
  }

  // 按综合评分排序
  const byComposite = [...scores].sort((a, b) => b.composite_score - a.composite_score);

  // 🥇 黄金策略：综合评分最高
  const gold = byComposite[0];
  const usedKeys = new Set<string>([gold.strategy_key]);

  // 🥈 白银策略：胜率≥50%且回撤≤20%中，年化收益最高（排除黄金）
  const silverCandidates = scores
    .filter(s => !usedKeys.has(s.strategy_key) && s.avg_win_rate >= 50 && s.avg_max_drawdown <= 20)
    .sort((a, b) => b.avg_annual_return - a.avg_annual_return);

  let silver: StrategyScore | null = silverCandidates[0] ?? null;

  // 白银候选不足：从剩余策略中按综合评分递补（排除黄金）
  if (!silver) {
    silver = byComposite.find(s => !usedKeys.has(s.strategy_key)) ?? null;
  }

  if (silver) {
    usedKeys.add(silver.strategy_key);
  }

  // 🥉 青铜策略：胜率≥40%且回撤≤30%中，年化收益最高（排除黄金/白银）
  const bronzeCandidates = scores
    .filter(s => !usedKeys.has(s.strategy_key) && s.avg_win_rate >= 40 && s.avg_max_drawdown <= 30)
    .sort((a, b) => b.avg_annual_return - a.avg_annual_return);

  let bronze: StrategyScore | null = bronzeCandidates[0] ?? null;

  // 青铜候选不足：从剩余策略中按综合评分递补
  if (!bronze) {
    bronze = byComposite.find(s => !usedKeys.has(s.strategy_key)) ?? null;
  }

  return { gold, silver, bronze };
}
