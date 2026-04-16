'use client';

import { X } from 'lucide-react';

interface CostRow {
  action: string;
  service: string;
  cost: string;
  frequency: string;
  notes?: string;
}

interface ModuleCostCatalog {
  name: string;
  paid: CostRow[];
  free: CostRow[];
}

/* ── Per-module cost catalogs ─────────────────────────────────────── */

const CATALOGS: Record<string, ModuleCostCatalog> = {
  housing: {
    name: 'Housing',
    paid: [
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
        service: 'Google Maps Street View (via local mpp-reseller)',
        cost: '$0.001 per listing, then free forever',
        frequency: 'On demand, only when you open a listing detail you have not opened before',
        notes:
          'Single Street View call at the listing\u2019s lat/lng. Cached on disk after the first fetch \u2014 re-opening the same listing costs nothing. Routed through the local mpp-reseller for ~7\u00d7 cheaper and ~5\u00d7 faster than the previous Tempo proxy path.',
      },
    ],
    free: [
      {
        action: 'Mortgage rates',
        service: 'Bankrate (direct API)',
        cost: 'Free',
        frequency: 'On demand from Budget & Loan \u2192 Apply',
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
        action: 'ZIP price-trend heat map',
        service: 'Zillow ZHVI + Census ZCTA polygons (static files)',
        cost: 'Free',
        frequency: 'Manual via scripts/fetch-zhvi.mjs (rerun monthly)',
        notes:
          'Pulls the public Zillow ZHVI CSV (~5 MB) plus a state-level zip GeoJSON, filters both to ~87 Austin metro zips, and writes the cached artifacts to public/austin-zhvi.json + public/austin-zips.geojson. The map renders entirely client-side from those files.',
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
    ],
  },

  portfolio: {
    name: 'Portfolio',
    paid: [
      {
        action: 'Real-time stock quote',
        service: 'Alpha Vantage (via MPP)',
        cost: '~$0.001 per quote',
        frequency: 'On demand when refreshing a position or loading the page',
        notes:
          'Not yet active \u2014 currently all data is manually entered. Will be wired up when live quote feeds are enabled.',
      },
    ],
    free: [],
  },

  food: {
    name: 'Food',
    paid: [
      {
        action: 'Restaurant booking',
        service: 'Resy (via agentres.dev)',
        cost: '$0.10 per booking',
        frequency: 'On demand when confirming a reservation',
        notes:
          'Charged only when you confirm a booking. Browsing restaurants and checking availability is free.',
      },
    ],
    free: [
      {
        action: 'Restaurant search',
        service: 'Resy (via agentres.dev)',
        cost: 'Free',
        frequency: 'On demand when searching for venues',
      },
      {
        action: 'Availability check',
        service: 'Resy (via agentres.dev)',
        cost: 'Free',
        frequency: 'On demand when viewing a restaurant\u2019s time slots',
      },
    ],
  },

  'fitness-tracker': {
    name: 'Fitness Tracker',
    paid: [],
    free: [],
  },
};

/* ── Fallback: all-modules summary for non-module pages ───────────── */

function getAllModulesCatalog(): ModuleCostCatalog {
  const paid: CostRow[] = [];
  const free: CostRow[] = [];
  for (const [, catalog] of Object.entries(CATALOGS)) {
    for (const row of catalog.paid) {
      paid.push({ ...row, action: `${row.action}`, service: `${catalog.name} \u2192 ${row.service}` });
    }
    for (const row of catalog.free) {
      free.push({ ...row, action: `${row.action}`, service: `${catalog.name} \u2192 ${row.service}` });
    }
  }
  return { name: 'Talaria', paid, free };
}

/* ── Modal component ──────────────────────────────────────────────── */

export default function CostInfoModal({
  open,
  onClose,
  moduleId,
}: {
  open: boolean;
  onClose: () => void;
  moduleId?: string;
}) {
  if (!open) return null;

  const catalog = moduleId && CATALOGS[moduleId]
    ? CATALOGS[moduleId]
    : getAllModulesCatalog();

  const scopeLabel = moduleId && CATALOGS[moduleId]
    ? `the ${catalog.name} module`
    : 'Talaria';

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
              Understanding the costs of {scopeLabel}
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
              {catalog.paid.length} {catalog.paid.length === 1 ? 'action' : 'actions'}
            </span>
          </div>
          {catalog.paid.length > 0 ? (
            <div className="space-y-3">
              {catalog.paid.map((row) => (
                <CostCard key={row.action} row={row} paid />
              ))}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant italic">
              No paid actions in this module. Everything is free.
            </p>
          )}
        </div>

        <div className="h-px bg-outline mx-5" />

        {/* Free actions */}
        <div className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="section-header text-xs text-secondary">
              Free actions
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {catalog.free.length} {catalog.free.length === 1 ? 'action' : 'actions'}
            </span>
          </div>
          {catalog.free.length > 0 ? (
            <div className="space-y-3">
              {catalog.free.map((row) => (
                <CostCard key={row.action} row={row} paid={false} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant italic">
              No free actions listed for this module.
            </p>
          )}
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
