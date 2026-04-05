'use client';

import { useState, useEffect } from 'react';

interface Transaction {
  id: number;
  timestamp: string;
  service: string;
  module: string;
  cost_usd: number;
  rail: string;
}

export default function RecentActivity() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    fetch('/api/transactions?limit=10')
      .then((r) => r.json())
      .then((data) => setTransactions(data.transactions ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-surface-container-low border border-outline p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="section-header text-xs text-on-surface-variant">
          Recent Activity
        </h3>
        <div className="flex gap-2">
          <span className="section-header text-[9px] text-on-surface-variant px-2 py-0.5 border border-outline">
            Service
          </span>
          <span className="section-header text-[9px] text-on-surface-variant px-2 py-0.5 border border-outline">
            Amount
          </span>
          <span className="section-header text-[9px] text-on-surface-variant px-2 py-0.5 border border-outline">
            Overall
          </span>
        </div>
      </div>

      <div className="space-y-0 divide-y divide-outline/30">
        {transactions.length === 0 ? (
          <div className="py-6 text-center text-on-surface-variant text-xs">
            No recent activity
          </div>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex justify-between items-center py-2 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-on-surface-variant w-36 shrink-0">
                  {tx.timestamp}
                </span>
                <span className="text-on-surface font-medium">
                  {tx.service}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-mono text-on-surface-variant">
                  {tx.module}
                </span>
                <span className="font-mono text-error">
                  -${tx.cost_usd.toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
