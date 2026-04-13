'use client';

import { useState } from 'react';
import BackButton from '@/components/layout/BackButton';
import { AlertTriangle, ChevronDown } from 'lucide-react';

/* ── Old quote placeholder (commented out) ────────────────────────── */
// interface QuoteData {
//   c: number; h: number; l: number; o: number;
//   pc: number; dp: number; d: number; t: number;
// }
// const [quote, setQuote] = useState<QuoteData | null>(null);
// const [loading, setLoading] = useState(false);
// const [error, setError] = useState<string | null>(null);
// async function fetchQuote() {
//   setLoading(true); setError(null);
//   try {
//     const res = await fetch('/api/portfolio/quote?symbol=AAPL');
//     const data = await res.json();
//     if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
//     setQuote(data);
//   } catch (err) { setError((err as Error).message); }
//   finally { setLoading(false); }
// }

/* ── Dummy data ───────────────────────────────────────────────────── */

const HOLDINGS = [
  { ticker: 'AAPL',  account: 'Fidelity',  qty: 1240.00,    price: 189.43,    value: 234893.20,  returnPct: 22.4,  trend: 'M0,10 L10,8 L20,12 L30,4 L40,6 L50,2 L60,0' },
  { ticker: 'BTC',   account: 'Coinbase',   qty: 4.1209,     price: 64102.12,  value: 264158.44,  returnPct: 48.1,  trend: 'M0,14 L10,12 L20,8 L30,10 L40,4 L50,6 L60,0' },
  { ticker: 'VOO',   account: 'Fidelity',   qty: 320.55,     price: 482.11,    value: 154541.26,  returnPct: 8.2,   trend: 'M0,12 L10,13 L20,10 L30,8 L40,6 L50,4 L60,2' },
  { ticker: 'NVDA',  account: 'Schwab',     qty: 42.00,      price: 875.40,    value: 36766.80,   returnPct: 62.1,  trend: 'M0,14 L10,12 L20,10 L30,6 L40,4 L50,2 L60,0' },
  { ticker: 'ETH',   account: 'Coinbase',   qty: 12.50,      price: 3412.60,   value: 42657.50,   returnPct: 31.7,  trend: 'M0,12 L10,14 L20,8 L30,6 L40,10 L50,4 L60,0' },
  { ticker: 'MSFT',  account: 'Fidelity',   qty: 85.00,      price: 417.88,    value: 35519.80,   returnPct: 15.3,  trend: 'M0,14 L10,10 L20,8 L30,12 L40,6 L50,4 L60,2' },
  { ticker: 'GOOGL', account: 'Fidelity',   qty: 200.00,     price: 175.98,    value: 35196.00,   returnPct: 6.8,   trend: 'M0,8 L10,10 L20,12 L30,6 L40,8 L50,4 L60,2' },
  { ticker: 'AMZN',  account: 'Schwab',     qty: 150.00,     price: 185.60,    value: 27840.00,   returnPct: 11.2,  trend: 'M0,14 L10,12 L20,10 L30,8 L40,4 L50,6 L60,2' },
  { ticker: 'BND',   account: 'Fidelity',   qty: 420.00,     price: 72.33,     value: 30378.60,   returnPct: 2.1,   trend: 'M0,8 L10,8 L20,6 L30,6 L40,4 L50,4 L60,4' },
  { ticker: 'SCHD',  account: 'Schwab',     qty: 510.00,     price: 79.88,     value: 40738.80,   returnPct: 4.5,   trend: 'M0,10 L10,8 L20,10 L30,8 L40,6 L50,6 L60,4' },
  { ticker: 'SOL',   account: 'Coinbase',   qty: 180.00,     price: 148.22,    value: 26679.60,   returnPct: -5.4,  trend: 'M0,2 L10,4 L20,6 L30,8 L40,10 L50,12 L60,14' },
  { ticker: 'USDC',  account: 'Coinbase',   qty: 19422.44,   price: 1.00,      value: 19422.44,   returnPct: 0.0,   trend: 'M0,7 L10,7 L20,7 L30,7 L40,7 L50,7 L60,7' },
];

const ALLOCATION = [
  { label: 'Stocks', pct: 45, color: '#46f1c5' },
  { label: 'Crypto', pct: 20, color: '#22d3ee' },
  { label: 'Cash',   pct: 15, color: '#8b949e' },
  { label: 'Bonds',  pct: 10, color: '#3b82f6' },
  { label: 'RE',     pct: 7,  color: '#f59e0b' },
  { label: 'Other',  pct: 3,  color: '#ef4444' },
];

const BENCHMARKS = [
  { label: 'SPY',  color: '#46f1c5' },
  { label: 'VTI',  color: '#3b82f6' },
  { label: 'QQQ',  color: '#22d3ee' },
  { label: '60/40', color: '#a855f7' },
  { label: 'BTC',  color: '#f97316' },
];

const SECTIONS = ['Allocation Views', 'Performance', 'Tax & Transactions'];

/* ── Helpers ──────────────────────────────────────────────────────── */

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ── Component ────────────────────────────────────────────────────── */

export default function PortfolioPage() {
  const [activeBenchmark, setActiveBenchmark] = useState('SPY');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <>
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BackButton />
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
            Portfolio
          </h1>
        </div>
        <p className="text-xs text-on-surface-variant">
          Data sources: Finnhub (free) · CoinGecko (free) · Manual entry (free)
        </p>
      </div>

      {/* ── Bento Hero ───────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        {/* Net Worth Chart */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-low border border-outline p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <p className="text-[10px] text-on-surface-variant section-header mb-1">Net Worth</p>
              <h3 className="text-4xl font-mono text-primary font-bold tracking-tight">
                $847,291.44
              </h3>
            </div>
            <span className="bg-primary/10 text-primary text-[10px] px-2 py-1 font-mono">
              +12.4% (YTD)
            </span>
          </div>
          <div className="h-48 w-full relative">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 200">
              <path className="fill-primary/5" d="M0,180 Q100,160 200,150 T400,100 T600,60 T800,40 L800,200 L0,200 Z" />
              <path d="M0,180 Q100,160 200,150 T400,100 T600,60 T800,40" fill="none" stroke="#46f1c5" strokeWidth="2.5" />
            </svg>
            <div className="absolute inset-0 flex justify-between items-end pb-1 px-1">
              <span className="font-mono text-[9px] text-on-surface-variant/50">JAN 01</span>
              <span className="font-mono text-[9px] text-on-surface-variant/50">MAR 15</span>
              <span className="font-mono text-[9px] text-on-surface-variant/50">JUN 30</span>
              <span className="font-mono text-[9px] text-on-surface-variant/50">SEP 12</span>
              <span className="font-mono text-[9px] text-primary">LIVE</span>
            </div>
          </div>
        </div>

        {/* Allocation Donut */}
        <div className="col-span-12 lg:col-span-4 bg-surface-container border border-outline p-6 flex flex-col items-center justify-center text-center">
          <p className="text-[10px] text-on-surface-variant section-header mb-6">Asset Allocation</p>
          <div className="relative w-48 h-48 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="#262a31" strokeWidth="4" />
              {(() => {
                let offset = 0;
                return ALLOCATION.map((seg) => {
                  const el = (
                    <circle
                      key={seg.label}
                      cx="18" cy="18" r="15.9"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="4"
                      strokeDasharray={`${seg.pct} 100`}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += seg.pct;
                  return el;
                });
              })()}
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-sm font-bold uppercase text-on-surface">Stocks</span>
              <span className="text-lg font-mono font-bold text-primary">45%</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-6 w-full text-[10px] text-on-surface-variant">
            {ALLOCATION.slice(0, 3).map((seg) => (
              <div key={seg.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ backgroundColor: seg.color }} />
                {seg.label.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Performance Stats ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-primary/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Total Invested</p>
          <p className="font-mono text-xl text-on-surface">$512,900.00</p>
        </div>
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-secondary/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Total Return</p>
          <p className="font-mono text-xl text-secondary">+$334,391.44</p>
        </div>
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-on-surface-variant/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Annualized</p>
          <p className="font-mono text-xl text-on-surface">14.2%</p>
        </div>
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-tertiary/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Cash Position</p>
          <p className="font-mono text-xl text-on-surface">$102,492.12</p>
        </div>
      </div>

      {/* ── Benchmark Comparison ─────────────────────────────────── */}
      <div className="mb-6">
        <h4 className="text-xs text-on-surface-variant section-header mb-4">Benchmark Comparison</h4>
        <div className="flex flex-wrap gap-2">
          {BENCHMARKS.map((b) => (
            <button
              key={b.label}
              onClick={() => setActiveBenchmark(b.label)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-colors ${
                activeBenchmark === b.label
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: activeBenchmark === b.label ? 'var(--color-on-primary)' : b.color,
              }} />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Holdings Table ────────────────────────────────────────── */}
      <div className="bg-surface-container-low border border-outline mb-6 overflow-hidden">
        <div className="p-4 border-b border-outline flex justify-between items-center bg-surface-container">
          <h4 className="text-xs text-on-surface section-header">Holdings Details</h4>
          <span className="text-[10px] font-mono text-on-surface-variant">
            Total: {HOLDINGS.length} Assets
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-on-surface-variant bg-surface-container-lowest">
              <tr className="section-header text-[10px]">
                <th className="p-4">Asset</th>
                <th className="p-4">Account</th>
                <th className="p-4">Qty</th>
                <th className="p-4">Price</th>
                <th className="p-4 text-right">Market Value</th>
                <th className="p-4 text-right">Return</th>
                <th className="p-4">7D Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {HOLDINGS.map((h) => (
                <tr key={h.ticker} className="hover:bg-surface-bright transition-colors duration-75">
                  <td className="p-4 font-bold text-on-surface">{h.ticker}</td>
                  <td className="p-4 text-on-surface-variant">{h.account}</td>
                  <td className="p-4 font-mono">{fmt(h.qty)}</td>
                  <td className="p-4 font-mono">${fmt(h.price)}</td>
                  <td className="p-4 text-right font-mono font-bold">${fmt(h.value)}</td>
                  <td className={`p-4 text-right font-mono ${h.returnPct > 0 ? 'text-secondary' : h.returnPct < 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                    {h.returnPct > 0 ? '+' : ''}{h.returnPct}%
                  </td>
                  <td className="p-4">
                    <svg className="w-16 h-4 fill-none" viewBox="0 0 60 14">
                      <path
                        d={h.trend}
                        strokeWidth="2"
                        stroke={h.returnPct >= 0 ? 'var(--color-secondary)' : 'var(--color-error)'}
                      />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Insights Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-container border border-outline p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-tertiary-container" strokeWidth={1.5} />
            <h4 className="text-sm font-bold uppercase tracking-wider text-on-surface">
              Portfolio Insights
            </h4>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Your <span className="text-on-surface font-bold">Technology concentration</span> is
              12% above benchmark. Consider rebalancing into Healthcare or Consumer Staples.
            </p>
            <p className="text-xs text-secondary leading-relaxed flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              Outperforming 60/40 benchmark by 4.2% this quarter.
            </p>
          </div>
        </div>

        <div className="bg-surface-container border border-outline p-6 flex flex-col justify-between">
          <div>
            <h4 className="text-[10px] text-on-surface-variant section-header mb-1">
              Projected Annual Income
            </h4>
            <p className="text-xl font-mono text-on-surface">$12,490.12</p>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-mono mb-1.5 uppercase text-on-surface-variant">
              <span>Target $20,000</span>
              <span className="text-primary">62.4%</span>
            </div>
            <div className="h-1.5 w-full bg-surface-container-highest overflow-hidden">
              <div className="h-full bg-primary" style={{ width: '62.4%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Collapsible Sections ──────────────────────────────────── */}
      <div className="space-y-2 pb-12">
        {SECTIONS.map((section) => (
          <button
            key={section}
            onClick={() => setExpanded((p) => ({ ...p, [section]: !p[section] }))}
            className="w-full flex items-center justify-between p-4 bg-surface-container-low border border-outline hover:bg-surface-container transition-colors duration-75 group"
          >
            <span className="text-sm font-bold uppercase tracking-widest text-on-surface-variant group-hover:text-on-surface transition-colors duration-75">
              {section}
            </span>
            <ChevronDown
              size={18}
              strokeWidth={1.5}
              className={`text-on-surface-variant transition-transform duration-150 ${expanded[section] ? 'rotate-180' : ''}`}
            />
          </button>
        ))}
      </div>
    </>
  );
}
