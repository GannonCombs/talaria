'use client';

import { useState, useEffect, useCallback } from 'react';

interface CostStats {
  today: number;
  month: number;
  lifetime: number;
  totalCalls: number;
  avgPerSession: number;
}

export function useCostTracker() {
  const [stats, setStats] = useState<CostStats>({
    today: 0,
    month: 0,
    lifetime: 0,
    totalCalls: 0,
    avgPerSession: 0,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions/stats');
      if (res.ok) {
        const data = await res.json();
        setStats({
          today: data.today,
          month: data.month,
          lifetime: data.lifetime,
          totalCalls: data.totalCalls,
          avgPerSession: data.avgPerSession,
        });
      }
    } catch {
      // Silently fail — TopBar will show stale data
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...stats, refresh };
}
