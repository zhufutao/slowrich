import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy, ArrowLeft, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import type { BacktestResult as BacktestResultType, AnnualStat, StrategyComparison, CapitalCurvePoint } from '../types';
import { mockBacktestResult, mockAnnualStats, mockStrategyComparison, mockCapitalCurve, fetchMockData } from '../mock/data';
import { formatNumber, formatMoney, formatPercent, getMarketEnvBadge } from '../utils/format';

const USE_MOCK = true;

export default function BacktestResultPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<BacktestResultType | null>(null);
  const [annualStats, setAnnualStats] = useState<AnnualStat[]>([]);
  const [comparisons, setComparisons] = useState<StrategyComparison[]>([]);
  const [capitalCurve, setCapitalCurve] = useState<CapitalCurvePoint[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'annual' | 'comparison'>('overview');
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (USE_MOCK) {
        await fetchMockData(mockBacktestResult, 800);
        setResult(mockBacktestResult);
        setAnnualStats(mockAnnualStats);
        setComparisons(mockStrategyComparison);
        setCapitalCurve(mockCapitalCurve);
      }
      setLoading(false);
    };
    loadData();
  }, [id]);

  // Simulate polling for running backtest
  useEffect(() => {
    if (result?.status === 'running' || result?.status === 'queued') {
      setPolling(true);
      pollRef.current = setInterval(async () => {
        // Mock: mark as completed after a few seconds
        setResult((prev) => {
          if (!prev) return prev;
          const newProgress = Math.min(100, (prev.progress || 0) + 10);
          return { ...prev, progress: newProgress, status: newProgress >= 100 ? 'completed' : 'running' };
        });
      }, 2000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [result?.status]);

  useEffect(() => {
    if (result?.status === 'completed') setPolling(false);
  }, [result?.status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        <span className="ml-3 text-gray-500">加载回测结果...</span>
      </div>
    );
  }

  if (!result) return <div className="text-center py-20 text-gray-400">回测结果不存在</div>;

  const recs = result.recommendations;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/backtest">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            回测结果：{result.stock_name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {result.start_date} ~ {result.end_date} · 初始资金 {formatMoney(result.initial_capital)}
          </p>
        </div>
      </div>

      {/* Progress bar for running backtest */}
      {result.status !== 'completed' && (
        <Card className="mb-6">
          <CardBody className="flex items-center gap-4">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">回测计算中...</p>
              <ProgressBar value={result.progress || 0} className="mt-2" />
              <p className="text-xs text-gray-400 mt-1">{result.progress || 0}% 完成</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recommendation Cards */}
      {recs && result.status === 'completed' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Gold */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-gold" />
                <span className="font-bold text-gold">🥇 黄金策略</span>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">跌幅阈值：</span><span className="font-medium">{recs.gold.dip_threshold}%</span></p>
                <p><span className="text-gray-500">卖出策略：</span><span className="font-medium">{recs.gold.sell_strategy === 'next_day_close' ? '次日收盘' : `浮盈${recs.gold.sell_strategy.replace('profit_take_', '')}%`}</span></p>
                <p><span className="text-gray-500">综合评分：</span><span className="font-bold text-lg">{recs.gold.composite_score}</span></p>
                <p><span className="text-gray-500">年化收益：</span><span className="font-semibold text-rise">{formatPercent(recs.gold.avg_annual_return)}</span></p>
                <p><span className="text-gray-500">平均胜率：</span><span className="font-medium">{recs.gold.avg_win_rate}%</span></p>
                <p><span className="text-gray-500">最大回撤：</span><span className="font-medium text-fall">{recs.gold.avg_max_drawdown}%</span></p>
              </div>
            </CardBody>
          </Card>

          {/* Silver */}
          <Card className="border-slate-200 bg-slate-50/30">
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-silver" />
                <span className="font-bold text-silver">🥈 白银策略</span>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">跌幅阈值：</span><span className="font-medium">{recs.silver.dip_threshold}%</span></p>
                <p><span className="text-gray-500">卖出策略：</span><span className="font-medium">{recs.silver.sell_strategy === 'next_day_close' ? '次日收盘' : `浮盈${recs.silver.sell_strategy.replace('profit_take_', '')}%`}</span></p>
                <p><span className="text-gray-500">综合评分：</span><span className="font-bold text-lg">{recs.silver.composite_score}</span></p>
                <p><span className="text-gray-500">年化收益：</span><span className="font-semibold text-rise">{formatPercent(recs.silver.avg_annual_return)}</span></p>
                <p><span className="text-gray-500">平均胜率：</span><span className="font-medium">{recs.silver.avg_win_rate}%</span></p>
                <p><span className="text-gray-500">最大回撤：</span><span className="font-medium text-fall">{recs.silver.avg_max_drawdown}%</span></p>
              </div>
            </CardBody>
          </Card>

          {/* Bronze */}
          <Card className="border-orange-200 bg-orange-50/30">
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-bronze" />
                <span className="font-bold text-bronze">🥉 青铜策略</span>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">跌幅阈值：</span><span className="font-medium">{recs.bronze.dip_threshold}%</span></p>
                <p><span className="text-gray-500">卖出策略：</span><span className="font-medium">{recs.bronze.sell_strategy === 'next_day_close' ? '次日收盘' : `浮盈${recs.bronze.sell_strategy.replace('profit_take_', '')}%`}</span></p>
                <p><span className="text-gray-500">综合评分：</span><span className="font-bold text-lg">{recs.bronze.composite_score}</span></p>
                <p><span className="text-gray-500">年化收益：</span><span className="font-semibold text-rise">{formatPercent(recs.bronze.avg_annual_return)}</span></p>
                <p><span className="text-gray-500">平均胜率：</span><span className="font-medium">{recs.bronze.avg_win_rate}%</span></p>
                <p><span className="text-gray-500">最大回撤：</span><span className="font-medium text-fall">{recs.bronze.avg_max_drawdown}%</span></p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['overview', 'annual', 'comparison'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'overview' ? '资金曲线' : tab === 'annual' ? '年度统计' : '策略对比'}
          </button>
        ))}
      </div>

      {/* Capital Curve Chart */}
      {activeTab === 'overview' && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">资金曲线</h3>
          </CardHeader>
          <CardBody>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={capitalCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(value: unknown) => [formatMoney(Number(value)), '年末资金']} labelFormatter={(l) => `${l}年`} />
                  <Line type="monotone" dataKey="end_capital" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Annual Stats Table */}
      {activeTab === 'annual' && (
        <Card>
          <CardBody className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>年份</TableHead>
                  <TableHead>市场环境</TableHead>
                  <TableHead>触发次数</TableHead>
                  <TableHead>年化收益</TableHead>
                  <TableHead>胜率</TableHead>
                  <TableHead>盈/亏</TableHead>
                  <TableHead>最大回撤</TableHead>
                  <TableHead>年初资金</TableHead>
                  <TableHead>年末资金</TableHead>
                  <TableHead>年度浮盈</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {annualStats.map((stat) => (
                  <TableRow key={stat.year}>
                    <TableCell className="font-medium">{stat.year}</TableCell>
                    <TableCell>
                      <Badge className={getMarketEnvBadge(stat.market_env)}>{stat.market_env}</Badge>
                    </TableCell>
                    <TableCell>{stat.trigger_count}</TableCell>
                    <TableCell className={stat.annual_return >= 0 ? 'text-rise' : 'text-fall'}>
                      {formatPercent(stat.annual_return)}
                    </TableCell>
                    <TableCell>{stat.win_rate}%</TableCell>
                    <TableCell>
                      <span className="text-rise">{stat.win_count}</span> / <span className="text-fall">{stat.loss_count}</span>
                    </TableCell>
                    <TableCell className="text-fall">{stat.max_drawdown}%</TableCell>
                    <TableCell>{formatMoney(stat.start_capital)}</TableCell>
                    <TableCell>{formatMoney(stat.end_capital)}</TableCell>
                    <TableCell className={stat.annual_profit >= 0 ? 'text-rise' : 'text-fall'}>
                      {stat.annual_profit >= 0 ? '+' : ''}{formatMoney(stat.annual_profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {/* Strategy Comparison Table */}
      {activeTab === 'comparison' && (
        <Card>
          <CardBody className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>跌幅阈值</TableHead>
                  <TableHead>卖出策略</TableHead>
                  <TableHead>综合评分</TableHead>
                  <TableHead>年化收益</TableHead>
                  <TableHead>平均胜率</TableHead>
                  <TableHead>最大回撤</TableHead>
                  <TableHead>总触发次数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisons.slice(0, 50).map((c) => (
                  <TableRow key={c.strategy_key}>
                    <TableCell className="font-medium">{c.dip_threshold}%</TableCell>
                    <TableCell>{c.sell_strategy_label}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${c.composite_score >= 0.65 ? 'text-rise' : c.composite_score >= 0.5 ? 'text-flat' : 'text-fall'}`}>
                        {c.composite_score}
                      </span>
                    </TableCell>
                    <TableCell className={c.avg_annual_return >= 0 ? 'text-rise' : 'text-fall'}>
                      {formatPercent(c.avg_annual_return)}
                    </TableCell>
                    <TableCell>{c.avg_win_rate}%</TableCell>
                    <TableCell className="text-fall">{c.avg_max_drawdown}%</TableCell>
                    <TableCell>{c.total_triggers}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {comparisons.length > 50 && (
              <div className="px-6 py-3 text-sm text-gray-500 text-center">
                仅展示前50条，共 {comparisons.length} 个策略组合
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
