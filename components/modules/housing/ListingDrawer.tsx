'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Bookmark,
  Calendar,
  Ruler,
} from 'lucide-react';
import { calculateMortgage } from '@/lib/modules/housing/mortgage';

interface Listing {
  id: number;
  address: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  hoaMonthly: number;
  taxAnnual: number;
  daysOnMarket: number;
  dealScore: number | null;
  monthlyCost: number | null;
  latitude: number;
  longitude: number;
}

interface NeighborhoodScore {
  zip: string;
  compositeScore: number;
  walkScore: number;
}

interface ListingDrawerProps {
  listing: Listing;
  neighborhoodScore: NeighborhoodScore | null;
  zipMedianPrice: number;
  zipMedianDom: number;
  downPaymentPct: number;
  loanTermYears: number;
  allRates?: { product: string; rate: number; apr: number }[];
  onClose: () => void;
}

const TERM_OPTIONS = [
  { key: '30yr_fixed', label: '30 yr', years: 30 },
  { key: '20yr_fixed', label: '20 yr', years: 20 },
  { key: '15yr_fixed', label: '15 yr', years: 15 },
  { key: '10yr_fixed', label: '10 yr', years: 10 },
];

export default function ListingDrawer({
  listing,
  neighborhoodScore,
  zipMedianPrice,
  zipMedianDom,
  downPaymentPct,
  allRates = [],
  onClose,
}: ListingDrawerProps) {
  const [tracked, setTracked] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('30yr_fixed');
  const [downPaymentOverride, setDownPaymentOverride] = useState<number | null>(null);
  const [editingDownPayment, setEditingDownPayment] = useState(false);
  const [downPaymentDraft, setDownPaymentDraft] = useState('');

  // HOA and Insurance are intrinsic to the listing and don't change between
  // calculator runs. HOA comes from the listing data; insurance is a flat
  // 0.6% of home value (industry rule of thumb).
  const effectiveHoa = listing.hoaMonthly;
  const effectiveInsurance = listing.price * 0.006;
  // Down payment % uses the user's profile default until they override it
  // for this specific listing. Override is per-drawer-instance, not persisted.
  const effectiveDownPaymentPct = downPaymentOverride ?? downPaymentPct;

  // Find best rate for selected term
  const bestRates = new Map<string, number>();
  for (const r of allRates) {
    if (!bestRates.has(r.product) || r.rate < bestRates.get(r.product)!) {
      bestRates.set(r.product, r.rate);
    }
  }

  const termConfig = TERM_OPTIONS.find((t) => t.key === selectedTerm) ?? TERM_OPTIONS[0];
  const termRate = bestRates.get(selectedTerm) ?? 5.98;

  const mortgage = calculateMortgage({
    homePrice: listing.price,
    downPaymentPct: effectiveDownPaymentPct,
    interestRate: termRate,
    loanTermYears: termConfig.years,
    annualPropertyTax: listing.taxAnnual,
    annualInsurance: effectiveInsurance,
    monthlyHoa: effectiveHoa,
  });

  useEffect(() => {
    fetch('/api/housing/track')
      .then((r) => r.json())
      .then((data) => {
        setTracked(data.some((t: { listing_id: number }) => t.listing_id === listing.id));
      })
      .catch(() => {});
  }, [listing.id]);

  async function toggleTrack() {
    if (tracked) {
      await fetch('/api/housing/track', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
    } else {
      await fetch('/api/housing/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
    }
    setTracked(!tracked);
  }

  const ppsf = listing.sqft > 0 ? listing.price / listing.sqft : 0;
  const priceVsMedian = zipMedianPrice > 0
    ? ((listing.price - zipMedianPrice) / zipMedianPrice * 100).toFixed(1)
    : null;

  return (
    <div className="h-full bg-background border-l border-outline flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-outline shrink-0">
        <button onClick={onClose} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        {listing.dealScore !== null && (
          <span className="bg-primary text-on-primary px-2 py-1 text-xs font-bold font-mono">
            SCORE {listing.dealScore}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Address + details */}
        <div>
          <h2 className="text-lg font-bold text-on-surface tracking-tight">
            {listing.address}
          </h2>
          <div className="text-xs text-on-surface-variant font-mono mt-1">
            {listing.zip} · Built {listing.yearBuilt}
          </div>
          <div className="flex gap-4 mt-2 text-sm text-on-surface-variant">
            <span>{listing.beds ?? '?'} bd</span>
            <span>{listing.baths ?? '?'} ba</span>
            <span>{listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : 'sqft —'}</span>
          </div>
        </div>

        {/* DOM */}
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={14} className="text-on-surface-variant" />
          <span className="text-on-surface">
            {listing.daysOnMarket} days on market
          </span>
          <span className="text-on-surface-variant text-xs">
            (avg {zipMedianDom})
          </span>
        </div>

        {/* Price */}
        <div className="bg-surface-container-low border border-outline p-4">
          <div className="font-mono text-2xl font-bold text-on-surface">
            ${listing.price.toLocaleString()}
          </div>
          <div className="text-xs text-on-surface-variant font-mono mt-1">
            <Ruler size={10} className="inline mr-1" />
            ${ppsf.toFixed(0)}/sqft
            {priceVsMedian && (
              <span className={Number(priceVsMedian) < 0 ? 'text-secondary ml-2' : 'text-error ml-2'}>
                {Number(priceVsMedian) > 0 ? '+' : ''}{priceVsMedian}% vs median
              </span>
            )}
          </div>
        </div>

        {/* Mortgage Calculator */}
        <div className="bg-surface-container-low border border-outline p-4">
          <h3 className="section-header text-xs text-on-surface-variant mb-3">
            Mortgage Calculator
          </h3>

          {/* Term tabs */}
          <div className="flex border border-outline mb-4">
            {TERM_OPTIONS.map((term) => {
              const rate = bestRates.get(term.key);
              return (
                <button
                  key={term.key}
                  onClick={() => setSelectedTerm(term.key)}
                  className={`flex-1 py-2 text-center ${
                    selectedTerm === term.key
                      ? 'bg-surface-container-highest text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <div className="text-xs font-bold">{term.label}</div>
                  <div className="font-mono text-[10px]">
                    {rate ? `${rate}%` : '—'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Headline: total interest */}
          <div className="text-center mb-4 pb-4 border-b border-outline/50">
            <div className="text-xs text-on-surface-variant mb-1">Total Mortgage Interest</div>
            <div className="font-mono text-2xl font-bold text-error">
              ${mortgage.total_interest_lifetime.toLocaleString()}
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            {/* Down Payment row — only editable input in the breakdown.
                Click the value to swap to inline %, Enter or OK to commit,
                Esc or X to cancel. Recomputes everything below instantly. */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-on-surface-variant">Down Payment</span>
              {editingDownPayment ? (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    value={downPaymentDraft}
                    onChange={(e) => setDownPaymentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = Number(downPaymentDraft);
                        if (Number.isFinite(n) && n >= 0 && n <= 100) {
                          setDownPaymentOverride(n);
                        }
                        setEditingDownPayment(false);
                      } else if (e.key === 'Escape') {
                        setEditingDownPayment(false);
                      }
                    }}
                    className="w-12 bg-surface-container-lowest border border-primary text-xs px-1 py-0.5 text-on-surface font-mono focus:outline-none text-right"
                    autoFocus
                  />
                  <span className="text-on-surface-variant">%</span>
                  <button
                    onClick={() => {
                      const n = Number(downPaymentDraft);
                      if (Number.isFinite(n) && n >= 0 && n <= 100) {
                        setDownPaymentOverride(n);
                      }
                      setEditingDownPayment(false);
                    }}
                    className="text-primary text-xs font-bold ml-1"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setEditingDownPayment(false)}
                    className="text-on-surface-variant text-xs"
                  >
                    X
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setDownPaymentDraft(String(effectiveDownPaymentPct));
                    setEditingDownPayment(true);
                  }}
                  className="font-mono text-on-surface hover:text-primary"
                  title="Click to edit"
                >
                  ${(listing.price * effectiveDownPaymentPct / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({effectiveDownPaymentPct}%)
                </button>
              )}
            </div>
            <CostRow label="Principal & Interest" value={mortgage.principal_interest} />
            <CostRow label="Property Tax" value={mortgage.property_tax} />
            <CostRow label="Insurance" value={mortgage.insurance} />
            <CostRow label="HOA" value={mortgage.hoa} />
            {mortgage.pmi > 0 && <CostRow label="PMI" value={mortgage.pmi} />}
            <div className="border-t border-outline pt-2 flex justify-between font-bold">
              <span className="text-sm text-on-surface">Total Monthly</span>
              <span className="font-mono text-base text-primary">
                ${mortgage.total_monthly.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Neighborhood */}
        {neighborhoodScore && (
          <div className="flex gap-3">
            <div className="flex-1 bg-surface-container-low border border-outline p-3 text-center">
              <div className="section-header text-[10px] text-on-surface-variant">Neighborhood</div>
              <div className="font-mono text-lg font-bold text-on-surface">{neighborhoodScore.compositeScore}</div>
            </div>
            <div className="flex-1 bg-surface-container-low border border-outline p-3 text-center">
              <div className="section-header text-[10px] text-on-surface-variant">Walk Score</div>
              <div className="font-mono text-lg font-bold text-on-surface">{neighborhoodScore.walkScore}</div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons. Both share the same outlined-with-teal-hover
          treatment used by the dashboard module cards. Bookmark conveys
          state via icon fill (empty bookmark → filled bookmark) instead of
          color inversion. */}
      <div className="shrink-0 p-4 border-t border-outline bg-surface-container-low flex gap-2">
        <a
          // listing.address already includes the zip ("...Austin, TX 78745").
          // Don't append it again — Zillow treats duplicate zips as junk.
          href={`https://www.zillow.com/homes/${encodeURIComponent(listing.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-9 border border-outline text-on-surface-variant text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 hover:shadow-[inset_0_0_0_2px_#46f1c5,0_0_12px_rgba(70,241,197,0.15)] hover:text-primary"
        >
          <ExternalLink size={12} />
          Zillow
        </a>
        <button
          onClick={toggleTrack}
          aria-pressed={tracked}
          aria-label={tracked ? 'Remove bookmark' : 'Bookmark this listing'}
          className={`flex-1 h-9 border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 hover:shadow-[inset_0_0_0_2px_#46f1c5,0_0_12px_rgba(70,241,197,0.15)] hover:text-primary ${
            tracked
              ? 'border-primary text-primary'
              : 'border-outline text-on-surface-variant'
          }`}
        >
          <Bookmark size={12} fill={tracked ? 'currentColor' : 'none'} />
          {tracked ? 'Bookmarked' : 'Bookmark'}
        </button>
      </div>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-mono text-on-surface">${value.toFixed(2)}</span>
    </div>
  );
}
