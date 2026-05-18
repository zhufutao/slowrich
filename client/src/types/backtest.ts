export type BacktestStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BacktestParams {
  dip_threshold_start: number;
  dip_threshold_end: number;
  dip_threshold_step: number;
  sell_next_day: boolean;
  profit_take_start: number;
  profit_take_end: number;
  profit_take_step: number;
  commission_rate?: number;
  stamp_tax_rate?: number;
}

export interface Recommendation {
  dip_threshold: number;
  sell_strategy: string;
  composite_score: number;
  avg_annual_return: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
}

export interface BacktestResult {
  id: string;
  stock_id: string;
  stock_name: string;
  initial_capital: number;
  start_date: string;
  end_date: string;
  status: BacktestStatus;
  progress?: number;
  params: BacktestParams;
  recommendations?: {
    gold: Recommendation;
    silver: Recommendation;
    bronze: Recommendation;
  };
}

export interface AnnualStat {
  year: number;
  trigger_count: number;
  annual_return: number;
  win_rate: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
  market_env: string;
  start_capital: number;
  end_capital: number;
  annual_profit: number;
}

export interface StrategyComparison {
  strategy_key: string;
  dip_threshold: number;
  sell_strategy: string;
  sell_strategy_label: string;
  avg_annual_return: number;
  avg_win_rate: number;
  avg_max_drawdown: number;
  total_triggers: number;
  composite_score: number;
}

export interface CapitalCurvePoint {
  year: number;
  end_capital: number;
}

export interface CreateBacktestRequest {
  stock_id: string;
  initial_capital: number;
  start_date: string;
  end_date: string;
  dip_threshold_start: number;
  dip_threshold_end: number;
  dip_threshold_step: number;
  sell_next_day: boolean;
  profit_take_start: number;
  profit_take_end: number;
  profit_take_step: number;
}
