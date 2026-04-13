'use client';

import { useState } from 'react';
import { X, CheckCircle, Calendar } from 'lucide-react';

interface AddPositionDrawerProps {
  open: boolean;
  onClose: () => void;
}

const ACCOUNTS = [
  'Main Brokerage (0412)',
  'Long Term Growth',
  'Crypto Cold Storage',
];

export default function AddPositionDrawer({ open, onClose }: AddPositionDrawerProps) {
  const [mode, setMode] = useState<'holding' | 'transaction'>('holding');
  const [ticker, setTicker] = useState('NVDA');
  const [qty, setQty] = useState('12.50');
  const [costPerUnit, setCostPerUnit] = useState('782.40');
  const [date, setDate] = useState('2023-11-14');
  const [account, setAccount] = useState(ACCOUNTS[0]);

  const qtyNum = parseFloat(qty) || 0;
  const costNum = parseFloat(costPerUnit) || 0;
  const costBasis = qtyNum * costNum;
  const estPrice = 838.40; // dummy current price for NVDA
  const estValue = qtyNum * estPrice;
  const unrealized = estValue - costBasis;
  const unrealizedPct = costBasis > 0 ? (unrealized / costBasis) * 100 : 0;
  const portfolioImpact = 0.8; // dummy
  const isValid = ticker.length > 0 && qtyNum > 0 && costNum > 0;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <section className="fixed right-0 top-0 h-full w-[420px] bg-surface-container-low border-l border-outline z-50 flex flex-col">
        {/* Header */}
        <header className="p-6 flex items-center justify-between border-b border-outline">
          <h2 className="text-lg font-semibold text-on-surface">Add Position</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Mode toggle */}
          <div className="space-y-4">
            <div className="flex p-1 bg-surface-container-lowest border border-outline">
              <button
                onClick={() => setMode('holding')}
                className={`flex-1 py-2 text-xs font-semibold transition-colors duration-75 ${
                  mode === 'holding'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Add Holding
              </button>
              <button
                onClick={() => setMode('transaction')}
                className={`flex-1 py-2 text-xs font-semibold transition-colors duration-75 ${
                  mode === 'transaction'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Log Transaction
              </button>
            </div>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            {/* Account */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-on-surface-variant section-header">
                Target Account
              </label>
              <div className="relative">
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-sm text-on-surface appearance-none focus:border-primary focus:outline-none transition-colors"
                >
                  {ACCOUNTS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <ChevronIcon />
              </div>
            </div>

            {/* Ticker */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-on-surface-variant section-header">
                Asset Ticker
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL, BTC"
                  className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-sm text-on-surface font-mono focus:border-primary focus:outline-none transition-colors"
                />
                {ticker.length > 0 && (
                  <CheckCircle
                    size={18}
                    strokeWidth={1.5}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary fill-primary/20"
                  />
                )}
              </div>
            </div>

            {/* Qty + Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-on-surface-variant section-header">
                  Quantity
                </label>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-sm text-on-surface font-mono focus:border-primary focus:outline-none transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-on-surface-variant section-header">
                  Cost Per Unit (USD)
                </label>
                <input
                  type="number"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-sm text-on-surface font-mono focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-on-surface-variant section-header">
                Acquisition Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline px-4 py-3 text-sm text-on-surface font-mono uppercase focus:border-primary focus:outline-none transition-colors"
                />
                <Calendar
                  size={16}
                  strokeWidth={1.5}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                />
              </div>
            </div>
          </form>

          {/* Preview card */}
          {isValid && (
            <div className="bg-surface-container-high p-5 border-l-2 border-primary space-y-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-mono text-on-surface-variant section-header">
                  Projection Preview
                </span>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold">
                  READY
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-4">
                <div>
                  <p className="text-[10px] text-on-surface-variant mb-0.5">Est. Market Value</p>
                  <p className="text-sm font-mono text-on-surface font-semibold">
                    ${estValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-on-surface-variant mb-0.5">Cost Basis</p>
                  <p className="text-sm font-mono text-on-surface">
                    ${costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant mb-0.5">Unrealized Return</p>
                  <p className={`text-sm font-mono ${unrealized >= 0 ? 'text-secondary' : 'text-error'}`}>
                    {unrealized >= 0 ? '+' : '-'}${Math.abs(unrealized).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {' '}({unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(2)}%)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Impact indicators */}
          {isValid && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-surface-container border border-outline">
                <p className="text-[9px] text-on-surface-variant section-header mb-2">Tax Exposure</p>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 bg-surface-container-highest overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: '35%' }} />
                  </div>
                  <span className="text-[10px] font-mono text-secondary">LOW</span>
                </div>
              </div>
              <div className="p-3 bg-surface-container border border-outline">
                <p className="text-[9px] text-on-surface-variant section-header mb-2">Portfolio Impact</p>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 bg-surface-container-highest overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${portfolioImpact * 10}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-primary">{portfolioImpact}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-6 border-t border-outline bg-surface-container-low">
          <button
            disabled={!isValid}
            className="w-full py-4 bg-primary text-on-primary font-semibold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Add to Portfolio
          </button>
          <p className="text-center text-[10px] text-on-surface-variant mt-3 font-mono opacity-50 uppercase tracking-tighter">
            TX_ID: TALA-882-9912-PRTF
          </p>
        </footer>
      </section>
    </>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
