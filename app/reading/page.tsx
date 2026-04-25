'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import BackButton from '@/components/layout/BackButton';
import { GiOpenBook } from 'react-icons/gi';
import { DEMO_MODE } from '@/lib/config';

// ── Types ──────────────────────────────────────────────────────────────────

interface ReadingLog {
  id: number;
  date: string;
  pages: number;
}

// ── Demo data ──────────────────────────────────────────────────────────────

function generateDemoLogs(): ReadingLog[] {
  const logs: ReadingLog[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const pages = Math.floor(Math.random() * 40) + 10;
    logs.push({ id: i + 1, date: d.toLocaleDateString('en-CA'), pages });
  }
  return logs;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

function startOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString('en-CA');
}

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReadingPage() {
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const loadLogs = useCallback(async () => {
    if (DEMO_MODE) {
      setLogs(generateDemoLogs());
      return;
    }
    try {
      const res = await fetch('/api/reading/log');
      if (res.ok) setLogs(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ── Derived stats ────────────────────────────────────────────────────

  const todayStr = today();
  const yesterdayStr = yesterday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();

  const todayPages = useMemo(
    () => logs.filter((l) => l.date === todayStr).reduce((s, l) => s + l.pages, 0),
    [logs, todayStr]
  );

  const yesterdayPages = useMemo(
    () => logs.filter((l) => l.date === yesterdayStr).reduce((s, l) => s + l.pages, 0),
    [logs, yesterdayStr]
  );

  const weekPages = useMemo(
    () => logs.filter((l) => l.date >= weekStart).reduce((s, l) => s + l.pages, 0),
    [logs, weekStart]
  );

  const monthPages = useMemo(
    () => logs.filter((l) => l.date >= monthStart).reduce((s, l) => s + l.pages, 0),
    [logs, monthStart]
  );

  const streak = useMemo(() => {
    const dates = new Set(logs.map((l) => l.date));
    let count = 0;
    const d = new Date();
    // If nothing today, start from yesterday
    if (!dates.has(d.toLocaleDateString('en-CA'))) d.setDate(d.getDate() - 1);
    while (dates.has(d.toLocaleDateString('en-CA'))) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [logs]);

  // ── Activity map (last 365 days) ─────────────────────────────────────

  // Activity map organized by week columns (like GitHub).
  // Each column = 1 week, each row = day of week (Sun=0 .. Sat=6).
  const activityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) map.set(l.date, (map.get(l.date) ?? 0) + l.pages);

    // Start from the Sunday 52 weeks ago
    const today = new Date();
    const startDay = new Date(today);
    startDay.setDate(startDay.getDate() - 364 - startDay.getDay()); // back to Sunday

    const cells: { date: string; pages: number; dow: number; week: number }[] = [];
    const d = new Date(startDay);
    let week = 0;
    while (d <= today) {
      const dateStr = d.toLocaleDateString('en-CA');
      cells.push({ date: dateStr, pages: map.get(dateStr) ?? 0, dow: d.getDay(), week });
      if (d.getDay() === 6) week++;
      d.setDate(d.getDate() + 1);
    }

    return { cells, weeks: week + 1 };
  }, [logs]);

  const maxPages = useMemo(
    () => Math.max(1, ...activityMap.cells.map((c) => c.pages)),
    [activityMap]
  );

  // ── Pages per day (last 30 days) ─────────────────────────────────────

  const dailyChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) map.set(l.date, (map.get(l.date) ?? 0) + l.pages);

    const days: { date: string; pages: number; avg: number }[] = [];
    const d = new Date();
    for (let i = 29; i >= 0; i--) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() - i);
      const dateStr = dd.toLocaleDateString('en-CA');
      days.push({ date: dateStr, pages: map.get(dateStr) ?? 0, avg: 0 });
    }
    // 7-day rolling average
    for (let i = 0; i < days.length; i++) {
      const window = days.slice(Math.max(0, i - 6), i + 1);
      days[i].avg = window.reduce((s, d) => s + d.pages, 0) / window.length;
    }
    return days;
  }, [logs]);

  const chartMax = useMemo(
    () => Math.max(1, ...dailyChart.map((d) => Math.max(d.pages, d.avg))),
    [dailyChart]
  );

  // ── Actions ──────────────────────────────────────────────────────────

  async function logPages(pages: number) {
    if (pages <= 0) return;
    setSaving(true);
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 300));
      setLogs((prev) => [{ id: Date.now(), date: todayStr, pages }, ...prev]);
      setSaving(false);
      setToast(`+${pages} pages`);
      setTimeout(() => setToast(''), 2000);
      return;
    }
    try {
      const res = await fetch('/api/reading/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      });
      if (res.ok) {
        const saved = await res.json();
        setLogs((prev) => [saved, ...prev]);
        setToast(`+${pages} pages`);
        setTimeout(() => setToast(''), 2000);
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 bg-primary text-on-primary px-4 py-2 text-xs font-bold font-mono">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <BackButton />
        <h1 className="text-xl font-bold tracking-tight text-on-surface">Reading</h1>
      </div>

      {/* Top section: Today + Book hero */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        {/* Today's entry */}
        <div className="col-span-12 md:col-span-8 bg-surface-container-low border border-outline-variant p-8 flex flex-col justify-between relative overflow-hidden group">
          <div>
            <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Today</h2>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-6xl font-bold text-primary">{todayPages}</span>
              <span className="text-sm text-on-surface-variant">pages</span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('pages') as HTMLInputElement;
                const n = parseInt(input.value, 10);
                if (n > 0) { logPages(n); input.value = ''; }
              }}
              className="flex gap-2"
            >
              <input
                name="pages"
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="Pages"
                disabled={saving}
                className="w-24 h-10 bg-surface-container-lowest border border-outline-variant text-sm px-3 text-on-surface font-mono focus:border-primary focus:outline-none disabled:opacity-30"
              />
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-4 border border-primary flex items-center justify-center text-on-primary bg-primary hover:brightness-110 transition-colors duration-75 disabled:opacity-30 text-xs font-bold"
              >
                Log
              </button>
            </form>
            <div className="text-xs font-mono text-on-surface-variant">
              Yesterday: {yesterdayPages} pages
            </div>
          </div>
        </div>

        {/* Book hero */}
        <div className="col-span-12 md:col-span-4 flex items-center justify-center min-h-[240px]">
          <div className="w-48 h-48 border-8 border-primary flex items-center justify-center">
            <GiOpenBook size={64} className="text-primary opacity-80" />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-surface-container border border-outline-variant p-5">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Streak</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl text-secondary">{streak}</span>
            <span className="text-xs text-on-surface-variant">days</span>
            {streak >= 7 && <span className="text-lg">🔥</span>}
          </div>
        </div>
        <div className="bg-surface-container border border-outline-variant p-5">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface-variant mb-3">This Week</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl text-on-surface">{weekPages}</span>
            <span className="text-xs text-on-surface-variant">pages</span>
          </div>
        </div>
        <div className="bg-surface-container border border-outline-variant p-5">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface-variant mb-3">This Month</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl text-on-surface">{monthPages}</span>
            <span className="text-xs text-on-surface-variant">pages</span>
          </div>
        </div>
      </div>

      {/* Activity map */}
      <div className="bg-surface-container border border-outline-variant p-6 mb-6">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface-variant">Activity Map</h3>
          <span className="text-xs font-mono text-on-surface-variant">Last 365 Days</span>
        </div>
        <div className="w-full bg-surface-container-lowest border border-outline-variant p-3 overflow-x-auto">
          <div className="grid gap-[2px]" style={{ gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '1fr', minWidth: '680px' }}>
            {activityMap.cells.map((cell, i) => {
              const intensity = cell.pages === 0 ? 0 : Math.min(4, Math.ceil((cell.pages / maxPages) * 4));
              const colors = ['bg-surface-bright', 'bg-primary/20', 'bg-primary/40', 'bg-primary/70', 'bg-primary'];
              return (
                <div
                  key={i}
                  className={`aspect-square ${colors[intensity]}`}
                  title={`${cell.date}: ${cell.pages} pages`}
                />
              );
            })}
          </div>
          <div className="flex justify-end items-center mt-2 gap-2 text-[10px] text-on-surface-variant font-mono">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-surface-bright" />
              <div className="w-3 h-3 bg-primary/30" />
              <div className="w-3 h-3 bg-primary/60" />
              <div className="w-3 h-3 bg-primary" />
            </div>
            <span>More</span>
          </div>
        </div>
      </div>

      {/* Pages per day chart */}
      <div className="bg-surface-container border border-outline-variant p-6 mb-12">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface-variant">Pages Per Day</h3>
          <div className="flex gap-4 text-[10px] font-mono">
            <span className="flex items-center text-on-surface-variant"><span className="w-2 h-2 bg-primary/40 mr-1" /> Daily</span>
            <span className="flex items-center text-primary"><span className="w-2 h-2 bg-primary mr-1" /> 7D Avg</span>
          </div>
        </div>
        <div className="w-full bg-surface-container-lowest border border-outline-variant p-4">
          <div className="h-56 flex">
            {/* Y axis */}
            <div className="flex flex-col justify-between h-full pr-3 text-[10px] font-mono text-on-surface-variant/50 border-r border-outline-variant text-right w-8">
              {(() => {
                // Nice round Y-axis ticks
                const step = chartMax <= 5 ? 1 : chartMax <= 20 ? 5 : chartMax <= 50 ? 10 : 25;
                const top = Math.ceil(chartMax / step) * step;
                const ticks = [];
                for (let v = top; v >= 0; v -= step) ticks.push(v);
                return ticks.map((v) => <span key={v}>{v}</span>);
              })()}
            </div>
            {/* Bars + line */}
            <div className="flex-1 flex items-end gap-[2px] px-1 relative">
              {dailyChart.map((d, i) => {
                const step = chartMax <= 5 ? 1 : chartMax <= 20 ? 5 : chartMax <= 50 ? 10 : 25;
                const top = Math.ceil(chartMax / step) * step;
                const barH = top > 0 ? (d.pages / top) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${d.date}: ${d.pages}pg`}>
                    <div className="bg-primary/30 w-full" style={{ height: `${barH}%` }} />
                  </div>
                );
              })}
              {/* 7-day avg line overlay */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox={`0 0 ${dailyChart.length} 100`}>
                <polyline
                  points={dailyChart.map((d, i) => {
                    const step = chartMax <= 5 ? 1 : chartMax <= 20 ? 5 : chartMax <= 50 ? 10 : 25;
                    const top = Math.ceil(chartMax / step) * step;
                    return `${i + 0.5},${100 - (top > 0 ? (d.avg / top) * 100 : 0)}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#46f1c5"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          </div>
          {/* X axis dates */}
          <div className="flex pl-10 mt-2">
            {dailyChart.map((d, i) => {
              // Show label every 7 days
              if (i % 7 !== 0) return <div key={i} className="flex-1" />;
              const parts = d.date.split('-');
              return (
                <div key={i} className="flex-1 text-[9px] font-mono text-on-surface-variant/50">
                  {parseInt(parts[1], 10)}/{parseInt(parts[2], 10)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
