'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DailySpend {
  date: string;
  total: number;
}

interface SpendChartProps {
  data: DailySpend[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SpendChart({ data }: SpendChartProps) {
  return (
    <div className="bg-surface-container-low border border-outline flex flex-col h-80">
      <div className="p-4 border-b border-outline flex justify-between items-center bg-surface-container">
        <span className="section-header text-xs text-on-surface">
          Daily Spend Performance
        </span>
      </div>
      <div className="flex-1 p-4">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
            No spend data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#46f1c5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#46f1c5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#30363d"
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: '#8b949e' }}
                axisLine={{ stroke: '#30363d' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#8b949e' }}
                axisLine={{ stroke: '#30363d' }}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: '#1c2026',
                  border: '1px solid #30363d',
                  borderRadius: 0,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#8b949e' }}
                itemStyle={{ color: '#46f1c5' }}
                labelFormatter={(label) => formatDate(String(label))}
                formatter={(value) => [`$${Number(value).toFixed(3)}`, 'Spend']}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#46f1c5"
                strokeWidth={2}
                fill="url(#spendGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
