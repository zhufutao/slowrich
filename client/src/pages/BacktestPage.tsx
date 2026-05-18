import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Settings2, Play } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { showToast } from '../components/ui/Toast';
import { mockStocks } from '../mock/data';

export default function BacktestPage() {
  const navigate = useNavigate();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    stock_id: '',
    initial_capital: '100000',
    start_date: '',
    end_date: '',
    dip_threshold_start: '3',
    dip_threshold_end: '10',
    dip_threshold_step: '0.5',
    sell_next_day: true,
    profit_take_start: '5',
    profit_take_end: '10',
    profit_take_step: '0.5',
    commission_rate: '0.025',
    stamp_tax_rate: '0.1',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const stockOptions = [
    { value: '', label: '请选择股票' },
    ...mockStocks.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` })),
  ];

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.stock_id) errs.stock_id = '请选择股票';
    const capital = Number(form.initial_capital);
    if (!form.initial_capital) errs.initial_capital = '请输入初始资金';
    else if (capital < 10000 || capital > 10000000) errs.initial_capital = '资金范围 10,000 ~ 10,000,000';
    if (!form.start_date) errs.start_date = '请选择起始日期';
    if (!form.end_date) errs.end_date = '请选择结束日期';
    if (form.start_date && form.end_date && form.start_date > form.end_date) errs.end_date = '结束日期不能早于起始日期';

    const dipStart = Number(form.dip_threshold_start);
    const dipEnd = Number(form.dip_threshold_end);
    const dipStep = Number(form.dip_threshold_step);
    if (dipStart < 1 || dipStart > 15) errs.dip_threshold_start = '范围 1% ~ 15%';
    if (dipEnd < dipStart || dipEnd > 20) errs.dip_threshold_end = `范围 ${dipStart}% ~ 20%`;
    if (dipStep < 0.1 || dipStep > 2) errs.dip_threshold_step = '范围 0.1% ~ 2%';

    const ptStart = Number(form.profit_take_start);
    const ptEnd = Number(form.profit_take_end);
    const ptStep = Number(form.profit_take_step);
    if (ptStart < 1 || ptStart > 20) errs.profit_take_start = '范围 1% ~ 20%';
    if (ptEnd < ptStart || ptEnd > 30) errs.profit_take_end = `范围 ${ptStart}% ~ 30%`;
    if (ptStep < 0.1 || ptStep > 2) errs.profit_take_step = '范围 0.1% ~ 2%';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Mock: create backtest and navigate to result
      await new Promise((r) => setTimeout(r, 1500));
      showToast('回测任务已提交', 'success');
      navigate('/backtest/bt_001');
    } catch {
      showToast('回测提交失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (key: string, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LineChart className="w-6 h-6 text-primary-600" />
          策略回测
        </h1>
        <p className="mt-1 text-sm text-gray-500">配置抄底策略参数，量化评估历史表现</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-4">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">基本参数</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="选择股票" options={stockOptions} value={form.stock_id} onChange={(e) => updateForm('stock_id', e.target.value)} error={errors.stock_id} />
              <Input label="初始资金（元）" type="number" value={form.initial_capital} onChange={(e) => updateForm('initial_capital', e.target.value)} error={errors.initial_capital} placeholder="100000" />
              <Input label="回测起始日期" type="date" value={form.start_date} onChange={(e) => updateForm('start_date', e.target.value)} error={errors.start_date} />
              <Input label="回测结束日期" type="date" value={form.end_date} onChange={(e) => updateForm('end_date', e.target.value)} error={errors.end_date} />
            </div>
          </CardBody>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">跌幅触发参数</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="跌幅起始值（%）" type="number" step="0.5" value={form.dip_threshold_start} onChange={(e) => updateForm('dip_threshold_start', e.target.value)} error={errors.dip_threshold_start} />
              <Input label="跌幅结束值（%）" type="number" step="0.5" value={form.dip_threshold_end} onChange={(e) => updateForm('dip_threshold_end', e.target.value)} error={errors.dip_threshold_end} />
              <Input label="跌幅步长（%）" type="number" step="0.1" value={form.dip_threshold_step} onChange={(e) => updateForm('dip_threshold_step', e.target.value)} error={errors.dip_threshold_step} />
            </div>
          </CardBody>
        </Card>

        <Card className="mb-4">
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">卖出策略</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
              <Settings2 className="w-4 h-4 mr-1" />
              {showAdvanced ? '收起' : '高级设置'}
            </Button>
          </CardHeader>
          <CardBody>
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={form.sell_next_day}
                onChange={(e) => updateForm('sell_next_day', e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">次日收盘卖出</span>
            </label>

            {showAdvanced && (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input label="浮盈起始值（%）" type="number" step="0.5" value={form.profit_take_start} onChange={(e) => updateForm('profit_take_start', e.target.value)} error={errors.profit_take_start} />
                  <Input label="浮盈结束值（%）" type="number" step="0.5" value={form.profit_take_end} onChange={(e) => updateForm('profit_take_end', e.target.value)} error={errors.profit_take_end} />
                  <Input label="浮盈步长（%）" type="number" step="0.1" value={form.profit_take_step} onChange={(e) => updateForm('profit_take_step', e.target.value)} error={errors.profit_take_step} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="佣金费率（%）" type="number" step="0.001" value={form.commission_rate} onChange={(e) => updateForm('commission_rate', e.target.value)} placeholder="0.025" />
                  <Input label="印花税率（%）" type="number" step="0.01" value={form.stamp_tax_rate} onChange={(e) => updateForm('stamp_tax_rate', e.target.value)} placeholder="0.1" />
                </div>
                <p className="text-xs text-gray-400">佣金默认万2.5（买入卖出均收取），印花税默认千1（仅卖出收取）</p>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={loading}>
            <Play className="w-4 h-4 mr-2" />
            开始回测
          </Button>
        </div>
      </form>
    </div>
  );
}
