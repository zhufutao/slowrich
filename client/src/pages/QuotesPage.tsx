import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { showToast } from '../components/ui/Toast';
import type { DailyQuote, PaginatedData } from '../types';
import { mockQuotes, mockStocks, fetchMockData } from '../mock/data';
import { formatNumber, formatMoney, formatVolume, pctChgColor } from '../utils/format';

const USE_MOCK = true;

export default function QuotesPage() {
  const [stockId, setStockId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quotes, setQuotes] = useState<DailyQuote[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const handleSearch = useCallback(async () => {
    if (!stockId) { showToast('请选择股票', 'error'); return; }
    setLoading(true);
    try {
      if (USE_MOCK) {
        const data = mockQuotes;
        setTotal(data.length);
        const start = (page - 1) * pageSize;
        setQuotes(data.slice(start, start + pageSize));
        setSearched(true);
      }
    } finally {
      setLoading(false);
    }
  }, [stockId, startDate, endDate, page]);

  useEffect(() => {
    if (searched) handleSearch();
  }, [page]);

  const stockOptions = [
    { value: '', label: '请选择股票' },
    ...mockStocks.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` })),
  ];

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-600" />
          行情查看
        </h1>
        <p className="mt-1 text-sm text-gray-500">查看股票每日行情明细数据</p>
      </div>

      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <Select label="选择股票" options={stockOptions} value={stockId} onChange={(e) => setStockId(e.target.value)} />
            <Input label="起始日期" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="结束日期" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Button onClick={handleSearch} loading={loading}>
              <Search className="w-4 h-4 mr-1" /> 查询
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>开盘价</TableHead>
                <TableHead>最高价</TableHead>
                <TableHead>最低价</TableHead>
                <TableHead>收盘价</TableHead>
                <TableHead>前收盘</TableHead>
                <TableHead>涨跌幅</TableHead>
                <TableHead>成交量</TableHead>
                <TableHead>成交额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!searched ? (
                <TableRow>
                  <TableCell className="text-center text-gray-400 py-12" colSpan={9}>
                    请选择股票并点击查询
                  </TableCell>
                </TableRow>
              ) : quotes.length === 0 ? (
                <TableRow>
                  <TableCell className="text-center text-gray-400 py-12" colSpan={9}>
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((q) => (
                  <TableRow key={q.trade_date}>
                    <TableCell className="font-mono text-gray-900">{q.trade_date}</TableCell>
                    <TableCell>{formatNumber(q.open)}</TableCell>
                    <TableCell>{formatNumber(q.high)}</TableCell>
                    <TableCell>{formatNumber(q.low)}</TableCell>
                    <TableCell className="font-medium">{formatNumber(q.close)}</TableCell>
                    <TableCell>{formatNumber(q.pre_close)}</TableCell>
                    <TableCell className={pctChgColor(q.pct_chg)}>
                      <span className="font-medium">
                        {q.pct_chg > 0 ? '+' : ''}{q.pct_chg.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500">{formatVolume(q.volume)}</TableCell>
                    <TableCell className="text-gray-500">{formatMoney(q.amt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {searched && totalPages > 1 && (
            <div className="px-6 py-4">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
