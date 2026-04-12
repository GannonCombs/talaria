'use client';

import { useState } from 'react';
import BackButton from '@/components/layout/BackButton';

interface QuoteData {
  c: number;  // current price
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
  dp: number; // percent change
  d: number;  // change
  t: number;  // timestamp
}

export default function PortfolioPage() {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchQuote() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/quote?symbol=AAPL');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setQuote(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Portfolio
          </h1>
        </div>
      </div>

      <div className="max-w-md">
        <button
          onClick={fetchQuote}
          disabled={loading}
          className="bg-primary text-on-primary px-6 py-3 text-sm font-medium hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Fetching...' : 'Get Quote — AAPL'}
        </button>

        {error && (
          <div className="mt-4 p-4 border border-error/50 bg-error/10 text-error text-sm">
            {error}
          </div>
        )}

        {quote && quote.c > 0 && (
          <div className="mt-4 bg-surface-container-low border border-outline p-6">
            <div className="text-on-surface-variant text-xs section-header mb-2">AAPL</div>
            <div className="text-3xl font-mono text-on-surface">
              ${quote.c.toFixed(2)}
            </div>
            <div className={`text-sm font-mono mt-1 ${quote.d >= 0 ? 'text-secondary' : 'text-error'}`}>
              {quote.d >= 0 ? '+' : ''}{quote.d.toFixed(2)} ({quote.dp >= 0 ? '+' : ''}{quote.dp.toFixed(2)}%)
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
              <div>
                <div className="text-on-surface-variant section-header">Open</div>
                <div className="font-mono text-on-surface">${quote.o.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-on-surface-variant section-header">High</div>
                <div className="font-mono text-on-surface">${quote.h.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-on-surface-variant section-header">Low</div>
                <div className="font-mono text-on-surface">${quote.l.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-on-surface-variant">
              Prev close: ${quote.pc.toFixed(2)} · Cost: $0.001 via MPP
            </div>
          </div>
        )}
      </div>
    </>
  );
}
