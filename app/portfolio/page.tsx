'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import BackButton from '@/components/layout/BackButton';
import { AlertTriangle, Plus, Upload, Landmark } from 'lucide-react';
import AddPositionDrawer from '@/components/modules/portfolio/AddPositionDrawer';
import AllocationView from '@/components/modules/portfolio/AllocationView';
import PerformanceView from '@/components/modules/portfolio/PerformanceView';
import { DEMO_MODE } from '@/lib/config';

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

const ACCOUNT_COLORS: Record<string, string> = {
  Fidelity:      '#46f1c5',
  Coinbase:      '#f59e0b',
  Kraken:        '#22d3ee',
  Binance:       '#eab308',
  'Wells Fargo': '#3b82f6',
  Merrill:       '#a855f7',
  EquityZen:     '#67df70',
  Augment:       '#ef4444',
};

const TABS = ['Holdings', 'Allocation', 'Performance', 'Tax'] as const;

const HOLDINGS = [
  { ticker: 'AAPL',         type: 'Equity',  account: 'Fidelity',     qty: 657,      unit: 'sh',  price: 189.43,  dailyPct: 0.82,   mktValue: 124500,  cost: 82396,  returnAmt: 42104,  returnPct: 51.1,  allocPct: 14.7, trend: 'M0,10 L10,8 L20,12 L30,4 L40,6 L50,2 L60,0' },
  { ticker: 'BTC',          type: 'Crypto',  account: 'Coinbase',     qty: 1.5,      unit: 'BTC', price: 64212,   dailyPct: -2.14,  mktValue: 96318,   cost: 78118,  returnAmt: 18200,  returnPct: 23.3,  allocPct: 11.3, trend: 'M0,14 L10,12 L20,8 L30,10 L40,4 L50,6 L60,0' },
  { ticker: 'VOO',          type: 'ETF',     account: 'Fidelity',     qty: 120,      unit: 'sh',  price: 485.20,  dailyPct: 0.15,   mktValue: 58224,   cost: 48000,  returnAmt: 10224,  returnPct: 21.3,  allocPct: 6.9,  trend: 'M0,12 L10,13 L20,10 L30,8 L40,6 L50,4 L60,2' },
  { ticker: 'Checking',     type: 'Cash',    account: 'Wells Fargo',  qty: null,     unit: '',    price: null,    dailyPct: null,   mktValue: 42300,   cost: null,   returnAmt: null,   returnPct: null,  allocPct: 5.0,  trend: null },
  { ticker: 'Pre-IPO Fund', type: 'Private', account: 'EquityZen',    qty: null,     unit: '',    price: 14200,   dailyPct: null,   mktValue: 14200,   cost: 10000,  returnAmt: 4200,   returnPct: 42.0,  allocPct: 1.7,  trend: null, priceNote: 'Jan 15' },
  { ticker: 'NVDA',         type: 'Equity',  account: 'Fidelity',     qty: 42,       unit: 'sh',  price: 875.40,  dailyPct: 1.20,   mktValue: 36767,   cost: 18900,  returnAmt: 17867,  returnPct: 94.5,  allocPct: 4.3,  trend: 'M0,14 L10,12 L20,10 L30,6 L40,4 L50,2 L60,0' },
  { ticker: 'MSFT',         type: 'Equity',  account: 'Fidelity',     qty: 85,       unit: 'sh',  price: 417.88,  dailyPct: 0.45,   mktValue: 35520,   cost: 28000,  returnAmt: 7520,   returnPct: 26.9,  allocPct: 4.2,  trend: 'M0,14 L10,10 L20,8 L30,12 L40,6 L50,4 L60,2' },
  { ticker: 'ETH',          type: 'Crypto',  account: 'Coinbase',     qty: 12.5,     unit: 'ETH', price: 3412.60, dailyPct: -1.30,  mktValue: 42658,   cost: 31000,  returnAmt: 11658,  returnPct: 37.6,  allocPct: 5.0,  trend: 'M0,12 L10,14 L20,8 L30,6 L40,10 L50,4 L60,0' },
  { ticker: 'GOOGL',        type: 'Equity',  account: 'Fidelity',     qty: 200,      unit: 'sh',  price: 175.98,  dailyPct: 0.32,   mktValue: 35196,   cost: 30000,  returnAmt: 5196,   returnPct: 17.3,  allocPct: 4.2,  trend: 'M0,8 L10,10 L20,12 L30,6 L40,8 L50,4 L60,2' },
  { ticker: 'AMZN',         type: 'Equity',  account: 'Merrill',      qty: 150,      unit: 'sh',  price: 185.60,  dailyPct: 0.68,   mktValue: 27840,   cost: 22500,  returnAmt: 5340,   returnPct: 23.7,  allocPct: 3.3,  trend: 'M0,14 L10,12 L20,10 L30,8 L40,4 L50,6 L60,2' },
  { ticker: 'BND',          type: 'ETF',     account: 'Merrill',      qty: 420,      unit: 'sh',  price: 72.33,   dailyPct: -0.08,  mktValue: 30379,   cost: 29400,  returnAmt: 979,    returnPct: 3.3,   allocPct: 3.6,  trend: 'M0,8 L10,8 L20,6 L30,6 L40,4 L50,4 L60,4' },
  { ticker: 'SCHD',         type: 'ETF',     account: 'Merrill',      qty: 510,      unit: 'sh',  price: 79.88,   dailyPct: 0.10,   mktValue: 40739,   cost: 36720,  returnAmt: 4019,   returnPct: 10.9,  allocPct: 4.8,  trend: 'M0,10 L10,8 L20,10 L30,8 L40,6 L50,6 L60,4' },
  { ticker: 'SOL',          type: 'Crypto',  account: 'Coinbase',     qty: 180,      unit: 'SOL', price: 148.22,  dailyPct: -3.10,  mktValue: 26680,   cost: 28800,  returnAmt: -2120,  returnPct: -7.4,  allocPct: 3.1,  trend: 'M0,2 L10,4 L20,6 L30,8 L40,10 L50,12 L60,14' },
  { ticker: 'XRP',          type: 'Crypto',  account: 'Kraken',       qty: 15000,    unit: 'XRP', price: 0.62,    dailyPct: 1.20,   mktValue: 9300,    cost: 7500,   returnAmt: 1800,   returnPct: 24.0,  allocPct: 1.1,  trend: 'M0,10 L10,12 L20,8 L30,6 L40,4 L50,6 L60,2' },
  { ticker: 'ADA',          type: 'Crypto',  account: 'Kraken',       qty: 25000,    unit: 'ADA', price: 0.45,    dailyPct: -0.90,  mktValue: 11250,   cost: 10000,  returnAmt: 1250,   returnPct: 12.5,  allocPct: 1.3,  trend: 'M0,6 L10,8 L20,10 L30,8 L40,6 L50,4 L60,6' },
  { ticker: 'BNB',          type: 'Crypto',  account: 'Binance',      qty: 20,       unit: 'BNB', price: 312.40,  dailyPct: 0.55,   mktValue: 6248,    cost: 5000,   returnAmt: 1248,   returnPct: 25.0,  allocPct: 0.7,  trend: 'M0,10 L10,8 L20,6 L30,4 L40,6 L50,4 L60,2' },
  { ticker: 'Rev Share',    type: 'Private', account: 'Augment',      qty: null,     unit: '',    price: null,    dailyPct: null,   mktValue: 8500,    cost: 5000,   returnAmt: 3500,   returnPct: 70.0,  allocPct: 1.0,  trend: null },
  { ticker: 'HYSA',         type: 'Cash',    account: 'Fidelity',     qty: null,     unit: '',    price: null,    dailyPct: null,   mktValue: 50000,   cost: null,   returnAmt: null,   returnPct: null,  allocPct: 5.9,  trend: null },
] as const;

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

/* ── Helpers ──────────────────────────────────────────────────────── */

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ── Component ────────────────────────────────────────────────────── */

export default function PortfolioPage() {
  const [activeBenchmark, setActiveBenchmark] = useState('SPY');
  const [activeTab, setActiveTab] = useState<string>('Holdings');
  const [activeAccount, setActiveAccount] = useState<string>('All');
  const [showAll, setShowAll] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortField, setSortField] = useState<string>('mktValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [combined, setCombined] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real holdings from DB + live prices from Finnhub
  interface RealHolding {
    ticker: string;
    account: string;
    qty: number;
    price: number | null;
    mktValue: number | null;
    cost: number | null;
  }
  const [realHoldings, setRealHoldings] = useState<RealHolding[]>([]);
  const [cashFormOpen, setCashFormOpen] = useState(false);
  const [cashAccountName, setCashAccountName] = useState('');
  const [cashBalance, setCashBalance] = useState('');

  const loadRealHoldings = useCallback(async () => {
    try {
      const holdingsRes = await fetch('/api/portfolio/holdings');
      if (!holdingsRes.ok) return;
      const { holdings } = await holdingsRes.json();
      if (!holdings || holdings.length === 0) return;

      // Fetch prices for all unique assets
      const assets = [...new Set(holdings.map((h: { asset: string }) => h.asset))] as string[];
      const pricesRes = await fetch(`/api/portfolio/prices?assets=${assets.join(',')}`);
      const priceData = pricesRes.ok ? await pricesRes.json() : { prices: {} };
      const prices: Record<string, number> = priceData.prices ?? {};

      const mapped: RealHolding[] = holdings.map((h: { asset: string; account: string; balance: number; costBasis: number | null }) => {
        const price = prices[h.asset] ?? null;
        const isStable = h.asset === 'USD' || h.asset === 'USDC' || h.asset === 'USDT';
        const mktValue = isStable ? h.balance : (price != null ? h.balance * price : null);
        return {
          ticker: h.asset,
          account: h.account,
          qty: h.balance,
          price: isStable ? 1 : price,
          mktValue,
          cost: h.costBasis,
        };
      });

      setRealHoldings(mapped);
    } catch {
      // Silent fail — dashes remain
    }
  }, []);

  useEffect(() => { loadRealHoldings(); }, [loadRealHoldings]);

  // Derived values from real holdings
  const hasRealData = realHoldings.length > 0;
  const netWorth = useMemo(() => {
    if (!hasRealData) return null;
    return realHoldings.reduce((sum, h) => sum + (h.mktValue ?? 0), 0);
  }, [realHoldings, hasRealData]);

  const totalInvested = useMemo(() => {
    if (!hasRealData) return null;
    return realHoldings.reduce((sum, h) => sum + (h.cost ?? 0), 0);
  }, [realHoldings, hasRealData]);

  const cashPosition = useMemo(() => {
    if (!hasRealData) return null;
    return realHoldings
      .filter((h) => h.ticker === 'USD' || h.ticker === 'USDC' || h.ticker === 'USDT')
      .reduce((sum, h) => sum + (h.mktValue ?? 0), 0);
  }, [realHoldings, hasRealData]);

  const totalReturn = netWorth != null && totalInvested != null && totalInvested > 0
    ? netWorth - totalInvested : null;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(`Uploading ${file.name}...`);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/portfolio/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setImportStatus(`Error: ${data.error ?? res.status}`);
      } else {
        setImportStatus(
          `${data.format}: ${data.insertedRows} new, ${data.duplicatesSkipped} duplicates (${data.accountName})`
        );
        loadRealHoldings(); // refresh after import
      }
    } catch (err) {
      setImportStatus(`Error: ${(err as Error).message}`);
    } finally {
      e.target.value = ''; // allow re-uploading same file
    }
  }

  // When real data exists, derive display rows from it.
  // When no real data: DEMO_MODE shows dummy HOLDINGS, otherwise empty.
  const displayHoldings = useMemo(() => {
    if (hasRealData) {
      return realHoldings.map((h) => {
        const mktValue = h.mktValue ?? 0;
        const returnAmt = h.cost != null && h.mktValue != null ? h.mktValue - h.cost : null;
        const returnPct = returnAmt != null && h.cost != null && h.cost > 0 ? (returnAmt / h.cost) * 100 : null;
        return {
          ticker: h.ticker,
          type: '',
          account: h.account,
          qty: h.qty as number | null,
          unit: h.ticker === 'USD' ? '' : h.ticker,
          price: h.price,
          dailyPct: null as number | null,
          mktValue,
          cost: h.cost,
          returnAmt,
          returnPct,
          allocPct: 0, // computed below
          trend: null as string | null,
        };
      });
    }
    if (DEMO_MODE) return HOLDINGS.map((h) => ({
      ticker: h.ticker as string,
      type: h.type as string,
      account: h.account as string,
      qty: h.qty as number | null,
      unit: h.unit as string,
      price: h.price as number | null,
      dailyPct: h.dailyPct as number | null,
      mktValue: h.mktValue as number,
      cost: h.cost as number | null,
      returnAmt: h.returnAmt as number | null,
      returnPct: h.returnPct as number | null,
      allocPct: h.allocPct as number,
      trend: h.trend as string | null,
    }));
    return [];
  }, [hasRealData, realHoldings]);

  // Combine holdings by ticker when toggled
  const combinedHoldings = useMemo(() => {
    if (!combined) return displayHoldings;
    const grouped = new Map<string, {
      ticker: string; type: string; account: string; qty: number | null;
      unit: string; price: number | null; dailyPct: number | null;
      mktValue: number; cost: number | null; returnAmt: number | null;
      returnPct: number | null; allocPct: number; trend: string | null;
    }>();
    for (const h of displayHoldings) {
      const existing = grouped.get(h.ticker);
      if (!existing) {
        grouped.set(h.ticker, {
          ticker: h.ticker, type: h.type ?? '', account: h.account,
          qty: h.qty, unit: h.unit ?? h.ticker, price: h.price ?? null,
          dailyPct: h.dailyPct ?? null, mktValue: h.mktValue ?? 0,
          cost: h.cost ?? null, returnAmt: h.returnAmt ?? null,
          returnPct: h.returnPct ?? null, allocPct: h.allocPct ?? 0,
          trend: h.trend ?? null,
        });
      } else {
        const accts = new Set(existing.account.split(', '));
        accts.add(h.account);
        existing.account = [...accts].join(', ');
        existing.qty = (existing.qty ?? 0) + (h.qty ?? 0);
        existing.mktValue = (existing.mktValue ?? 0) + (h.mktValue ?? 0);
        existing.cost = existing.cost != null || h.cost != null
          ? (existing.cost ?? 0) + (h.cost ?? 0) : null;
        existing.returnAmt = existing.cost != null
          ? existing.mktValue - existing.cost : null;
        existing.returnPct = existing.returnAmt != null && existing.cost != null && existing.cost > 0
          ? (existing.returnAmt / existing.cost) * 100 : null;
      }
    }
    return [...grouped.values()];
  }, [displayHoldings, combined]);

  // Compute allocation percentages
  const totalValue = useMemo(() =>
    combinedHoldings.reduce((s, h) => s + (h.mktValue ?? 0), 0),
    [combinedHoldings]
  );
  const holdingsWithAlloc = useMemo(() =>
    combinedHoldings.map((h) => ({
      ...h,
      allocPct: totalValue > 0 ? ((h.mktValue ?? 0) / totalValue) * 100 : 0,
    })),
    [combinedHoldings, totalValue]
  );

  // Real allocation for donut (group by asset type)
  const STABLECOINS = new Set(['USD', 'USDC', 'USDT']);
  const realAllocation = useMemo(() => {
    if (!hasRealData || totalValue <= 0) return null;
    const groups: Record<string, number> = { Crypto: 0, Cash: 0 };
    for (const h of holdingsWithAlloc) {
      if (STABLECOINS.has(h.ticker)) groups['Cash'] = (groups['Cash'] ?? 0) + (h.mktValue ?? 0);
      else groups['Crypto'] = (groups['Crypto'] ?? 0) + (h.mktValue ?? 0);
    }
    const alloc = Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({
        label,
        pct: Math.round((value / totalValue) * 100),
        color: label === 'Crypto' ? '#22d3ee' : label === 'Cash' ? '#8b949e' : '#46f1c5',
      }))
      .sort((a, b) => b.pct - a.pct);
    return alloc;
  }, [holdingsWithAlloc, hasRealData, totalValue]);

  const accountCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of displayHoldings) {
      counts[h.account] = (counts[h.account] ?? 0) + 1;
    }
    return counts;
  }, [displayHoldings]);

  const accounts = useMemo(() => Object.keys(accountCounts), [accountCounts]);

  // Filter by account (only when not combined)
  const filtered = useMemo(() => {
    if (combined) return holdingsWithAlloc;
    const list = activeAccount === 'All'
      ? holdingsWithAlloc
      : holdingsWithAlloc.filter((h) => h.account === activeAccount);
    return list;
  }, [activeAccount, holdingsWithAlloc, combined]);

  // Sort
  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'ticker' || field === 'account' ? 'asc' : 'desc');
    }
  }

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let av: number | string | null = null;
      let bv: number | string | null = null;
      switch (sortField) {
        case 'ticker': av = a.ticker; bv = b.ticker; break;
        case 'account': av = a.account; bv = b.account; break;
        case 'qty': av = a.qty; bv = b.qty; break;
        case 'price': av = a.price; bv = b.price; break;
        case 'mktValue': av = a.mktValue; bv = b.mktValue; break;
        case 'cost': av = a.cost; bv = b.cost; break;
        case 'returnAmt': av = a.returnAmt; bv = b.returnAmt; break;
        case 'allocPct': av = a.allocPct; bv = b.allocPct; break;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [filtered, sortField, sortDir]);

  const visible = showAll ? sorted : sorted.slice(0, 5);
  const hasMore = sorted.length > 5;

  const sortArrow = (field: string) =>
    sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

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
                {netWorth != null ? `$${fmt(netWorth, 2)}` : (DEMO_MODE ? '$847,291.44' : '$—')}
              </h3>
            </div>
            <span className="bg-primary/10 text-primary text-[10px] px-2 py-1 font-mono">
              {totalReturn != null && totalInvested != null && totalInvested > 0
                ? `${totalReturn >= 0 ? '+' : ''}${((totalReturn / totalInvested) * 100).toFixed(1)}% (all time)`
                : (DEMO_MODE ? '+12.4% (YTD)' : '— (YTD)')}
            </span>
          </div>
          <div className="h-48 w-full relative">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 200">
              {DEMO_MODE && (
                <>
                  <path className="fill-primary/5" d="M0,180 Q100,160 200,150 T400,100 T600,60 T800,40 L800,200 L0,200 Z" />
                  <path d="M0,180 Q100,160 200,150 T400,100 T600,60 T800,40" fill="none" stroke="#46f1c5" strokeWidth="2.5" />
                </>
              )}
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
                const allocData = realAllocation ?? (DEMO_MODE ? ALLOCATION : []);
                let offset = 0;
                return allocData.map((seg) => {
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
              {(() => {
                const allocData = realAllocation ?? (DEMO_MODE ? ALLOCATION : null);
                const top = allocData?.[0];
                return top ? (
                  <>
                    <span className="text-sm font-bold uppercase text-on-surface">{top.label}</span>
                    <span className="text-lg font-mono font-bold text-primary">{top.pct}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold uppercase text-on-surface">—</span>
                    <span className="text-lg font-mono font-bold text-primary">—</span>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-6 w-full text-[10px] text-on-surface-variant">
            {(realAllocation ?? (DEMO_MODE ? ALLOCATION : [])).slice(0, 3).map((seg) => (
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
          <p className="font-mono text-xl text-on-surface">{totalInvested != null ? `$${fmt(totalInvested, 2)}` : (DEMO_MODE ? '$512,900.00' : '$—')}</p>
        </div>
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-secondary/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Total Return</p>
          <p className={`font-mono text-xl ${totalReturn != null && totalReturn >= 0 ? 'text-secondary' : totalReturn != null ? 'text-error' : 'text-secondary'}`}>{totalReturn != null ? `${totalReturn >= 0 ? '+' : ''}$${fmt(Math.abs(totalReturn), 2)}` : (DEMO_MODE ? '+$334,391.44' : '$—')}</p>
        </div>
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-on-surface-variant/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Annualized</p>
          <p className="font-mono text-xl text-on-surface">{DEMO_MODE ? '14.2%' : '—'}</p>
        </div>
        <div className="bg-surface-container-low border border-outline p-4 border-l-2 border-l-tertiary/20">
          <p className="text-[10px] text-on-surface-variant section-header mb-1">Cash Position</p>
          <p className="font-mono text-xl text-on-surface">{cashPosition != null ? `$${fmt(cashPosition, 2)}` : (DEMO_MODE ? '$102,492.12' : '$—')}</p>
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

      {/* ── Tabbed Holdings Section ─────────────────────────────── */}
      <div className="bg-surface-container-low border border-outline mb-6 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-outline bg-surface-container px-4">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors duration-75 border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'text-primary border-primary'
                    : 'text-on-surface-variant border-transparent hover:text-on-surface'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary text-xs font-bold hover:bg-primary/10 transition-colors duration-75"
            >
              <Plus size={14} strokeWidth={2} />
              Add Position
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary text-xs font-bold hover:bg-primary/10 transition-colors duration-75"
            >
              <Upload size={14} strokeWidth={2} />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => setCashFormOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary text-xs font-bold hover:bg-primary/10 transition-colors duration-75"
            >
              <Landmark size={14} strokeWidth={2} />
              Add Cash
            </button>
          </div>
        </div>

        {cashFormOpen && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-outline bg-surface-container-lowest">
            <input
              placeholder="Account name"
              value={cashAccountName}
              onChange={(e) => setCashAccountName(e.target.value)}
              className="bg-surface-container-lowest border border-outline text-xs px-2 py-1.5 text-on-surface focus:border-primary focus:outline-none w-36"
            />
            <div className="flex items-center gap-1">
              <span className="text-on-surface-variant text-xs">$</span>
              <input
                type="number"
                placeholder="Balance"
                value={cashBalance}
                onChange={(e) => setCashBalance(e.target.value)}
                className="bg-surface-container-lowest border border-outline text-xs px-2 py-1.5 text-on-surface font-mono focus:border-primary focus:outline-none w-28 text-right"
              />
            </div>
            <button
              onClick={async () => {
                if (!cashAccountName.trim() || !cashBalance) return;
                await fetch('/api/portfolio/manual-balance', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ accountName: cashAccountName, asset: 'USD', balance: parseFloat(cashBalance) }),
                });
                setCashFormOpen(false);
                setCashAccountName('');
                setCashBalance('');
                loadRealHoldings();
              }}
              className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold hover:brightness-110"
            >
              Save
            </button>
          </div>
        )}

        {importStatus && (
          <div className="px-4 py-2 text-xs text-on-surface-variant border-b border-outline bg-surface-container-lowest font-mono">
            {importStatus}
          </div>
        )}
        {activeTab === 'Holdings' ? (
          <>
            {/* Account filter pills */}
            <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-outline">
              <button
                onClick={() => { setActiveAccount('All'); setShowAll(false); }}
                className={`px-3 py-1 text-xs font-bold transition-colors duration-75 ${
                  activeAccount === 'All'
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                All
              </button>
              {!combined && accounts.map((acct) => (
                <button
                  key={acct}
                  onClick={() => { setActiveAccount(acct); setShowAll(false); }}
                  className={`px-3 py-1 text-xs font-bold transition-colors duration-75 ${
                    activeAccount === acct
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {acct}{' '}
                  <span className="opacity-60">{accountCounts[acct]}</span>
                </button>
              ))}
              <div className="ml-auto flex border border-outline">
                <button
                  onClick={() => { setCombined(false); }}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-colors duration-75 ${
                    !combined ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Split
                </button>
                <button
                  onClick={() => { setCombined(true); setActiveAccount('All'); }}
                  className={`px-2.5 py-1 text-[10px] font-bold border-l border-outline transition-colors duration-75 ${
                    combined ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Merge
                </button>
              </div>
            </div>

            {/* Holdings grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-on-surface-variant bg-surface-container-lowest">
                  <tr className="section-header text-[10px]">
                    <th className="p-3 pl-4 cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('ticker')}>Asset{sortArrow('ticker')}</th>
                    <th className="p-3 cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('account')}>Account{sortArrow('account')}</th>
                    <th className="p-3 cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('qty')}>Qty{sortArrow('qty')}</th>
                    <th className="p-3 cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('price')}>Price{sortArrow('price')}</th>
                    <th className="p-3 text-right cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('mktValue')}>Mkt Value{sortArrow('mktValue')}</th>
                    <th className="p-3 text-right cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('cost')}>Cost{sortArrow('cost')}</th>
                    <th className="p-3 text-right cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('returnAmt')}>Return{sortArrow('returnAmt')}</th>
                    <th className="p-3 text-right cursor-pointer hover:text-on-surface select-none" onClick={() => toggleSort('allocPct')}>Alloc.{sortArrow('allocPct')}</th>
                    <th className="p-3">7D</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {displayHoldings.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-on-surface-variant text-sm">No holdings data. Import a CSV to get started.</td></tr>
                  ) : visible.map((h) => (
                    <tr key={`${h.account}-${h.ticker}`} className="hover:bg-surface-bright transition-colors duration-75">
                      {/* Asset — colored left border + type subtitle */}
                      <td className="p-3 pl-0">
                        <div className="flex items-stretch gap-0">
                          <div
                            className="w-[3px] shrink-0 self-stretch"
                            style={{ backgroundColor: ACCOUNT_COLORS[h.account] ?? '#8b949e' }}
                          />
                          <div className="pl-3">
                            <div className="font-bold text-on-surface">{h.ticker}</div>
                            <div className="text-[10px] text-on-surface-variant">{h.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-on-surface-variant">{h.account}</td>
                      {/* Qty */}
                      <td className="p-3 font-mono">
                        {h.qty != null ? (
                          <>{fmt(h.qty, h.qty % 1 !== 0 ? 2 : 0)} <span className="text-on-surface-variant">{h.unit}</span></>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      {/* Price + daily change */}
                      <td className="p-3 font-mono">
                        {h.price != null ? (
                          <div>
                            <div>${fmt(h.price)}</div>
                            {h.dailyPct != null && (
                              <div className={`text-[10px] ${h.dailyPct >= 0 ? 'text-secondary' : 'text-error'}`}>
                                {h.dailyPct >= 0 ? '+' : ''}{h.dailyPct.toFixed(2)}%
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      {/* Mkt Value */}
                      <td className="p-3 text-right font-mono font-bold">${fmt(h.mktValue, 0)}</td>
                      {/* Cost */}
                      <td className="p-3 text-right font-mono">
                        {h.cost != null ? `$${fmt(h.cost, 0)}` : <span className="text-on-surface-variant">—</span>}
                      </td>
                      {/* Return */}
                      <td className="p-3 text-right font-mono">
                        {h.returnAmt != null && h.returnPct != null ? (
                          <div className={h.returnPct >= 0 ? 'text-secondary' : 'text-error'}>
                            <div>{h.returnAmt >= 0 ? '+' : ''}${fmt(Math.abs(h.returnAmt), 0)}</div>
                            <div className="text-[10px]">{h.returnPct >= 0 ? '+' : ''}{h.returnPct}%</div>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      {/* Alloc */}
                      <td className="p-3 text-right font-mono">{h.allocPct}%</td>
                      {/* 7D Trend */}
                      <td className="p-3">
                        {h.trend ? (
                          <svg className="w-16 h-4 fill-none" viewBox="0 0 60 14">
                            <path
                              d={h.trend}
                              strokeWidth="2"
                              stroke={(h.returnPct ?? 0) >= 0 ? 'var(--color-secondary)' : 'var(--color-error)'}
                            />
                          </svg>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>

            {/* View All link */}
            {hasMore && (
              <button
                onClick={() => setShowAll((p) => !p)}
                className="w-full py-3 text-center text-xs font-bold text-primary hover:bg-surface-container transition-colors duration-75 border-t border-outline"
              >
                {showAll ? 'Show Less' : `View All ${filtered.length} Assets`}
              </button>
            )}
          </>
        ) : activeTab === 'Allocation' ? (
          DEMO_MODE ? <AllocationView /> : <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm">No allocation data</div>
        ) : activeTab === 'Performance' ? (
          DEMO_MODE ? <PerformanceView /> : <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm">No performance data</div>
        ) : (
          <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm">
            {activeTab} view coming soon
          </div>
        )}
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
            {DEMO_MODE ? (
              <>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Your <span className="text-on-surface font-bold">Technology concentration</span> is
                  12% above benchmark. Consider rebalancing into Healthcare or Consumer Staples.
                </p>
                <p className="text-xs text-secondary leading-relaxed flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  Outperforming 60/40 benchmark by 4.2% this quarter.
                </p>
              </>
            ) : (
              <p className="text-xs text-on-surface-variant leading-relaxed">—</p>
            )}
          </div>
        </div>

        <div className="bg-surface-container border border-outline p-6 flex flex-col justify-between">
          <div>
            <h4 className="text-[10px] text-on-surface-variant section-header mb-1">
              Projected Annual Income
            </h4>
            <p className="text-xl font-mono text-on-surface">{DEMO_MODE ? '$12,490.12' : '$—'}</p>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-mono mb-1.5 uppercase text-on-surface-variant">
              <span>{DEMO_MODE ? 'Target $20,000' : 'Target $—'}</span>
              <span className="text-primary">{DEMO_MODE ? '62.4%' : '—'}</span>
            </div>
            <div className="h-1.5 w-full bg-surface-container-highest overflow-hidden">
              <div className="h-full bg-primary" style={{ width: DEMO_MODE ? '62.4%' : '0%' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="pb-12" />

      <AddPositionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
