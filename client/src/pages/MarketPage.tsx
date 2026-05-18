import { useState, useEffect } from 'react';
import { Thermometer } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import type { MarketTemperature } from '../types';
import { mockMarketTemperature, fetchMockData } from '../mock/data';
import { getTemperatureColor, formatDate } from '../utils/format';

const USE_MOCK = true;

function getTempLevel(value: number): { label: string; variant: 'info' | 'success' | 'warning' | 'danger' } {
  if (value <= 20) return { label: '极冷', variant: 'info' };
  if (value <= 35) return { label: '冷', variant: 'info' };
  if (value <= 50) return { label: '适中', variant: 'success' };
  if (value <= 70) return { label: '热', variant: 'warning' };
  return { label: '极热', variant: 'danger' };
}

export default function MarketPage() {
  const [data, setData] = useState<MarketTemperature | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (USE_MOCK) {
        await fetchMockData(mockMarketTemperature, 600);
        setData(mockMarketTemperature);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return <div className="text-center py-20 text-gray-400">暂无市场温度数据</div>;

  const level = getTempLevel(data.current.value);
  const recentHistory = data.history.slice(-90); // Last 90 days for chart

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Thermometer className="w-6 h-6 text-primary-600" />
          市场温度
        </h1>
        <p className="mt-1 text-sm text-gray-500">A股全市场温度指标，基于PE/PB百分位自计算</p>
      </div>

      {/* Current Temperature Card */}
      <Card className="mb-6">
        <CardBody className="text-center py-8">
          <p className="text-sm text-gray-500 mb-2">当前市场温度</p>
          <div className={`text-6xl font-bold ${getTemperatureColor(data.current.value)}`}>
            {data.current.value}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Badge variant={level.variant} className="text-base px-4 py-1">
              {level.label}
            </Badge>
            <span className="text-sm text-gray-500">
              历史分位 {data.current.percentile}%
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400">更新日期：{data.current.date}</p>
          <p className="mt-1 text-xs text-gray-400">
            数据来源：自计算 · 基于全市场PE/PB历史百分位加权
          </p>

          {/* Temperature Scale Bar */}
          <div className="mt-6 max-w-md mx-auto">
            <div className="h-3 rounded-full overflow-hidden flex">
              <div className="flex-1 bg-temp-cold" />
              <div className="flex-1 bg-temp-cool" />
              <div className="flex-1 bg-temp-moderate" />
              <div className="flex-1 bg-temp-warm" />
              <div className="flex-1 bg-temp-hot" />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>0 极冷</span>
              <span>25</span>
              <span>50 适中</span>
              <span>75</span>
              <span>100 极热</span>
            </div>
            {/* Pointer */}
            <div className="relative mt-1" style={{ left: `${data.current.value}%` }}>
              <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-gray-800 -translate-x-1/2" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Temperature Trend Chart */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="font-semibold text-gray-900">温度趋势（近3个月）</h3>
        </CardHeader>
        <CardBody>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recentHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickFormatter={(v) => v.slice(5)}
                  interval={6}
                />
                <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  formatter={(value: unknown) => [`${Number(value)}`, '温度']}
                  labelFormatter={(l) => String(l)}
                />
                <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="5 5" label={{ value: '适中', position: 'insideTopRight', fill: '#9ca3af', fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* Historical Data Table */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">历史温度数据</h3>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>温度值</TableHead>
                <TableHead>等级</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.slice(-30).reverse().map((h) => {
                const lvl = getTempLevel(h.value);
                return (
                  <TableRow key={h.date}>
                    <TableCell className="font-mono">{h.date}</TableCell>
                    <TableCell className={`font-semibold ${getTemperatureColor(h.value)}`}>
                      {h.value}
                    </TableCell>
                    <TableCell>
                      <Badge variant={lvl.variant}>{lvl.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
