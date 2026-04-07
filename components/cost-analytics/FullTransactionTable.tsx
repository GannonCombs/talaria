'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Zap, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { formatTxnTimestamp } from '@/lib/time';

interface Transaction {
  id: number;
  timestamp: string;
  service: string;
  module: string;
  endpoint: string | null;
  rail: 'tempo' | 'card';
  cost_usd: number;
}

interface FullTransactionTableProps {
  dateFrom?: string;
  dateTo?: string;
  onExportCsv: (transactions: Transaction[]) => void;
}

export default function FullTransactionTable({
  dateFrom,
  dateTo,
  onExportCsv,
}: FullTransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const limit = 25;

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const res = await fetch(`/api/transactions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
    }
  }, [page, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bg-surface-container-low border border-outline">
      {/* Toolbar */}
      <div className="p-4 border-b border-outline flex flex-col md:flex-row justify-between items-center gap-4 bg-surface-container">
        <div className="relative w-full md:w-96">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="text"
            placeholder="Filter by module, service, or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline text-xs px-10 py-2 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </div>
        <button
          onClick={() => onExportCsv(transactions)}
          className="flex items-center gap-2 px-4 py-2 border border-outline section-header text-xs hover:bg-surface-bright"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-high border-b border-outline">
            <tr>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant">
                Timestamp
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant">
                Service
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant">
                Module
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant">
                Endpoint
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant text-center">
                Payment Rail
              </th>
              <th className="px-4 py-3 section-header text-[10px] text-on-surface-variant text-right">
                Cost
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline/30">
            {transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-on-surface-variant text-sm"
                >
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-surface-container-highest"
                >
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                    {formatTxnTimestamp(tx.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-on-surface">
                    {tx.service}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {tx.module}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-on-surface-variant">
                    {tx.endpoint ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tx.rail === 'tempo' ? (
                      <Zap size={16} className="inline text-primary" />
                    ) : (
                      <CreditCard
                        size={16}
                        className="inline text-on-surface-variant"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm font-bold text-right text-on-surface">
                    ${tx.cost_usd.toFixed(3)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-3 bg-surface-container border-t border-outline flex justify-between items-center">
        <span className="section-header text-[10px] text-on-surface-variant">
          Showing {total === 0 ? 0 : page * limit + 1}-
          {Math.min((page + 1) * limit, total)} of {total} entries
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-8 h-8 flex items-center justify-center border border-outline hover:bg-surface-bright disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="w-8 h-8 flex items-center justify-center border border-outline hover:bg-surface-bright disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
