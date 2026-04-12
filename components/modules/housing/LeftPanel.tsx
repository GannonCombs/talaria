'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Check, ChevronRight, MapPin, SlidersHorizontal, DollarSign, Plus, Trash2, TrendingUp } from 'lucide-react';
import type { ScoringWeights } from '@/lib/modules/housing/scoring';
import { formatRelativeFromNow } from '@/lib/time';

// Inlined here (rather than imported from ./HousingMap) so this file
// stays SSR-safe — HousingMap.tsx pulls in Leaflet at module load,
// which references `window` and breaks server rendering.
function formatPeriod(months: number): string {
  if (months === 1) return '1 month';
  if (months < 12) return `${months} months`;
  if (months === 12) return '1 year';
  if (months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
}

interface Filters {
  priceMin: number;
  priceMax: number;
  minBeds: number;
  minBaths: number;
  minSqft: number;
  propertyTypes: string[];
  bookmarksOnly: boolean;
  // More Options
  maxDom: number;
  yearMin: number;
  yearMax: number;
  minLotSqft: number;
  maxHoa: number;
  hasHoa: 'any' | 'yes' | 'no';
}

const PROPERTY_TYPES = [
  'Single Family',
  'Condo',
  'Townhouse',
  'Multi-Family',
  'Land',
  'Manufactured',
] as const;

export interface IsochroneAddress {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  color: string;
  driveMinutes: number;
}

interface LeftPanelProps {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  weights: ScoringWeights;
  onWeightsChange: (w: ScoringWeights) => void;
  // Budget & Loan
  creditScore: number;
  city: string;
  stateCode: string;
  ratesUpdatedAt: string | null;
  onCreditScoreChange: (v: number) => void;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onRefreshRates: () => void;
  // Isochrones
  isochroneAddresses: IsochroneAddress[];
  onIsochroneAddressesChange: (addrs: IsochroneAddress[]) => void;
  onIsochroneSubmit: () => void;
  // Round 4: Price Trends — period control for the zip-code heat map.
  // Owned by the parent housing page so HousingMap and LeftPanel read
  // from the same source. Visibility toggle stays in the map controls.
  priceTrendMonths: number;
  onPriceTrendMonthsChange: (months: number) => void;
  wiredDimensions?: string[];
}

type SectionView = 'menu' | 'isochrones' | 'scoring' | 'budget' | 'priceTrends';

const PRICE_TREND_PRESETS: ReadonlyArray<{ months: number; label: string }> = [
  { months: 1, label: '1mo' },
  { months: 6, label: '6mo' },
  { months: 12, label: '1yr' },
  { months: 24, label: '2yr' },
  { months: 60, label: '5yr' },
];

function WeightSlider({
  label,
  value,
  onChange,
  wired,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  wired?: boolean;
}) {
  return (
    <div className="py-2">
      <div className="flex justify-between mb-1">
        <span className="text-xs text-on-surface-variant flex items-center gap-1">
          {wired && <Check size={12} className="text-primary shrink-0" />}
          {label}
        </span>
        <span className="font-mono text-xs text-on-surface">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-primary bg-surface-container-highest appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
      />
    </div>
  );
}

const ISO_COLORS = ['#46f1c5', '#fbab29', '#67df70', '#ffcf91', '#8b949e'];

export default function LeftPanel({
  filters,
  onFiltersChange,
  weights,
  onWeightsChange,
  creditScore,
  city,
  stateCode,
  ratesUpdatedAt,
  onCreditScoreChange,
  onCityChange,
  onStateChange,
  onRefreshRates,
  isochroneAddresses,
  onIsochroneAddressesChange,
  onIsochroneSubmit,
  priceTrendMonths,
  onPriceTrendMonthsChange,
  wiredDimensions = [],
}: LeftPanelProps) {
  const wiredSet = new Set(wiredDimensions);
  const [section, setSection] = useState<SectionView>('menu');
  const [moreOptions, setMoreOptions] = useState(false);

  // Draft filters: inputs feed this local state on every keystroke. The
  // parent's `filters` only updates (and the listings re-fetch) when the
  // user clicks the Go button. This is the same pattern as the isochrone
  // submit flow — keeps editing 250000 → 200000 from briefly committing
  // a "max $20,000" filter mid-keystroke.
  const [draftFilters, setDraftFilters] = useState<Filters>(filters);

  // Keep draft synced with parent on external changes (e.g. preference
  // load on mount, future Reset button) without clobbering local edits.
  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const filtersDirty =
    draftFilters.priceMin !== filters.priceMin ||
    draftFilters.priceMax !== filters.priceMax ||
    draftFilters.minBeds !== filters.minBeds ||
    draftFilters.minBaths !== filters.minBaths ||
    draftFilters.minSqft !== filters.minSqft ||
    draftFilters.maxDom !== filters.maxDom ||
    draftFilters.yearMin !== filters.yearMin ||
    draftFilters.yearMax !== filters.yearMax ||
    draftFilters.minLotSqft !== filters.minLotSqft ||
    draftFilters.maxHoa !== filters.maxHoa ||
    draftFilters.hasHoa !== filters.hasHoa ||
    draftFilters.bookmarksOnly !== filters.bookmarksOnly ||
    draftFilters.propertyTypes.length !== filters.propertyTypes.length ||
    draftFilters.propertyTypes.some((t, i) => t !== filters.propertyTypes[i]);

  function updateDraft<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraftFilters({ ...draftFilters, [key]: value });
  }

  function commitFilters() {
    onFiltersChange(draftFilters);
  }

  function updateWeight(key: keyof ScoringWeights, value: number) {
    onWeightsChange({ ...weights, [key]: value });
  }

  // ── Section: Isochrones ──
  if (section === 'isochrones') {
    function addAddress() {
      if (isochroneAddresses.length >= 5) return;
      const nextColor = ISO_COLORS[isochroneAddresses.length] ?? '#8b949e';
      onIsochroneAddressesChange([
        ...isochroneAddresses,
        { id: crypto.randomUUID(), label: '', address: '', lat: 0, lng: 0, color: nextColor, driveMinutes: 30 },
      ]);
    }

    function removeAddress(id: string) {
      onIsochroneAddressesChange(isochroneAddresses.filter((a) => a.id !== id));
    }

    async function geocodeAddress(id: string, address: string) {
      if (!address.trim()) return;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'Talaria/1.0' } }
        );
        const data = await res.json();
        if (data.length > 0) {
          const { lat, lon } = data[0];
          onIsochroneAddressesChange(
            isochroneAddresses.map((a) =>
              a.id === id ? { ...a, lat: parseFloat(lat), lng: parseFloat(lon) } : a
            )
          );
        }
      } catch {
        // Geocoding failed silently
      }
    }

    function updateAddress(id: string, field: keyof IsochroneAddress, value: string | number) {
      onIsochroneAddressesChange(
        isochroneAddresses.map((a) => (a.id === id ? { ...a, [field]: value } : a))
      );
    }

    return (
      <div className="h-full overflow-y-auto border-r border-outline bg-background p-5">
        <button onClick={() => setSection('menu')} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4">
          <ArrowLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        <h3 className="section-header text-xs text-on-surface mb-4">Isochrone Addresses</h3>
        <p className="text-xs text-on-surface-variant mb-4">
          Each address generates a drive-time boundary on the map. Up to 5 addresses.
        </p>

        <div className="space-y-4">
          {isochroneAddresses.map((addr) => (
            <div key={addr.id} className="border border-outline p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: addr.color }} />
                  <input
                    type="text"
                    placeholder="Label (e.g. Office)"
                    value={addr.label}
                    onChange={(e) => updateAddress(addr.id, 'label', e.target.value)}
                    className="bg-transparent border-none text-sm text-on-surface font-medium focus:outline-none placeholder:text-on-surface-variant w-full"
                  />
                </div>
                <button onClick={() => removeAddress(addr.id)} className="text-on-surface-variant hover:text-error shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Address or place name"
                value={addr.address}
                onChange={(e) => updateAddress(addr.id, 'address', e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
              />
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={addr.driveMinutes}
                  onChange={(e) => updateAddress(addr.id, 'driveMinutes', Number(e.target.value))}
                  className="w-16 bg-surface-container-lowest border border-outline text-sm px-2 py-1.5 text-on-surface font-mono focus:border-primary focus:outline-none text-center"
                />
                <span className="text-xs text-on-surface-variant">min</span>
                <div className="flex-1" />
                <button
                  onClick={async () => { await geocodeAddress(addr.id, addr.address); onIsochroneSubmit(); }}
                  className="px-3 py-1.5 border border-primary text-xs text-primary hover:bg-primary hover:text-on-primary shrink-0"
                >
                  Go
                </button>
              </div>
              {addr.lat !== 0 && (
                <div className="text-[10px] text-on-surface-variant font-mono">
                  {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)} · {addr.driveMinutes} min
                </div>
              )}
            </div>
          ))}
        </div>

        {isochroneAddresses.length < 5 && (
          <button
            onClick={addAddress}
            className="mt-4 w-full flex items-center justify-center gap-2 p-3 border border-dashed border-outline text-on-surface-variant hover:border-primary hover:text-primary text-sm"
          >
            <Plus size={14} />
            Add Address
          </button>
        )}
      </div>
    );
  }

  // ── Section: Scoring ──
  if (section === 'scoring') {
    return (
      <div className="h-full overflow-y-auto border-r border-outline bg-background p-5">
        <button onClick={() => setSection('menu')} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4">
          <ArrowLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        <h3 className="section-header text-xs text-on-surface mb-4">Neighborhood Scoring</h3>
        <p className="text-xs text-on-surface-variant mb-4">
          Adjust weights to prioritize what matters to you. Higher = more important.
        </p>
        <div className="space-y-1">
          <WeightSlider label="Safety / Crime" value={weights.crime} onChange={(v) => updateWeight('crime', v)} wired={wiredSet.has('crime')} />
          <WeightSlider label="Schools" value={weights.schools} onChange={(v) => updateWeight('schools', v)} wired={wiredSet.has('schools')} />
          <WeightSlider label="Commute: Work" value={weights.commute_work} onChange={(v) => updateWeight('commute_work', v)} wired={wiredSet.has('commute_work')} />
          <WeightSlider label="Commute: Social" value={weights.commute_downtown} onChange={(v) => updateWeight('commute_downtown', v)} wired={wiredSet.has('commute_downtown')} />
          <WeightSlider label="Walkability" value={weights.walkability} onChange={(v) => updateWeight('walkability', v)} wired={wiredSet.has('walkability')} />
          <WeightSlider label="Price Value" value={weights.price} onChange={(v) => updateWeight('price', v)} wired={wiredSet.has('price')} />
          <WeightSlider label="AVM (Underpriced)" value={weights.income} onChange={(v) => updateWeight('income', v)} wired={wiredSet.has('income')} />
        </div>
        <div className="text-[10px] text-on-surface-variant mt-4">
          Dimensions with a checkmark have real data. Others use placeholder values and are excluded from scoring until wired up.
        </div>
      </div>
    );
  }

  // ── Section: Budget & Loan ──
  if (section === 'budget') {
    const updatedLabel = ratesUpdatedAt
      ? `Updated ${formatRelativeFromNow(ratesUpdatedAt)}`
      : 'Rates not refreshed yet';
    return (
      <div className="h-full overflow-y-auto border-r border-outline bg-background p-4">
        <button onClick={() => setSection('menu')} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4">
          <ArrowLeft size={16} />
          <span className="text-xs">Back</span>
        </button>
        <h3 className="section-header text-xs text-on-surface mb-4">Budget & Loan</h3>
        <div className="space-y-4">
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Credit Score</label>
            <select
              value={creditScore}
              onChange={(e) => onCreditScoreChange(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value={780}>780+ (Excellent)</option>
              <option value={740}>740–779 (Very Good)</option>
              <option value={700}>700–739 (Good)</option>
              <option value={660}>660–699 (Fair)</option>
              <option value={620}>620–659 (Poor)</option>
            </select>
            <div className="text-[10px] text-on-surface-variant mt-1">
              Used for Bankrate rate lookup. Down payment % is per-listing — set it in the listing detail.
            </div>
          </div>

          <div className="h-px bg-outline/50 my-2" />

          {/* Search Area: city + state. Drives the housing module's
              default location for any feature that wants one. */}
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Search Area</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="City"
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
              />
              <input
                type="text"
                placeholder="ST"
                maxLength={2}
                value={stateCode}
                onChange={(e) => onStateChange(e.target.value.toUpperCase())}
                className="w-14 bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
              />
            </div>
          </div>

          <div className="h-px bg-outline/50 my-2" />

          <button
            onClick={onRefreshRates}
            className="w-full h-9 text-xs font-bold uppercase tracking-wider border border-primary text-primary hover:bg-primary hover:text-on-primary"
          >
            Apply
          </button>
          <div className="text-[10px] text-on-surface-variant text-center font-mono">
            {updatedLabel}
          </div>
        </div>
      </div>
    );
  }

  // ── Section: Price Trends (Round 4) ──
  if (section === 'priceTrends') {
    return (
      <div className="h-full overflow-y-auto border-r border-outline bg-background p-5">
        <button
          onClick={() => setSection('menu')}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        <h3 className="section-header text-xs text-on-surface mb-4">Price Trends</h3>
        <p className="text-xs text-on-surface-variant mb-4">
          Color zip codes on the map by their Zillow Home Value Index change
          over the period below. Toggle the layer on/off via the &ldquo;Price
          Trends&rdquo; checkbox in the upper-right map controls.
        </p>

        {/* Period control */}
        <div className="border border-outline p-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-on-surface-variant uppercase tracking-wider">
                Period
              </span>
              <span className="font-mono text-sm text-on-surface">
                {formatPeriod(priceTrendMonths)}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={priceTrendMonths}
              onChange={(e) => onPriceTrendMonthsChange(Number(e.target.value))}
              className="w-full h-1 accent-primary bg-surface-container-highest appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
            />
            <div className="flex justify-between text-[10px] text-on-surface-variant font-mono mt-1">
              <span>1 mo</span>
              <span>5 yr</span>
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-2">
              Quick set
            </div>
            <div className="flex gap-1">
              {PRICE_TREND_PRESETS.map((p) => (
                <button
                  key={p.months}
                  onClick={() => onPriceTrendMonthsChange(p.months)}
                  className={`flex-1 h-8 text-xs font-mono border ${
                    priceTrendMonths === p.months
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-outline text-on-surface-variant hover:border-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Color legend */}
        <div className="mt-5">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-2">
            Color scale
          </div>
          <div
            className="h-3 w-full"
            style={{
              background:
                'linear-gradient(to right, rgb(229, 83, 75), rgb(48, 54, 61), rgb(63, 185, 80))',
            }}
          />
          <div className="flex justify-between text-[10px] text-on-surface-variant font-mono mt-1">
            <span>−10% or worse</span>
            <span>flat</span>
            <span>+10% or better</span>
          </div>
        </div>

        {/* Data source attribution */}
        <p className="text-[10px] text-on-surface-variant mt-6 leading-relaxed">
          Source: Zillow Home Value Index (ZHVI), middle tier, smoothed,
          seasonally adjusted. Free public dataset, refreshed monthly when
          <span className="font-mono"> npm run fetch-zhvi </span>
          is run.
        </p>
      </div>
    );
  }

  // ── Default: Filters + Section Menu ──
  return (
    <div className="h-full overflow-y-auto border-r border-outline bg-background p-5 flex flex-col">
      {/* Filters */}
      <div className="space-y-4 mb-5">
        <h3 className="section-header text-xs text-on-surface-variant">Filters</h3>

        {/* Property Type — multi-select chips */}
        <div>
          <label className="section-header text-xs text-on-surface-variant block mb-2">Property Type</label>
          <div className="flex flex-wrap gap-1.5">
            {PROPERTY_TYPES.map((type) => {
              const active = draftFilters.propertyTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => {
                    const next = active
                      ? draftFilters.propertyTypes.filter((t) => t !== type)
                      : [...draftFilters.propertyTypes, type];
                    updateDraft('propertyTypes', next);
                  }}
                  className={`text-[11px] font-mono px-2 py-1 border ${
                    active
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-outline text-on-surface-variant hover:border-on-surface-variant'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price Range */}
        <div>
          <label className="section-header text-xs text-on-surface-variant block mb-1">Price Range</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={draftFilters.priceMin || ''}
              onChange={(e) => updateDraft('priceMin', Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
            <span className="text-on-surface-variant text-sm">–</span>
            <input
              type="number"
              placeholder="Max"
              value={draftFilters.priceMax || ''}
              onChange={(e) => updateDraft('priceMax', Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
          </div>
        </div>

        {/* Beds + Baths */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Beds</label>
            <select
              value={draftFilters.minBeds}
              onChange={(e) => updateDraft('minBeds', Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value={0}>Any</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
            </select>
          </div>
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Baths</label>
            <select
              value={draftFilters.minBaths}
              onChange={(e) => updateDraft('minBaths', Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value={0}>Any</option>
              <option value={1}>1+</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
            </select>
          </div>
        </div>

        {/* Min Sqft */}
        <div>
          <label className="section-header text-xs text-on-surface-variant block mb-1">Min Sqft</label>
          <input
            type="number"
            placeholder="Any"
            value={draftFilters.minSqft || ''}
            onChange={(e) => updateDraft('minSqft', Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
            className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
          />
        </div>

        {/* Bookmarks toggle */}
        <button
          onClick={() => updateDraft('bookmarksOnly', !draftFilters.bookmarksOnly)}
          className={`w-full flex items-center justify-between px-3 py-2 border text-xs font-mono ${
            draftFilters.bookmarksOnly
              ? 'border-primary text-primary bg-primary/10'
              : 'border-outline text-on-surface-variant hover:border-on-surface-variant'
          }`}
        >
          <span className="flex items-center gap-2">
            <Bookmark size={12} fill={draftFilters.bookmarksOnly ? 'currentColor' : 'none'} />
            Only bookmarked
          </span>
        </button>

        {/* More Options */}
        <button
          onClick={() => setMoreOptions(!moreOptions)}
          className="text-xs text-primary hover:text-on-surface"
        >
          {moreOptions ? '− Less Options' : '+ More Options'}
        </button>
        {moreOptions && (
          <div className="space-y-3 border-t border-outline/30 pt-3">
            {/* Year Built */}
            <div>
              <label className="section-header text-xs text-on-surface-variant block mb-1">Year Built</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={draftFilters.yearMin || ''}
                  onChange={(e) => updateDraft('yearMin', Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
                  className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
                />
                <span className="text-on-surface-variant text-sm">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={draftFilters.yearMax || ''}
                  onChange={(e) => updateDraft('yearMax', Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
                  className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
                />
              </div>
            </div>

            {/* Min Lot Size */}
            <div>
              <label className="section-header text-xs text-on-surface-variant block mb-1">Min Lot (sqft)</label>
              <input
                type="number"
                placeholder="Any"
                value={draftFilters.minLotSqft || ''}
                onChange={(e) => updateDraft('minLotSqft', Number(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
                className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
              />
            </div>

            {/* HOA: max + presence */}
            <div>
              <label className="section-header text-xs text-on-surface-variant block mb-1">HOA</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Max $/mo"
                  value={draftFilters.maxHoa || ''}
                  onChange={(e) => updateDraft('maxHoa', Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitFilters(); }}
                  disabled={draftFilters.hasHoa === 'no'}
                  className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant disabled:opacity-40"
                />
                <select
                  value={draftFilters.hasHoa}
                  onChange={(e) => updateDraft('hasHoa', e.target.value as Filters['hasHoa'])}
                  className="bg-surface-container-lowest border border-outline text-xs px-2 py-2 text-on-surface focus:border-primary focus:outline-none"
                >
                  <option value="any">Any</option>
                  <option value="yes">Has HOA</option>
                  <option value="no">No HOA</option>
                </select>
              </div>
            </div>

            {/* Max Days on Market */}
            <div>
              <label className="section-header text-xs text-on-surface-variant block mb-1">Max Days on Market</label>
              <select
                value={draftFilters.maxDom}
                onChange={(e) => updateDraft('maxDom', Number(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
              >
                <option value={0}>Any</option>
                <option value={7}>≤ 7 days</option>
                <option value={14}>≤ 14 days</option>
                <option value={30}>≤ 30 days</option>
                <option value={60}>≤ 60 days</option>
              </select>
            </div>
          </div>
        )}

        {/* Apply (Go) button — commits draft to parent. Disabled when no
            pending edits, so it visually reflects whether there's work to do. */}
        <button
          onClick={commitFilters}

          className="w-full h-9 text-xs font-bold uppercase tracking-wider border border-primary text-primary hover:bg-primary hover:text-on-primary disabled:border-outline disabled:text-on-surface-variant disabled:hover:bg-transparent disabled:hover:text-on-surface-variant disabled:cursor-not-allowed"
        >
          {'Apply Filters'}
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-outline/50 my-3" />

      {/* Section Navigation */}
      <div className="space-y-2">
        <button
          onClick={() => setSection('isochrones')}
          className="w-full flex items-center justify-between p-3 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <div className="flex items-center gap-3">
            <MapPin size={16} />
            <span className="text-sm">Isochrones</span>
          </div>
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setSection('scoring')}
          className="w-full flex items-center justify-between p-3 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={16} />
            <span className="text-sm">Scoring</span>
          </div>
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setSection('budget')}
          className="w-full flex items-center justify-between p-3 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <div className="flex items-center gap-3">
            <DollarSign size={16} />
            <span className="text-sm">Budget & Loan</span>
          </div>
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setSection('priceTrends')}
          className="w-full flex items-center justify-between p-3 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <div className="flex items-center gap-3">
            <TrendingUp size={16} />
            <span className="text-sm">Price Trends</span>
          </div>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
