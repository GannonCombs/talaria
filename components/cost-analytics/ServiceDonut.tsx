'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ServiceSpend {
  service: string;
  total: number;
  count: number;
}

interface ServiceDonutProps {
  data: ServiceSpend[];
  totalSpend: number;
}

const COLORS = [
  '#46f1c5',
  '#67df70',
  '#fbab29',
  '#ffcf91',
  '#31353c',
  '#8b949e',
];

export default function ServiceDonut({ data, totalSpend }: ServiceDonutProps) {
  return (
    <div className="bg-surface-container-low border border-outline flex flex-col h-80">
      <div className="p-4 border-b border-outline bg-surface-container">
        <span className="section-header text-xs text-on-surface">
          Expenditure by Service
        </span>
      </div>
      <div className="flex-1 p-6 flex flex-col md:flex-row items-center gap-6">
        {data.length === 0 ? (
          <div className="flex items-center justify-center w-full h-full text-on-surface-variant text-sm">
            No service data yet
          </div>
        ) : (
          <>
            {/* Donut */}
            <div className="relative w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="total"
                    nameKey="service"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={56}
                    strokeWidth={0}
                  >
                    {data.map((_entry, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-xs font-bold text-on-surface">
                  ${totalSpend.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2 w-full">
              {data.map((item, i) => (
                <div
                  key={item.service}
                  className="flex justify-between items-center text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2"
                      style={{
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                    <span className="text-on-surface">{item.service}</span>
                  </div>
                  <span className="font-mono">${item.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
