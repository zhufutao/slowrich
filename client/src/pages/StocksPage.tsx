import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { showToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import type { Stock, PaginatedData } from '../types';
import { mockStocks, fetchMockData } from '../mock/data';
import { formatDateTime } from '../utils/format';

const USE_MOCK = true;

export default function StocksPage() {
  const { isAdmin } = useAuth();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [form, setForm] = useState({ code: '', name: '', market: 'SH' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const pageSize = 20;

  const loadStocks = useCallback(async () => {
    if (USE_MOCK) {
      const filtered = mockStocks.filter(
        (s) => !search || s.code.includes(search) || s.name.includes(search)
      );
      const start = (page - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize);
      setStocks(paged);
      setTotal(filtered.length);
      return;
    }
    // Mock: simulate load
    await new Promise((r) => setTimeout(r, 300));
  }, [page, search]);

  useEffect(() => { loadStocks(); }, [loadStocks]);

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!form.code) errs.code = '请输入股票代码';
    else if (!/^\d{6}$/.test(form.code)) errs.code = '股票代码为6位数字';
    if (!form.name) errs.name = '请输入股票名称';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = () => {
    if (!validateForm()) return;
    const newStock: Stock = {
      id: `s_${Date.now()}`,
      code: form.code,
      name: form.name,
      market: form.market as 'SH' | 'SZ' | 'BJ',
      created_at: new Date().toISOString(),
    };
    mockStocks.push(newStock);
    setShowAddModal(false);
    setForm({ code: '', name: '', market: 'SH' });
    setFormErrors({});
    loadStocks();
    showToast('添加成功', 'success');
  };

  const handleEdit = () => {
    if (!validateForm() || !selectedStock) return;
    const idx = mockStocks.findIndex((s) => s.id === selectedStock.id);
    if (idx >= 0) {
      mockStocks[idx].name = form.name;
      mockStocks[idx].market = form.market as 'SH' | 'SZ' | 'BJ';
    }
    setShowEditModal(false);
    setFormErrors({});
    loadStocks();
    showToast('修改成功', 'success');
  };

  const handleDelete = () => {
    if (!selectedStock) return;
    const idx = mockStocks.findIndex((s) => s.id === selectedStock.id);
    if (idx >= 0) mockStocks.splice(idx, 1);
    setShowDeleteModal(false);
    loadStocks();
    showToast('删除成功', 'success');
  };

  const openEdit = (stock: Stock) => {
    setSelectedStock(stock);
    setForm({ code: stock.code, name: stock.name, market: stock.market });
    setShowEditModal(true);
  };

  const openDelete = (stock: Stock) => {
    setSelectedStock(stock);
    setShowDeleteModal(true);
  };

  const marketOptions = [
    { value: 'SH', label: '上交所 (SH)' },
    { value: 'SZ', label: '深交所 (SZ)' },
    { value: 'BJ', label: '北交所 (BJ)' },
  ];

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary-600" />
            股票管理
          </h1>
          <p className="mt-1 text-sm text-gray-500">管理股票代码池，共 {total} 只股票</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setForm({ code: '', name: '', market: 'SH' }); setFormErrors({}); setShowAddModal(true); }}>
            <Plus className="w-4 h-4 mr-1" /> 新增股票
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索代码或名称..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>股票代码</TableHead>
                <TableHead>股票名称</TableHead>
                <TableHead>市场</TableHead>
                <TableHead>创建时间</TableHead>
                {isAdmin && <TableHead>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.length === 0 ? (
                <TableRow>
                  <TableCell className="text-center text-gray-400 py-8" colSpan={isAdmin ? 5 : 4}>
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                stocks.map((stock) => (
                  <TableRow key={stock.id}>
                    <TableCell className="font-mono font-medium">{stock.code}</TableCell>
                    <TableCell>{stock.name}</TableCell>
                    <TableCell>
                      <Badge variant={stock.market === 'SH' ? 'info' : stock.market === 'SZ' ? 'success' : 'warning'}>
                        {stock.market}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">{formatDateTime(stock.created_at)}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(stock)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openDelete(stock)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="px-6 py-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </CardBody>
      </Card>

      {/* Add Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="新增股票">
        <div className="space-y-4">
          <Input label="股票代码" placeholder="如 600036" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} error={formErrors.code} />
          <Input label="股票名称" placeholder="如 招商银行" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={formErrors.name} />
          <Select label="市场" options={marketOptions} value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="flex-1" onClick={handleAdd}>确认添加</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="修改股票">
        <div className="space-y-4">
          <Input label="股票代码" value={form.code} disabled />
          <Input label="股票名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={formErrors.name} />
          <Select label="市场" options={marketOptions} value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowEditModal(false)}>取消</Button>
            <Button className="flex-1" onClick={handleEdit}>保存修改</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="确认删除">
        <div className="space-y-4">
          <p className="text-gray-600">
            确定要删除股票 <span className="font-semibold text-gray-900">{selectedStock?.code} {selectedStock?.name}</span> 吗？
          </p>
          <p className="text-sm text-red-500">⚠️ 删除后关联的行情数据也将被清除，此操作不可撤销。</p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteModal(false)}>取消</Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete}>确认删除</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
