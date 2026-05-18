import { Link } from 'react-router-dom';
import { TrendingUp, Download, BarChart3, LineChart, Thermometer } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';

const quickLinks = [
  { to: '/stocks', icon: TrendingUp, label: '股票管理', desc: '管理股票代码池', color: 'bg-blue-50 text-blue-600' },
  { to: '/download', icon: Download, label: '数据下载', desc: '下载行情数据', color: 'bg-green-50 text-green-600' },
  { to: '/quotes', icon: BarChart3, label: '行情查看', desc: '查看每日行情', color: 'bg-purple-50 text-purple-600' },
  { to: '/backtest', icon: LineChart, label: '策略回测', desc: '量化回测分析', color: 'bg-orange-50 text-orange-600' },
  { to: '/market', icon: Thermometer, label: '市场温度', desc: '大盘见顶指标', color: 'bg-red-50 text-red-600' },
];

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">欢迎回来，{user?.email}</h1>
        <p className="mt-1 text-gray-500">
          {isAdmin ? '管理员模式 · 拥有全部权限' : '普通用户 · 数据查看与回测'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link key={link.to} to={link.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardBody className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${link.color}`}>
                  <link.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{link.label}</h3>
                  <p className="text-sm text-gray-500 mt-1">{link.desc}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Card>
          <CardBody>
            <h3 className="font-semibold text-gray-900 mb-3">快速开始</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>1️⃣ 管理员先在「股票管理」中添加股票代码</p>
              <p>2️⃣ 在「数据下载」中下载股票行情数据</p>
              <p>3️⃣ 在「策略回测」中配置参数并运行回测</p>
              <p>4️⃣ 查看回测结果和推荐策略</p>
              <p>5️⃣ 在「市场温度」中查看大盘见顶指标</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
