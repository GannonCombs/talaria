'use client';

import { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Home,
  Calendar,
  Ruler,
  DollarSign,
} from 'lucide-react';
import { calculateMortgage, rateSensitivity } from '@/lib/modules/housing/mortgage';

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
  currentRate: number;
  downPaymentPct: number;
  loanTermYears: number;
  onClose: () => void;
}

export default function ListingDrawer({
  listing,
  neighborhoodScore,
  zipMedianPrice,
  zipMedianDom,
  currentRate,
  downPaymentPct,
  loanTermYears,
  onClose,
}: ListingDrawerProps) {
  const [tracked, setTracked] = useState(false);
  const [hoaOverride, setHoaOverride] = useState<number | null>(null);
  const [insuranceOverride, setInsuranceOverride] = useState<number | null>(null);
  const [editingHoa, setEditingHoa] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState(false);

  const effectiveHoa = hoaOverride ?? listing.hoaMonthly;
  const effectiveInsurance = insuranceOverride ?? listing.price * 0.006;

  const mortgage = calculateMortgage({
    homePrice: listing.price,
    downPaymentPct,
    interestRate: currentRate,
    loanTermYears,
    annualPropertyTax: listing.taxAnnual,
    annualInsurance: effectiveInsurance,
    monthlyHoa: effectiveHoa,
  });

  const sensitivity = rateSensitivity({
    homePrice: listing.price,
    downPaymentPct,
    currentRate,
    loanTermYears,
    annualPropertyTax: listing.taxAnnual,
  });

  // Check if tracked
  useEffect(() => {
    fetch('/api/housing/track')
      .then((r) => r.json())
      .then((data) => {
        const isTracked = data.some(
          (t: { listing_id: number }) => t.listing_id === listing.id
        );
        setTracked(isTracked);
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
  const medianPpsf = zipMedianPrice > 0 && listing.sqft > 0 ? zipMedianPrice / listing.sqft : 0;
  const priceVsMedian = zipMedianPrice > 0
    ? ((listing.price - zipMedianPrice) / zipMedianPrice * 100).toFixed(1)
    : null;

  return (
    <div className="absolute top-0 right-0 w-[400px] h-full bg-background border-l border-outline z-[1100] flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.5)]">
      {/* Header / Photo placeholder */}
      <div className="relative h-48 bg-surface-container-high shrink-0 flex items-center justify-center">
        <Home size={48} className="text-on-surface-variant opacity-20" />
        {listing.dealScore !== null && (
          <div className="absolute top-3 left-3 bg-primary text-on-primary px-2 py-1 text-xs font-bold font-mono">
            SCORE {listing.dealScore}
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 bg-surface-container border border-outline text-on-surface-variant hover:text-on-surface"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Address + details */}
        <div>
          <h2 className="text-lg font-bold text-on-surface tracking-tight">
            {listing.address}
          </h2>
          <div className="text-[10px] text-on-surface-variant font-mono mt-1">
            {listing.zip} · Built {listing.yearBuilt}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-on-surface-variant">
            <span>{listing.beds} bd</span>
            <span>{listing.baths} ba</span>
            <span>{listing.sqft.toLocaleString()} sqft</span>
            <span>{listing.lotSqft.toLocaleString()} lot</span>
          </div>
        </div>

        {/* DOM context */}
        <div className="flex items-center gap-2 text-xs">
          <Calendar size={14} className="text-on-surface-variant" />
          <span className="text-on-surface">
            {listing.daysOnMarket} days on market
          </span>
          <span className="text-on-surface-variant">
            (avg {zipMedianDom} in {listing.zip})
          </span>
        </div>

        {/* Price */}
        <div className="bg-surface-container-low border border-outline p-4">
          <div className="flex justify-between items-end">
            <div>
              <div className="font-mono text-2xl font-bold text-on-surface">
                ${listing.price.toLocaleString()}
              </div>
              <div className="text-[10px] text-on-surface-variant font-mono mt-1">
                <Ruler size={10} className="inline mr-1" />
                ${ppsf.toFixed(0)}/sqft
                {priceVsMedian && (
                  <span className={Number(priceVsMedian) < 0 ? 'text-secondary ml-2' : 'text-error ml-2'}>
                    {Number(priceVsMedian) > 0 ? '+' : ''}{priceVsMedian}% vs median
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Cost Breakdown */}
        <div className="bg-surface-container-low border border-outline p-4">
          <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
            Monthly Cost Breakdown
          </h3>
          <div className="space-y-2">
            <CostRow label="Principal & Interest" value={mortgage.principal_interest} />
            <CostRow label="Property Tax" value={mortgage.property_tax} />
            <CostRow
              label="Insurance"
              value={mortgage.insurance}
              editable
              editing={editingInsurance}
              onEdit={() => setEditingInsurance(true)}
              onSave={(v) => { setInsuranceOverride(v * 12); setEditingInsurance(false); }}
              onCancel={() => setEditingInsurance(false)}
            />
            <CostRow
              label="HOA"
              value={mortgage.hoa}
              editable
              editing={editingHoa}
              onEdit={() => setEditingHoa(true)}
              onSave={(v) => { setHoaOverride(v); setEditingHoa(false); }}
              onCancel={() => setEditingHoa(false)}
            />
            {mortgage.pmi > 0 && <CostRow label="PMI" value={mortgage.pmi} />}
            <div className="border-t border-outline pt-2 flex justify-between font-bold">
              <span className="text-xs text-on-surface">Total Monthly</span>
              <span className="font-mono text-sm text-primary">
                ${mortgage.total_monthly.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Rate Sensitivity */}
        <div className="bg-surface-container-low border border-outline p-4">
          <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
            Rate Sensitivity
          </h3>
          <div className="space-y-1">
            {sensitivity.map((s) => (
              <div
                key={s.rate}
                className={`flex justify-between text-xs py-1 ${
                  s.rateChange === 0 ? 'text-primary font-bold' : 'text-on-surface-variant'
                }`}
              >
                <span className="font-mono">
                  {s.rateChange > 0 ? '+' : ''}{s.rateChange.toFixed(2)}% → {s.rate}%
                </span>
                <span className="font-mono">
                  ${s.monthlyPayment.toLocaleString()}/mo
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Neighborhood Score */}
        {neighborhoodScore && (
          <div className="flex gap-2">
            <ScorePill label="Neighborhood" value={neighborhoodScore.compositeScore} />
            <ScorePill label="Walk Score" value={neighborhoodScore.walkScore} />
          </div>
        )}
      </div>

      {/* Action buttons — sticky bottom */}
      <div className="shrink-0 p-4 border-t border-outline bg-surface-container-low flex gap-2">
        <a
          href={`https://www.zillow.com/homes/${encodeURIComponent(listing.address + ' ' + listing.zip)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-9 border border-outline text-on-surface-variant text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-surface-bright"
        >
          <ExternalLink size={12} />
          Zillow
        </a>
        <a
          href={`https://www.redfin.com/search#query=${encodeURIComponent(listing.address + ' ' + listing.zip)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-9 border border-outline text-on-surface-variant text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-surface-bright"
        >
          <ExternalLink size={12} />
          Redfin
        </a>
        <button
          onClick={toggleTrack}
          className={`flex-1 h-9 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 ${
            tracked
              ? 'bg-primary text-on-primary'
              : 'border border-primary text-primary hover:bg-primary hover:text-on-primary'
          }`}
        >
          {tracked ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
          {tracked ? 'Tracked' : 'Track'}
        </button>
      </div>
    </div>
  );
}

function CostRow({
  label,
  value,
  editable,
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  label: string;
  value: number;
  editable?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: (v: number) => void;
  onCancel?: () => void;
}) {
  const [editValue, setEditValue] = useState(String(Math.round(value)));

  if (editing && onSave && onCancel) {
    return (
      <div className="flex justify-between items-center text-xs">
        <span className="text-on-surface-variant">{label}</span>
        <div className="flex items-center gap-1">
          <span className="text-on-surface-variant">$</span>
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-16 bg-surface-container-lowest border border-primary text-xs px-1 py-0.5 text-on-surface font-mono focus:outline-none"
            autoFocus
          />
          <button onClick={() => onSave(Number(editValue))} className="text-primary text-[10px] font-bold">
            OK
          </button>
          <button onClick={onCancel} className="text-on-surface-variant text-[10px]">
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-on-surface">${value.toFixed(2)}</span>
        {editable && onEdit && (
          <button onClick={onEdit} className="text-on-surface-variant hover:text-primary">
            <DollarSign size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 bg-surface-container-low border border-outline p-2 text-center">
      <div className="section-header text-[8px] text-on-surface-variant">{label}</div>
      <div className="font-mono text-sm font-bold text-on-surface">{value}</div>
    </div>
  );
}
