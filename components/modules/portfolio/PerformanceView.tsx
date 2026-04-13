'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

/* ── Dummy time-series data (monthly, normalized to % return from 0) ── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Portfolio return curve (cumulative %)
const PORTFOLIO = [0, 1.2, 2.8, 1.4, 3.9, 5.1, 7.2, 6.5, 8.8, 10.1, 11.6, 12.4];

const BENCHMARKS: Record<string, { color: string; data: number[] }> = {
  'S&P 500':    { color: '#3b82f6', data: [0, 0.8, 2.1, 0.9, 2.4, 3.2, 4.8, 4.1, 5.9, 7.2, 8.8, 10.2] },
  'QQQ':        { color: '#a855f7', data: [0, 1.4, 3.6, 1.2, 4.2, 5.8, 8.9, 7.4, 10.2, 12.1, 14.8, 16.1] },
  'BTC':        { color: '#f59e0b', data: [0, 4.2, 8.1, -2.3, 6.8, 12.4, 18.2, 14.1, 22.5, 28.3, 24.1, 31.2] },
  '60/40':      { color: '#22d3ee', data: [0, 0.5, 1.4, 0.6, 1.6, 2.1, 3.0, 2.8, 3.9, 4.5, 5.2, 5.8] },
  'Total Bond': { color: '#8b949e', data: [0, 0.2, 0.5, 0.8, 0.4, 0.7, 1.1, 1.3, 1.0, 1.5, 1.8, 2.1] },
  'HYSA 4.5%':  { color: '#67df70', data: [0, 0.375, 0.75, 1.125, 1.5, 1.875, 2.25, 2.625, 3.0, 3.375, 3.75, 4.125] },
};

/* ── Per-account returns ──────────────────────────────────────────── */

const ACCOUNT_RETURNS = [
  { name: 'Coinbase',    ytd: 34.2,  value: 165656, color: '#f59e0b', sparkline: [0,4,8,-2,6,12,18,14,22,28,24,34] },
  { name: 'Fidelity',    ytd: 12.1,  value: 340207, color: '#46f1c5', sparkline: [0,1,2,1,3,4,6,5,7,8,10,12] },
  { name: 'Merrill',     ytd: 8.4,   value: 98958,  color: '#a855f7', sparkline: [0,0.5,1,0.8,2,3,4,3.5,5,6,7,8.4] },
  { name: 'Kraken',      ytd: 18.2,  value: 20550,  color: '#22d3ee', sparkline: [0,3,6,-1,5,10,14,11,16,20,15,18] },
  { name: 'Binance',     ytd: 25.0,  value: 6248,   color: '#eab308', sparkline: [0,2,5,1,8,12,16,14,18,22,20,25] },
  { name: 'Wells Fargo', ytd: 0.0,   value: 42300,  color: '#3b82f6', sparkline: [0,0,0,0,0,0,0,0,0,0,0,0] },
];

/* ── Per-holding returns ──────────────────────────────────────────── */

const HOLDING_RETURNS = [
  { ticker: 'NVDA',  returnPct: 94.5,  returnAmt: 17867, held: '14 mo' },
  { ticker: 'Rev Share', returnPct: 70.0, returnAmt: 3500, held: '8 mo' },
  { ticker: 'AAPL',  returnPct: 51.1,  returnAmt: 42104, held: '3 yr' },
  { ticker: 'Pre-IPO', returnPct: 42.0, returnAmt: 4200, held: '11 mo' },
  { ticker: 'ETH',   returnPct: 37.6,  returnAmt: 11658, held: '2 yr' },
  { ticker: 'MSFT',  returnPct: 26.9,  returnAmt: 7520,  held: '2 yr' },
  { ticker: 'BNB',   returnPct: 25.0,  returnAmt: 1248,  held: '6 mo' },
  { ticker: 'XRP',   returnPct: 24.0,  returnAmt: 1800,  held: '9 mo' },
  { ticker: 'BTC',   returnPct: 23.3,  returnAmt: 18200, held: '2 yr' },
  { ticker: 'AMZN',  returnPct: 23.7,  returnAmt: 5340,  held: '1 yr' },
  { ticker: 'VOO',   returnPct: 21.3,  returnAmt: 10224, held: '3 yr' },
  { ticker: 'GOOGL', returnPct: 17.3,  returnAmt: 5196,  held: '2 yr' },
  { ticker: 'ADA',   returnPct: 12.5,  returnAmt: 1250,  held: '5 mo' },
  { ticker: 'SCHD',  returnPct: 10.9,  returnAmt: 4019,  held: '2 yr' },
  { ticker: 'BND',   returnPct: 3.3,   returnAmt: 979,   held: '3 yr' },
  { ticker: 'SOL',   returnPct: -7.4,  returnAmt: -2120, held: '4 mo' },
];

/* ── Chart helpers ────────────────────────────────────────────────── */

function dataToSvgPath(data: number[], yMin: number, yMax: number, w: number, h: number, pad = 24): string {
  const yRange = yMax - yMin || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = pad + (1 - (v - yMin) / yRange) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function MiniSparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const path = dataToSvgPath(data, min, max, width, height, 2);
  return (
    <svg width={width} height={height} className="fill-none">
      <path d={path} stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export default function PerformanceView() {
  const [enabledBenchmarks, setEnabledBenchmarks] = useState<Record<string, boolean>>({
    'S&P 500': true,
    'QQQ': false,
    'BTC': false,
    '60/40': false,
    'Total Bond': false,
    'HYSA 4.5%': false,
  });

  const toggleBenchmark = (key: string) =>
    setEnabledBenchmarks((prev) => ({ ...prev, [key]: !prev[key] }));

  // Compute Y axis range across portfolio + enabled benchmarks
  const { yMin, yMax } = useMemo(() => {
    let min = Math.min(...PORTFOLIO);
    let max = Math.max(...PORTFOLIO);
    for (const [key, enabled] of Object.entries(enabledBenchmarks)) {
      if (enabled && BENCHMARKS[key]) {
        min = Math.min(min, ...BENCHMARKS[key].data);
        max = Math.max(max, ...BENCHMARKS[key].data);
      }
    }
    // add some padding
    const pad = (max - min) * 0.12;
    return { yMin: min - pad, yMax: max + pad };
  }, [enabledBenchmarks]);

  const chartW = 800;
  const chartH = 300;

  const portfolioPath = dataToSvgPath(PORTFOLIO, yMin, yMax, chartW, chartH);
  const portfolioFill = portfolioPath + ` L${chartW},${chartH} L0,${chartH} Z`;

  // Y grid lines
  const yRange = yMax - yMin;
  const gridSteps = 5;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const val = yMin + (yRange / gridSteps) * i;
    const y = 24 + (1 - (val - yMin) / yRange) * (chartH - 48);
    return { val, y };
  });

  // Top performers and worst
  const topPerformers = HOLDING_RETURNS.filter((h) => h.returnPct > 0).slice(0, 6);
  const worstPerformers = [...HOLDING_RETURNS].filter((h) => h.returnPct <= 20).sort((a, b) => a.returnPct - b.returnPct).slice(0, 3);

  return (
    <div className="p-6 space-y-6">
      {/* ── Main chart + benchmark controls ────────────────────── */}
      <div className="grid grid-cols-12 gap-6">
        {/* Chart area */}
        <div className="col-span-12 lg:col-span-9">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-[10px] text-on-surface-variant section-header">Portfolio Return (YTD)</h4>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-mono font-bold text-primary">+12.4%</span>
                <span className="text-xs font-mono text-on-surface-variant">+$93,482</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-[2px] bg-primary" />
              <span className="text-[10px] text-on-surface-variant">Your Portfolio</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline p-4 relative">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" preserveAspectRatio="none" style={{ height: 280 }}>
              {/* Grid lines */}
              {gridLines.map((g, i) => (
                <g key={i}>
                  <line x1="0" y1={g.y} x2={chartW} y2={g.y} stroke="#1c2026" strokeWidth="1" />
                  <text x="4" y={g.y - 4} fill="#8b949e" fontSize="10" fontFamily="JetBrains Mono">
                    {g.val >= 0 ? '+' : ''}{g.val.toFixed(0)}%
                  </text>
                </g>
              ))}

              {/* Month labels */}
              {MONTHS.map((m, i) => {
                const x = (i / (MONTHS.length - 1)) * chartW;
                return (
                  <text key={m} x={x} y={chartH - 4} fill="#8b949e" fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle">
                    {m.toUpperCase()}
                  </text>
                );
              })}

              {/* Zero line */}
              {yMin < 0 && (
                <line
                  x1="0" y1={24 + (1 - (0 - yMin) / yRange) * (chartH - 48)}
                  x2={chartW} y2={24 + (1 - (0 - yMin) / yRange) * (chartH - 48)}
                  stroke="#30363d" strokeWidth="1" strokeDasharray="4 4"
                />
              )}

              {/* Benchmark lines */}
              {Object.entries(enabledBenchmarks).map(([key, enabled]) => {
                if (!enabled || !BENCHMARKS[key]) return null;
                const b = BENCHMARKS[key];
                return (
                  <path
                    key={key}
                    d={dataToSvgPath(b.data, yMin, yMax, chartW, chartH)}
                    fill="none"
                    stroke={b.color}
                    strokeWidth="1.5"
                    strokeDasharray="6 3"
                    opacity="0.7"
                  />
                );
              })}

              {/* Portfolio fill */}
              <path d={portfolioFill} fill="#46f1c5" opacity="0.06" />

              {/* Portfolio line */}
              <path d={portfolioPath} fill="none" stroke="#46f1c5" strokeWidth="2.5" />

              {/* Current value dot */}
              {(() => {
                const lastY = 24 + (1 - (PORTFOLIO[PORTFOLIO.length - 1] - yMin) / yRange) * (chartH - 48);
                return (
                  <g>
                    <circle cx={chartW} cy={lastY} r="4" fill="#46f1c5" />
                    <circle cx={chartW} cy={lastY} r="8" fill="#46f1c5" opacity="0.15" />
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Benchmark controls — matches housing map overlay checkbox style */}
        <div className="col-span-12 lg:col-span-3">
          <div className="bg-surface-container border border-outline p-4 space-y-3">
            <h4 className="text-[10px] text-on-surface-variant section-header mb-1">Benchmark Overlay</h4>
            {Object.entries(BENCHMARKS).map(([key, b]) => (
              <label key={key} className="flex items-center gap-2.5 text-xs text-on-surface-variant cursor-pointer group">
                <input
                  type="checkbox"
                  checked={enabledBenchmarks[key] ?? false}
                  onChange={() => toggleBenchmark(key)}
                  className="accent-primary"
                />
                <div
                  className="w-3 h-[2px]"
                  style={{ backgroundColor: b.color, opacity: enabledBenchmarks[key] ? 1 : 0.3 }}
                />
                <span className={`transition-colors duration-75 ${enabledBenchmarks[key] ? 'text-on-surface' : ''}`}>
                  {key}
                </span>
                <span className="ml-auto font-mono text-[10px]" style={{ color: b.color, opacity: enabledBenchmarks[key] ? 1 : 0.4 }}>
                  {b.data[b.data.length - 1] >= 0 ? '+' : ''}{b.data[b.data.length - 1].toFixed(1)}%
                </span>
              </label>
            ))}

            {/* Portfolio vs best benchmark comparison */}
            <div className="pt-3 mt-3 border-t border-outline-variant/15">
              <div className="text-[9px] text-on-surface-variant section-header mb-2">vs S&P 500</div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-sm font-bold text-primary">+2.2pp</span>
                <span className="text-[10px] text-on-surface-variant">outperforming</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-account + per-holding returns ──────────────────── */}
      <div className="grid grid-cols-12 gap-6">
        {/* Account returns */}
        <div className="col-span-12 lg:col-span-5">
          <h4 className="text-[10px] text-on-surface-variant section-header mb-3">Return by Account (YTD)</h4>
          <div className="bg-surface-container border border-outline divide-y divide-outline-variant/10">
            {ACCOUNT_RETURNS.map((acct) => (
              <div key={acct.name} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-container-high/50 transition-colors duration-75">
                {/* Color + name */}
                <div className="flex items-center gap-2.5 w-28 shrink-0">
                  <div className="w-2 h-8" style={{ backgroundColor: acct.color }} />
                  <div>
                    <div className="text-xs font-semibold text-on-surface">{acct.name}</div>
                    <div className="text-[10px] font-mono text-on-surface-variant">
                      ${(acct.value / 1000).toFixed(0)}K
                    </div>
                  </div>
                </div>
                {/* Sparkline */}
                <div className="flex-1 flex justify-center">
                  <MiniSparkline data={acct.sparkline} color={acct.color} />
                </div>
                {/* Return */}
                <div className={`font-mono text-sm font-bold text-right w-16 ${
                  acct.ytd > 0 ? 'text-secondary' : acct.ytd < 0 ? 'text-error' : 'text-on-surface-variant'
                }`}>
                  {acct.ytd > 0 ? '+' : ''}{acct.ytd.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top + worst performers */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {/* Top performers */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} strokeWidth={1.5} className="text-secondary" />
              <h4 className="text-[10px] text-on-surface-variant section-header">Top Performers</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {topPerformers.map((h, i) => (
                <div
                  key={h.ticker}
                  className="bg-surface-container border border-outline p-3 hover:bg-surface-container-high/50 transition-colors duration-75"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-on-surface">{h.ticker}</span>
                    {i === 0 && (
                      <span className="text-[8px] font-mono font-bold text-secondary bg-secondary/10 px-1.5 py-0.5">
                        BEST
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-lg font-bold text-secondary">
                    +{h.returnPct}%
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[10px] font-mono text-secondary/80">
                      +${h.returnAmt.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-on-surface-variant">{h.held}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Worst performers */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown size={14} strokeWidth={1.5} className="text-error" />
              <h4 className="text-[10px] text-on-surface-variant section-header">Underperformers</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {worstPerformers.map((h) => {
                const isNeg = h.returnPct < 0;
                return (
                  <div
                    key={h.ticker}
                    className="bg-surface-container border border-outline p-3 hover:bg-surface-container-high/50 transition-colors duration-75"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-on-surface">{h.ticker}</span>
                      {isNeg && (
                        <span className="text-[8px] font-mono font-bold text-error bg-error/10 px-1.5 py-0.5">
                          LOSS
                        </span>
                      )}
                    </div>
                    <div className={`font-mono text-lg font-bold ${isNeg ? 'text-error' : 'text-on-surface-variant'}`}>
                      {h.returnPct > 0 ? '+' : ''}{h.returnPct}%
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className={`text-[10px] font-mono ${isNeg ? 'text-error/80' : 'text-on-surface-variant'}`}>
                        {h.returnAmt >= 0 ? '+' : '-'}${Math.abs(h.returnAmt).toLocaleString()}
                      </span>
                      <span className="text-[9px] text-on-surface-variant">{h.held}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
