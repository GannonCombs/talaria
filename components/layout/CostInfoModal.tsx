'use client';

import { X } from 'lucide-react';

interface CostRow {
  action: string;
  service: string;
  cost: string;
  frequency: string;
  notes?: string;
}

// Static catalog of every paid action in the app today. Update when
// adding new MPP integrations. Free actions (Bankrate, Polymarket,
// FRED, etc.) are listed at the bottom for completeness.
const PAID_ACTIONS: CostRow[] = [
  {
    action: 'Refresh Austin listings',
    service: 'RentCast (via Locus)',
    cost: '~$0.33 per refresh',
    frequency: 'Auto, once per 7 days on /housing load',
    notes:
      '10 paginated calls × $0.033. Server-enforced 1-hour cooldown prevents loops on failure. Hard cap of 60 pages = $1.98.',
  },
  {
    action: 'Listing photo (per house)',
    service: 'Google Maps Street View (via Tempo)',
    cost: '$0.007 per listing, then free forever',
    frequency: 'On demand, only when you open a listing detail you have not opened before',
    notes:
      'Single Street View call at the listing\u2019s lat/lng. Cached on disk after the first fetch \u2014 re-opening the same listing costs nothing.',
  },
];

const FREE_ACTIONS: CostRow[] = [
  {
    action: 'Mortgage rates',
    service: 'Bankrate (direct API)',
    cost: 'Free',
    frequency: 'On demand from Budget & Loan → Apply',
  },
  {
    action: 'Fed rate forecast',
    service: 'Polymarket (direct API)',
    cost: 'Free',
    frequency: 'Once on /housing load',
  },
  {
    action: 'US 30yr mortgage history',
    service: 'FRED PMMS (one-time CSV download)',
    cost: 'Free',
    frequency: 'Manual via scripts/fetch-pmms.mjs',
  },
  {
    action: 'Austin price history (sparkline)',
    service: 'Zillow ZHVI (static file)',
    cost: 'Free',
    frequency: 'Once on /housing load',
  },
  {
    action: 'Map tiles',
    service: 'Stadia Maps',
    cost: 'Free',
    frequency: 'Continuous while map is open',
  },
  {
    action: 'Drive-time isochrones',
    service: 'Valhalla (free public API)',
    cost: 'Free',
    frequency: 'Once on /housing load (background)',
  },
  {
    action: 'Address geocoding',
    service: 'Nominatim (OpenStreetMap)',
    cost: 'Free',
    frequency: 'On demand when adding isochrone addresses',
  },
];

export default function CostInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-outline max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline sticky top-0 bg-background">
          <div>
            <h2 className="text-lg font-bold text-on-surface tracking-tight">
              Understanding the costs of this app
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Talaria uses the Machine Payments Protocol (MPP) to pay for some
              data per request. Here&apos;s every action that spends money — and
              every action that doesn&apos;t.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface ml-4 shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Paid actions */}
        <div className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="section-header text-xs text-tertiary-container">
              Paid actions
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {PAID_ACTIONS.length} {PAID_ACTIONS.length === 1 ? 'action' : 'actions'}
            </span>
          </div>
          <div className="space-y-3">
            {PAID_ACTIONS.map((row) => (
              <CostCard key={row.action} row={row} paid />
            ))}
          </div>
        </div>

        <div className="h-px bg-outline mx-5" />

        {/* Free actions */}
        <div className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="section-header text-xs text-secondary">
              Free actions
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {FREE_ACTIONS.length} {FREE_ACTIONS.length === 1 ? 'action' : 'actions'}
            </span>
          </div>
          <div className="space-y-3">
            {FREE_ACTIONS.map((row) => (
              <CostCard key={row.action} row={row} paid={false} />
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="p-5 border-t border-outline bg-surface-container-low text-xs text-on-surface-variant">
          <p className="leading-relaxed">
            <strong className="text-on-surface">How spend gating works:</strong>{' '}
            Every paid action requires explicit user authorization, either via
            an explicit click or via the auto-refresh schedule shown above. The
            cost pill in the top bar shows today&apos;s total spend, and the
            full transaction history lives at{' '}
            <a href="/cost-analytics" className="text-primary hover:underline">
              Cost Analytics
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function CostCard({ row, paid }: { row: CostRow; paid: boolean }) {
  return (
    <div
      className={`border p-3 ${
        paid ? 'border-tertiary-container/40 bg-tertiary-container/5' : 'border-outline'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-bold text-on-surface">{row.action}</div>
        <div
          className={`font-mono text-xs font-bold whitespace-nowrap ${
            paid ? 'text-tertiary-container' : 'text-secondary'
          }`}
        >
          {row.cost}
        </div>
      </div>
      <div className="text-[11px] text-on-surface-variant font-mono mt-1">
        {row.service}
      </div>
      <div className="text-[11px] text-on-surface-variant mt-1">{row.frequency}</div>
      {row.notes && (
        <div className="text-[11px] text-on-surface-variant/80 mt-2 italic">
          {row.notes}
        </div>
      )}
    </div>
  );
}
