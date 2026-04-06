'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface RateData {
  rate: number;
  apr: number;
  product: string;
}

interface FedPrediction {
  meetingDate: string;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
}

interface TopListing {
  id: number;
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dealScore: number | null;
}

interface RightPanelProps {
  rates: RateData[];
  prediction: FedPrediction | null;
  topListings: TopListing[];
  onListingClick?: (id: number) => void;
}

const TERM_LABELS: Record<string, string> = {
  '30yr_fixed': '30 yr',
  '20yr_fixed': '20 yr',
  '15yr_fixed': '15 yr',
  '10yr_fixed': '10 yr',
};

const TERM_ORDER = ['30yr_fixed', '20yr_fixed', '15yr_fixed', '10yr_fixed'];

export default function RightPanel({
  rates,
  prediction,
  topListings,
  onListingClick,
}: RightPanelProps) {
  const [priceHistory, setPriceHistory] = useState<{ date: string; value: number }[]>([]);

  useEffect(() => {
    fetch('/austin-zhvi.json')
      .then((r) => r.json())
      .then(setPriceHistory)
      .catch(() => {});
  }, []);

  const bestByTerm = new Map<string, RateData>();
  for (const r of rates) {
    if (!bestByTerm.has(r.product) || r.rate < bestByTerm.get(r.product)!.rate) {
      bestByTerm.set(r.product, r);
    }
  }
  const sortedRates = TERM_ORDER
    .filter((t) => bestByTerm.has(t))
    .map((t) => bestByTerm.get(t)!);

  return (
    <div className="h-full overflow-y-auto border-l border-outline bg-background p-5 space-y-5">
      {/* Rate Watch */}
      <section className="bg-surface-container-low border border-outline p-5">
        <h3 className="section-header text-xs text-on-surface-variant mb-4">
          Rate Watch
        </h3>
        {sortedRates.length === 0 ? (
          <div className="text-on-surface-variant text-sm">No rate data</div>
        ) : (
          <div className="space-y-2">
            {sortedRates.map((r, i) => {
              const colors = ['text-primary', 'text-secondary', 'text-tertiary', 'text-on-surface'];
              return (
                <div key={r.product} className="flex items-center justify-between">
                  <span className="text-sm text-on-surface-variant">
                    {TERM_LABELS[r.product] ?? r.product}
                  </span>
                  <span className={`font-mono text-base font-bold ${colors[i] ?? 'text-on-surface'}`}>
                    {r.rate.toFixed(3)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Fed Forecast */}
      <section className="bg-surface-container-low border border-outline p-5">
        <h3 className="section-header text-xs text-on-surface-variant mb-4">
          Fed Forecast
        </h3>
        {prediction ? (
          <>
            {/* Rows instead of a cramped bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface">Hold</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-surface-container-highest">
                    <div className="h-full bg-on-surface-variant" style={{ width: `${prediction.holdProb * 100}%` }} />
                  </div>
                  <span className="font-mono text-sm font-bold text-on-surface w-12 text-right">
                    {Math.round(prediction.holdProb * 100)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface">Cut</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-surface-container-highest">
                    <div className="h-full bg-secondary" style={{ width: `${prediction.cutProb * 100}%` }} />
                  </div>
                  <span className="font-mono text-sm font-bold text-secondary w-12 text-right">
                    {Math.round(prediction.cutProb * 100)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface">Hike</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-surface-container-highest">
                    <div className="h-full bg-error" style={{ width: `${prediction.hikeProb * 100}%` }} />
                  </div>
                  <span className="font-mono text-sm font-bold text-error w-12 text-right">
                    {Math.round(prediction.hikeProb * 100)}%
                  </span>
                </div>
              </div>
            </div>
            <div className="text-xs text-on-surface-variant font-mono mt-3">
              Next FOMC: {prediction.meetingDate}
            </div>
          </>
        ) : (
          <div className="text-on-surface-variant text-sm">No data</div>
        )}
      </section>

      {/* Market Trends */}
      <section className="bg-surface-container-low border border-outline p-5">
        <h3 className="section-header text-xs text-on-surface-variant mb-2">
          Market Trends
        </h3>
        {priceHistory.length > 0 ? (
          <>
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-mono text-lg font-bold text-on-surface">
                ${(priceHistory[priceHistory.length - 1].value / 1000).toFixed(0)}K
              </span>
              {priceHistory.length >= 12 && (() => {
                const current = priceHistory[priceHistory.length - 1].value;
                const yearAgo = priceHistory[priceHistory.length - 12].value;
                const pctChange = ((current - yearAgo) / yearAgo * 100).toFixed(1);
                const isDown = current < yearAgo;
                return (
                  <span className={`font-mono text-xs ${isDown ? 'text-error' : 'text-secondary'}`}>
                    {isDown ? '' : '+'}{pctChange}% (1yr)
                  </span>
                );
              })()}
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={priceHistory}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['dataMin - 5000', 'dataMax + 5000']} />
                  <Tooltip
                    contentStyle={{ background: '#1c2026', border: '1px solid #30363d', borderRadius: 0, fontSize: 11 }}
                    labelStyle={{ color: '#8b949e' }}
                    formatter={(v) => [`$${(Number(v) / 1000).toFixed(0)}K`, 'Median']}
                    labelFormatter={(d) => String(d).slice(0, 7)}
                  />
                  <Area type="monotone" dataKey="value" stroke="#f87171" strokeWidth={2} fill="url(#priceGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-on-surface-variant font-mono mt-1">
              Austin, TX · Zillow ZHVI · 36mo
            </div>
          </>
        ) : (
          <div className="text-on-surface-variant text-sm">Loading price history...</div>
        )}
      </section>

      {/* Top Matches */}
      <section className="bg-surface-container-low border border-outline p-5">
        <h3 className="section-header text-xs text-on-surface-variant mb-4">
          Top Matches
        </h3>
        {topListings.length === 0 ? (
          <div className="text-on-surface-variant text-sm">
            No listings loaded
          </div>
        ) : (
          <div className="space-y-3">
            {topListings.slice(0, 3).map((listing) => (
              <button
                key={listing.id}
                onClick={() => onListingClick?.(listing.id)}
                className="w-full p-4 border border-outline bg-surface-container-lowest hover:border-primary text-left"
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-on-surface truncate">
                      {listing.address}
                    </div>
                    <div className="text-xs text-on-surface-variant font-mono mt-0.5">
                      {listing.beds}bd · {listing.baths}ba · {listing.sqft.toLocaleString()} sqft
                    </div>
                  </div>
                  {listing.dealScore !== null && (
                    <span className="font-mono text-xs text-tertiary-container font-bold shrink-0 ml-2">
                      {listing.dealScore}
                    </span>
                  )}
                </div>
                <div className="font-mono text-base font-bold text-primary mt-2">
                  ${listing.price.toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
