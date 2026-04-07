'use client';

import { useState, useEffect, useCallback } from 'react';
import BackButton from '@/components/layout/BackButton';
import SpendChart from '@/components/cost-analytics/SpendChart';
import ServiceDonut from '@/components/cost-analytics/ServiceDonut';
import InsightCards from '@/components/cost-analytics/InsightCards';
import FullTransactionTable from '@/components/cost-analytics/FullTransactionTable';
import { formatTxnTimestamp } from '@/lib/time';

interface Stats {
  today: number;
  month: number;
  lifetime: number;
  totalCalls: number;
  avgPerSession: number;
  byService: { service: string; total: number; count: number }[];
  daily: { date: string; total: number }[];
}

const TIME_RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: 3650 },
] as const;

function getDateFrom(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function exportCsv(
  transactions: {
    timestamp: string;
    service: string;
    module: string;
    endpoint: string | null;
    rail: string;
    cost_usd: number;
  }[]
) {
  const header = 'Timestamp,Service,Module,Endpoint,Rail,Cost\n';
  const rows = transactions
    .map(
      (t) =>
        `"${formatTxnTimestamp(t.timestamp)}","${t.service}","${t.module}","${t.endpoint ?? ''}","${t.rail}",${t.cost_usd}`
    )
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `talaria-transactions-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CostAnalyticsPage() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  const days = TIME_RANGES[rangeIdx].days;

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/transactions/stats?days=${days}`);
    if (res.ok) {
      setStats(await res.json());
    }
  }, [days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const dateFrom = getDateFrom(days);

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BackButton />
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">
              Cost Analytics
            </h1>
          </div>
          <p className="section-header text-[10px] text-on-surface-variant ml-8">
            Operational Expenditure Monitoring
          </p>
        </div>
        <div className="flex gap-1 bg-surface-container-low border border-outline p-1">
          {TIME_RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1 section-header text-[10px] ${
                i === rangeIdx
                  ? 'bg-surface-container-highest text-primary'
                  : 'hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-0 border border-outline mb-6">
        {[
          { label: 'Lifetime Spend', value: `$${(stats?.lifetime ?? 0).toFixed(2)}` },
          { label: 'This Month', value: `$${(stats?.month ?? 0).toFixed(2)}` },
          { label: 'Today', value: `$${(stats?.today ?? 0).toFixed(2)}` },
          {
            label: 'Total Calls',
            value: (stats?.totalCalls ?? 0).toLocaleString(),
          },
          {
            label: 'Avg Cost / Session',
            value: `$${(stats?.avgPerSession ?? 0).toFixed(2)}`,
          },
        ].map((card, i) => (
          <div
            key={card.label}
            className={`p-4 bg-surface-container-lowest ${
              i < 4 ? 'border-r border-outline' : ''
            }`}
          >
            <p className="section-header text-[10px] text-on-surface-variant mb-2">
              {card.label}
            </p>
            <p className="font-mono text-2xl font-bold text-on-surface">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-6">
        <div className="lg:col-span-6">
          <SpendChart data={stats?.daily ?? []} />
        </div>
        <div className="lg:col-span-4">
          <ServiceDonut
            data={stats?.byService ?? []}
            totalSpend={stats?.month ?? 0}
          />
        </div>
      </div>

      {/* Transaction Table */}
      <div className="mb-6">
        <FullTransactionTable
          dateFrom={dateFrom}
          onExportCsv={exportCsv}
        />
      </div>

      {/* Insight Cards */}
      <InsightCards byService={stats?.byService ?? []} />
    </>
  );
}
