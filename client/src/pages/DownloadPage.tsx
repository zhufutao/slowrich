import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Plus, RefreshCw, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import type { DownloadTask, DownloadStatus } from '../types';
import { mockDownloadTasks, mockStocks } from '../mock/data';
import { formatDateTime } from '../utils/format';

const USE_MOCK = true;

const statusConfig: Record<DownloadStatus, { label: string; variant: 'default' | 'success' | 'danger' | 'warning' | 'info'; icon: typeof Clock }> = {
  pending: { label: '等待中', variant: 'default', icon: Clock },
  running: { label: '下载中', variant: 'info', icon: Loader2 },
  completed: { label: '已完成', variant: 'success', icon: CheckCircle },
  failed: { label: '失败', variant: 'danger', icon: AlertCircle },
  partial: { label: '部分完成', variant: 'warning', icon: AlertCircle },
};

export default function DownloadPage() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorTask, setErrorTask] = useState<DownloadTask | null>(null);
  const [form, setForm] = useState({ stock_id: '', start_date: '', end_date: '', data_source: 'auto' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTasks = useCallback(async () => {
    if (USE_MOCK) {
      let filtered = [...mockDownloadTasks];
      if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
      setTasks(filtered);
      return;
    }
  }, [statusFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Poll for running tasks
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running');
    if (hasRunning) {
      pollRef.current = setInterval(() => {
        mockDownloadTasks.forEach((t) => {
          if (t.status === 'running') {
            t.progress = Math.min(100, t.progress + 2);
            t.downloaded_days = Math.floor(t.total_days * t.progress / 100);
            if (t.progress >= 100) {
              t.status = 'completed';
              t.progress = 100;
              t.downloaded_days = t.total_days;
            }
          }
        });
        loadTasks();
      }, 2000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tasks, loadTasks]);

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!form.stock_id) errs.stock_id = '请选择股票';
    if (!form.start_date) errs.start_date = '请选择起始日期';
    if (!form.end_date) errs.end_date = '请选择结束日期';
    if (form.start_date && form.end_date && form.start_date > form.end_date) errs.end_date = '结束日期不能早于起始日期';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = () => {
    if (!validateForm()) return;
    const stock = mockStocks.find((s) => s.id === form.stock_id);
    const newTask: DownloadTask = {
      id: `dt_${Date.now()}`,
      stock_id: form.stock_id,
      stock_name: stock?.name || '',
      start_date: form.start_date,
      end_date: form.end_date,
      data_source: form.data_source,
      status: 'pending',
      progress: 0,
      downloaded_days: 0,
      total_days: 500,
      created_at: new Date().toISOString(),
    };
    mockDownloadTasks.unshift(newTask);
    // Simulate starting
    setTimeout(() => { newTask.status = 'running'; loadTasks(); }, 1000);
    setShowCreateModal(false);
    setForm({ stock_id: '', start_date: '', end_date: '', data_source: 'auto' });
    setFormErrors({});
    loadTasks();
    showToast('下载任务已创建', 'success');
  };

  const handleResume = (task: DownloadTask) => {
    const idx = mockDownloadTasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      mockDownloadTasks[idx].status = 'running';
      mockDownloadTasks[idx].error_msg = null;
      loadTasks();
      showToast('已恢复下载', 'info');
    }
  };

  const handleRetry = (task: DownloadTask) => {
    const idx = mockDownloadTasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      mockDownloadTasks[idx].status = 'running';
      mockDownloadTasks[idx].error_msg = null;
      loadTasks();
      showToast('正在重试', 'info');
    }
  };

  const showError = (task: DownloadTask) => {
    setErrorTask(task);
    setShowErrorModal(true);
  };

  const stockOptions = [
    { value: '', label: '请选择股票' },
    ...mockStocks.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` })),
  ];

  const statusFilterOptions = [
    { value: '', label: '全部状态' },
    { value: 'pending', label: '等待中' },
    { value: 'running', label: '下载中' },
    { value: 'completed', label: '已完成' },
    { value: 'failed', label: '失败' },
    { value: 'partial', label: '部分完成' },
  ];

  const dataSourceOptions = [
    { value: 'auto', label: '自动选择' },
    { value: 'eastmoney', label: '东方财富' },
    { value: 'tushare', label: 'Tushare Pro' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Download className="w-6 h-6 text-primary-600" />
            数据下载
          </h1>
          <p className="mt-1 text-sm text-gray-500">下载和管理股票行情数据</p>
        </div>
        <Button onClick={() => { setForm({ stock_id: '', start_date: '', end_date: '', data_source: 'auto' }); setFormErrors({}); setShowCreateModal(true); }}>
          <Plus className="w-4 h-4 mr-1" /> 创建下载任务
        </Button>
      </div>

      <Card>
        <CardHeader>
          <Select options={statusFilterOptions} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-40" />
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>股票</TableHead>
                <TableHead>时间区间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length === 0 ? (
                <TableRow>
                  <TableCell className="text-center text-gray-400 py-8" colSpan={6}>暂无下载任务</TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => {
                  const sc = statusConfig[task.status];
                  const StatusIcon = sc.icon;
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.stock_name}</TableCell>
                      <TableCell className="text-gray-500 text-xs">{task.start_date} ~ {task.end_date}</TableCell>
                      <TableCell>
                        <Badge variant={sc.variant}>
                          <StatusIcon className={`w-3 h-3 mr-1 ${task.status === 'running' ? 'animate-spin' : ''}`} />
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={task.progress} size="sm" className="flex-1" />
                          <span className="text-xs text-gray-500 w-10 text-right">{task.progress}%</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{task.downloaded_days}/{task.total_days}天</p>
                      </TableCell>
                      <TableCell className="text-gray-500 text-xs">{formatDateTime(task.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(task.status === 'failed' || task.status === 'partial') && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleResume(task)} title="断点续传">
                                <RefreshCw className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleRetry(task)} title="重试">
                                <RefreshCw className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {task.error_msg && (
                            <Button variant="ghost" size="sm" onClick={() => showError(task)} className="text-red-500" title="查看错误">
                              <AlertCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Create Task Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="创建下载任务">
        <div className="space-y-4">
          <Select label="选择股票" options={stockOptions} value={form.stock_id} onChange={(e) => setForm({ ...form, stock_id: e.target.value })} error={formErrors.stock_id} />
          <Input label="起始日期" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} error={formErrors.start_date} />
          <Input label="结束日期" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} error={formErrors.end_date} />
          <Select label="数据源" options={dataSourceOptions} value={form.data_source} onChange={(e) => setForm({ ...form, data_source: e.target.value })} />
          <p className="text-xs text-gray-400">时间区间不能超过5年</p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCreateModal(false)}>取消</Button>
            <Button className="flex-1" onClick={handleCreate}>开始下载</Button>
          </div>
        </div>
      </Modal>

      {/* Error Modal */}
      <Modal open={showErrorModal} onClose={() => setShowErrorModal(false)} title="下载错误详情">
        <div className="space-y-3">
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{errorTask?.error_msg}</p>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <p><span className="font-medium">股票：</span>{errorTask?.stock_name}</p>
            <p><span className="font-medium">时间区间：</span>{errorTask?.start_date} ~ {errorTask?.end_date}</p>
            <p><span className="font-medium">已完成：</span>{errorTask?.downloaded_days}/{errorTask?.total_days}天</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-gray-700">建议操作：</p>
            <p className="text-gray-500">• 检查网络连接后点击"续传"</p>
            <p className="text-gray-500">• 尝试切换数据源后重试</p>
            <p className="text-gray-500">• 如持续失败，请联系管理员</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowErrorModal(false)}>关闭</Button>
            {errorTask && (
              <Button className="flex-1" onClick={() => { handleResume(errorTask); setShowErrorModal(false); }}>断点续传</Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
