'use client';

import { useState } from 'react';
import { Shield, AlertTriangle, Lock, Eye } from 'lucide-react';

/* ── Allocation data (five lenses on the same portfolio) ──────────── */

interface Slice {
  label: string;
  value: number;   // dollar amount
  color: string;
  assets?: string;  // representative tickers
}

const VIEWS = [
  { key: 'class',    label: 'Asset Class',     icon: Eye },
  { key: 'platform', label: 'Platform',        icon: Shield },
  { key: 'liquidity',label: 'Liquidity',       icon: Lock },
  { key: 'tax',      label: 'Tax Treatment',   icon: AlertTriangle },
  { key: 'public',   label: 'Public / Private', icon: Eye },
] as const;

type ViewKey = typeof VIEWS[number]['key'];

const DATA: Record<ViewKey, { slices: Slice[]; insight: string }> = {
  class: {
    slices: [
      { label: 'Stocks',     value: 381323, color: '#46f1c5', assets: 'AAPL, NVDA, MSFT, GOOGL, AMZN' },
      { label: 'Crypto',     value: 192454, color: '#22d3ee', assets: 'BTC, ETH, SOL, XRP, ADA, BNB' },
      { label: 'Cash',       value: 92300,  color: '#8b949e', assets: 'Checking, HYSA' },
      { label: 'Bonds / ETF',value: 129342, color: '#3b82f6', assets: 'VOO, BND, SCHD' },
      { label: 'Private',    value: 22700,  color: '#f59e0b', assets: 'Pre-IPO Fund, Rev Share' },
      { label: 'Other',      value: 29172,  color: '#ef4444', assets: '—' },
    ],
    insight: 'Technology-heavy equity concentration (62% of stocks). Consider diversifying into Healthcare or Consumer Staples for sector balance.',
  },
  platform: {
    slices: [
      { label: 'Fidelity',    value: 340207, color: '#46f1c5', assets: 'AAPL, VOO, NVDA, MSFT, GOOGL, HYSA' },
      { label: 'Coinbase',    value: 165656, color: '#f59e0b', assets: 'BTC, ETH, SOL' },
      { label: 'Merrill',     value: 98958,  color: '#a855f7', assets: 'AMZN, BND, SCHD' },
      { label: 'Wells Fargo', value: 42300,  color: '#3b82f6', assets: 'Checking' },
      { label: 'Kraken',      value: 20550,  color: '#22d3ee', assets: 'XRP, ADA' },
      { label: 'EquityZen',   value: 14200,  color: '#67df70', assets: 'Pre-IPO Fund' },
      { label: 'Binance',     value: 6248,   color: '#eab308', assets: 'BNB' },
      { label: 'Augment',     value: 8500,   color: '#ef4444', assets: 'Rev Share' },
    ],
    insight: 'Fidelity holds 48.9% of your portfolio. If any single platform experienced an outage or breach, your maximum exposure is ~$340K.',
  },
  liquidity: {
    slices: [
      { label: 'Liquid',      value: 612588, color: '#46f1c5', assets: 'All public equities, crypto, cash, bonds' },
      { label: 'Semi-Liquid', value: 148403, color: '#f59e0b', assets: 'Retirement accounts (penalty to access)' },
      { label: 'Illiquid',    value: 86300,  color: '#ef4444', assets: 'Pre-IPO Fund, Rev Share, locked staking' },
    ],
    insight: 'You could access $612K (72.3%) within 3 business days. The $86K illiquid portion is locked in private positions with no secondary market.',
  },
  tax: {
    slices: [
      { label: 'Taxable Brokerage', value: 420412, color: '#46f1c5', assets: 'Fidelity, Merrill, Coinbase, Kraken, Binance' },
      { label: 'Pre-Tax 401(k)',    value: 98200,  color: '#3b82f6', assets: 'Employer match, traditional contributions' },
      { label: 'Roth IRA',          value: 50000,  color: '#a855f7', assets: 'HYSA, index funds' },
      { label: 'Tax-Free / N/A',    value: 278679, color: '#8b949e', assets: 'Crypto (taxed on disposition), cash' },
    ],
    insight: 'Your taxable brokerage holds 49.6% of assets. With $42K in unrealized gains there, a Roth conversion ladder could save ~$8K in future taxes.',
  },
  public: {
    slices: [
      { label: 'Public',  value: 824591, color: '#46f1c5', assets: 'All exchange-traded equities, crypto, ETFs' },
      { label: 'Private', value: 22700,  color: '#f59e0b', assets: 'Pre-IPO Fund (EquityZen), Rev Share (Augment)' },
    ],
    insight: '97.3% of your portfolio is in publicly traded assets with real-time pricing. Private positions ($22.7K) are valued at last-known marks.',
  },
};

/* ── Donut SVG ────────────────────────────────────────────────────── */

function Donut({ slices, size = 220 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const r = 15.9;
  const circumference = 2 * Math.PI * r; // ~99.9

  // find the largest slice for center label
  const largest = slices.reduce((a, b) => (b.value > a.value ? b : a), slices[0]);
  const largestPct = ((largest.value / total) * 100).toFixed(1);

  let offset = 0;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        {/* Track */}
        <circle cx="18" cy="18" r={r} fill="transparent" stroke="#1c2026" strokeWidth="3.5" />
        {/* Segments */}
        {slices.map((sl) => {
          const pct = (sl.value / total) * 100;
          const gap = slices.length > 2 ? 0.6 : 0; // small gap between segments
          const dash = Math.max(pct - gap, 0.1);
          const el = (
            <circle
              key={sl.label}
              cx="18" cy="18" r={r}
              fill="transparent"
              stroke={sl.color}
              strokeWidth="3.5"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className="transition-all duration-300"
            />
          );
          offset += pct;
          return el;
        })}
        {/* Subtle inner ring for depth */}
        <circle cx="18" cy="18" r="12.5" fill="transparent" stroke="#10141a" strokeWidth="0.3" opacity="0.5" />
      </svg>
      {/* Center label */}
      <div className="absolute flex flex-col items-center">
        <span className="text-xs font-bold uppercase text-on-surface tracking-wide">{largest.label}</span>
        <span className="text-2xl font-mono font-bold text-primary">{largestPct}%</span>
      </div>
    </div>
  );
}

/* ── Breakdown row ────────────────────────────────────────────────── */

function BreakdownRow({ slice, total, maxValue }: { slice: Slice; total: number; maxValue: number }) {
  const pct = (slice.value / total) * 100;
  const barWidth = (slice.value / maxValue) * 100;

  return (
    <div className="group flex items-center gap-4 py-2.5 px-1 hover:bg-surface-container-high/50 transition-colors duration-75">
      {/* Color + label */}
      <div className="flex items-center gap-2.5 w-40 shrink-0">
        <div className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: slice.color }} />
        <span className="text-xs font-semibold text-on-surface truncate">{slice.label}</span>
      </div>
      {/* Bar */}
      <div className="flex-1 h-2 bg-surface-container-lowest overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${barWidth}%`, backgroundColor: slice.color }}
        />
      </div>
      {/* Dollar + pct */}
      <div className="flex items-baseline gap-3 shrink-0 w-44 justify-end">
        <span className="font-mono text-xs text-on-surface">
          ${slice.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span className="font-mono text-[11px] text-on-surface-variant w-12 text-right">
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* ── Real data helpers ────────────────────────────────────────────── */

interface HoldingInput {
  ticker: string;
  account: string;
  mktValue: number | null;
}

const STABLES = new Set(['USD', 'USDC', 'USDT']);

// Known crypto tickers — anything in this set is crypto, everything else is equity/fund
const CRYPTO_TICKERS = new Set([
  'BTC', 'ETH', 'SOL', 'ATOM', 'LINK', 'UNI', 'XLM', 'AAVE', 'ALGO',
  'COMP', 'FIL', 'GRT', 'IMX', 'LPT', 'SNX', 'ZRX', 'ICP', 'RNDR',
  'JTO', 'POL', 'ALCX', 'CGLD', 'FORTH', 'MIR', 'OXT', 'RARI', 'UMA',
  'NU', 'ETH2', 'MATIC', 'ADA', 'BNB', 'XRP', 'DOT', 'AVAX', 'DOGE',
]);

const ASSET_CLASS_COLORS: Record<string, string> = {
  Stocks: '#46f1c5',
  Crypto: '#22d3ee',
  Cash: '#8b949e',
  Other: '#ef4444',
};

const PLATFORM_COLORS: Record<string, string> = {
  Coinbase: '#f59e0b',
  Binance: '#eab308',
  Kraken: '#22d3ee',
  Fidelity: '#46f1c5',
  Merrill: '#a855f7',
  'Wells Fargo': '#3b82f6',
  EquityZen: '#67df70',
};

const PLATFORM_FALLBACK_COLORS = ['#46f1c5', '#f59e0b', '#22d3ee', '#3b82f6', '#a855f7', '#ef4444', '#67df70', '#8b949e'];

function buildRealData(holdings: HoldingInput[]): Partial<Record<ViewKey, { slices: Slice[]; insight: string }>> {
  const result: Partial<Record<ViewKey, { slices: Slice[]; insight: string }>> = {};

  // Asset Class
  const classGroups: Record<string, { value: number; assets: Set<string> }> = {};
  for (const h of holdings) {
    const v = h.mktValue ?? 0;
    if (v <= 0) continue;
    const cls = STABLES.has(h.ticker) ? 'Cash'
      : CRYPTO_TICKERS.has(h.ticker) ? 'Crypto'
      : 'Stocks';
    if (!classGroups[cls]) classGroups[cls] = { value: 0, assets: new Set() };
    classGroups[cls].value += v;
    classGroups[cls].assets.add(h.ticker);
  }
  const classSlices: Slice[] = Object.entries(classGroups)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, g]) => ({
      label,
      value: Math.round(g.value),
      color: ASSET_CLASS_COLORS[label] ?? '#ef4444',
      assets: [...g.assets].join(', '),
    }));
  if (classSlices.length > 0) {
    const top = classSlices[0];
    const topPct = Math.round((top.value / classSlices.reduce((s, sl) => s + sl.value, 0)) * 100);
    result.class = {
      slices: classSlices,
      insight: `${top.label} represents ${topPct}% of your portfolio by asset class.`,
    };
  }

  // Platform
  const platGroups: Record<string, { value: number; assets: Set<string> }> = {};
  for (const h of holdings) {
    const v = h.mktValue ?? 0;
    if (v <= 0) continue;
    if (!platGroups[h.account]) platGroups[h.account] = { value: 0, assets: new Set() };
    platGroups[h.account].value += v;
    platGroups[h.account].assets.add(h.ticker);
  }
  const platSlices: Slice[] = Object.entries(platGroups)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, g], i) => ({
      label,
      value: Math.round(g.value),
      color: PLATFORM_COLORS[label] ?? PLATFORM_FALLBACK_COLORS[i % PLATFORM_FALLBACK_COLORS.length],
      assets: [...g.assets].join(', '),
    }));
  if (platSlices.length > 0) {
    const top = platSlices[0];
    const total = platSlices.reduce((s, sl) => s + sl.value, 0);
    const topPct = Math.round((top.value / total) * 100);
    result.platform = {
      slices: platSlices,
      insight: `${top.label} holds ${topPct}% of your portfolio ($${top.value.toLocaleString()}).`,
    };
  }

  return result;
}

/* ── Main component ───────────────────────────────────────────────── */

interface AllocationViewProps {
  holdings?: HoldingInput[];
}

export default function AllocationView({ holdings }: AllocationViewProps) {
  const [activeView, setActiveView] = useState<ViewKey>('class');

  const hasRealHoldings = holdings && holdings.length > 0;
  const realData = hasRealHoldings ? buildRealData(holdings) : {};
  // If we have real holdings, only show views we can compute. Otherwise show demo data.
  const viewData = hasRealHoldings
    ? realData[activeView] ?? null
    : DATA[activeView];
  const hasData = viewData !== null && viewData.slices.length > 0;
  const slices = viewData?.slices ?? [];
  const insight = viewData?.insight ?? '';
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const maxValue = Math.max(...slices.map((s) => s.value));

  return (
    <div className="p-6 space-y-6">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const isActive = activeView === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-75 ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'text-on-surface-variant border border-outline hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <Icon size={12} strokeWidth={isActive ? 2 : 1.5} />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Donut + breakdown layout */}
      {!hasData ? (
        <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm" />
      ) :
      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Donut */}
        <div className="col-span-12 md:col-span-4 flex flex-col items-center gap-4">
          <Donut slices={slices} size={240} />
          {/* Legend under donut */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
            {slices.map((sl) => (
              <div key={sl.label} className="flex items-center gap-1.5 text-[10px] text-on-surface-variant">
                <div className="w-2 h-2 shrink-0" style={{ backgroundColor: sl.color }} />
                {sl.label}
              </div>
            ))}
          </div>
          {/* Total */}
          <div className="text-center mt-2">
            <p className="text-[10px] text-on-surface-variant section-header mb-0.5">Total</p>
            <p className="font-mono text-lg text-on-surface font-bold">
              ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Breakdown table */}
        <div className="col-span-12 md:col-span-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-[10px] text-on-surface-variant section-header">Breakdown</h4>
            <span className="text-[10px] font-mono text-on-surface-variant">
              {slices.length} categories
            </span>
          </div>

          {/* Column labels */}
          <div className="flex items-center gap-4 px-1 pb-2 border-b border-outline-variant/15">
            <div className="w-40 shrink-0">
              <span className="text-[9px] text-on-surface-variant section-header">Category</span>
            </div>
            <div className="flex-1">
              <span className="text-[9px] text-on-surface-variant section-header">Distribution</span>
            </div>
            <div className="flex gap-3 shrink-0 w-44 justify-end">
              <span className="text-[9px] text-on-surface-variant section-header">Value</span>
              <span className="text-[9px] text-on-surface-variant section-header w-12 text-right">Share</span>
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-outline-variant/5">
            {slices.map((sl) => (
              <BreakdownRow key={sl.label} slice={sl} total={total} maxValue={maxValue} />
            ))}
          </div>

          {/* Asset detail for each slice */}
          <div className="mt-4 pt-4 border-t border-outline-variant/15 space-y-2 px-1">
            {slices.map((sl) => (
              sl.assets && (
                <div key={sl.label} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 mt-1.5 shrink-0" style={{ backgroundColor: sl.color }} />
                  <div>
                    <span className="text-[10px] font-bold text-on-surface-variant">{sl.label}:</span>
                    <span className="text-[10px] text-on-surface-variant/70 ml-1">{sl.assets}</span>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </div>}

      {/* Insight callout */}
      {hasData && insight && <div className="flex gap-3 p-4 bg-surface-container border-l-2 border-primary">
        <div className="shrink-0 mt-0.5">
          <div className="w-5 h-5 flex items-center justify-center bg-primary/10">
            <span className="text-primary text-[10px] font-mono font-bold">i</span>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {insight}
        </p>
      </div>}
    </div>
  );
}
