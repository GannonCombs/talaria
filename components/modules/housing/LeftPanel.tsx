'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronRight, MapPin, SlidersHorizontal, DollarSign, Plus, Trash2 } from 'lucide-react';
import type { ScoringWeights } from '@/lib/modules/housing/scoring';

interface Filters {
  priceMin: number;
  priceMax: number;
  minBeds: number;
  minSqft: number;
  maxDom: number;
}

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
  budget: number;
  downPaymentPct: number;
  creditScore: string;
  onBudgetChange: (v: number) => void;
  onDownPaymentChange: (v: number) => void;
  onCreditScoreChange: (v: string) => void;
  isochroneAddresses: IsochroneAddress[];
  onIsochroneAddressesChange: (addrs: IsochroneAddress[]) => void;
  onIsochroneSubmit: () => void;
}

type SectionView = 'menu' | 'isochrones' | 'scoring' | 'budget';

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-2">
      <div className="flex justify-between mb-1">
        <span className="text-xs text-on-surface-variant">{label}</span>
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
  budget,
  downPaymentPct,
  creditScore,
  onBudgetChange,
  onDownPaymentChange,
  onCreditScoreChange,
  isochroneAddresses,
  onIsochroneAddressesChange,
  onIsochroneSubmit,
}: LeftPanelProps) {
  const [section, setSection] = useState<SectionView>('menu');
  const [moreOptions, setMoreOptions] = useState(false);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    onFiltersChange({ ...filters, [key]: value });
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
          <WeightSlider label="Safety / Crime" value={weights.crime} onChange={(v) => updateWeight('crime', v)} />
          <WeightSlider label="Schools" value={weights.schools} onChange={(v) => updateWeight('schools', v)} />
          <WeightSlider label="Commute: Work" value={weights.commute_work} onChange={(v) => updateWeight('commute_work', v)} />
          <WeightSlider label="Commute: Social" value={weights.commute_downtown} onChange={(v) => updateWeight('commute_downtown', v)} />
          <WeightSlider label="Walkability" value={weights.walkability} onChange={(v) => updateWeight('walkability', v)} />
          <WeightSlider label="Price Value" value={weights.price} onChange={(v) => updateWeight('price', v)} />
          <WeightSlider label="AVM (Underpriced)" value={weights.income} onChange={(v) => updateWeight('income', v)} />
        </div>
        <div className="text-[10px] text-on-surface-variant mt-4">
          AVM compares listing price to estimated market value. Flood risk is factored in automatically when the flood zone overlay is enabled.
        </div>
      </div>
    );
  }

  // ── Section: Budget & Loan ──
  if (section === 'budget') {
    return (
      <div className="h-full overflow-y-auto border-r border-outline bg-background p-4">
        <button onClick={() => setSection('menu')} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4">
          <ArrowLeft size={16} />
          <span className="text-xs">Back</span>
        </button>
        <h3 className="section-header text-xs text-on-surface mb-4">Budget & Loan</h3>
        <div className="space-y-4">
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Budget</label>
            <div className="flex items-center gap-1">
              <span className="text-on-surface-variant text-sm">$</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => onBudgetChange(Number(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Down Payment</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={downPaymentPct}
                onChange={(e) => onDownPaymentChange(Number(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none"
              />
              <span className="text-on-surface-variant text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Credit Score</label>
            <select
              value={creditScore}
              onChange={(e) => onCreditScoreChange(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="excellent">780+ (Excellent)</option>
              <option value="good">740-779 (Good)</option>
              <option value="fair">670-739 (Fair)</option>
              <option value="poor">580-669 (Poor)</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ── Default: Filters + Section Menu ──
  return (
    <div className="h-full overflow-y-auto border-r border-outline bg-background p-5 flex flex-col">
      {/* Filters */}
      <div className="space-y-4 mb-5">
        <h3 className="section-header text-xs text-on-surface-variant">Filters</h3>

        {/* Price Range */}
        <div>
          <label className="section-header text-xs text-on-surface-variant block mb-1">Price Range</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.priceMin || ''}
              onChange={(e) => updateFilter('priceMin', Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
            <span className="text-on-surface-variant text-sm">–</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.priceMax || ''}
              onChange={(e) => updateFilter('priceMax', Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
          </div>
        </div>

        {/* Beds + Sqft */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Beds</label>
            <select
              value={filters.minBeds}
              onChange={(e) => updateFilter('minBeds', Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value={0}>Any</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
            </select>
          </div>
          <div>
            <label className="section-header text-xs text-on-surface-variant block mb-1">Min Sqft</label>
            <input
              type="number"
              placeholder="Any"
              value={filters.minSqft || ''}
              onChange={(e) => updateFilter('minSqft', Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none placeholder:text-on-surface-variant"
            />
          </div>
        </div>

        {/* More Options */}
        <button
          onClick={() => setMoreOptions(!moreOptions)}
          className="text-xs text-primary hover:text-on-surface"
        >
          {moreOptions ? '− Less Options' : '+ More Options'}
        </button>
        {moreOptions && (
          <div className="space-y-3 border-t border-outline/30 pt-3">
            <div>
              <label className="section-header text-xs text-on-surface-variant block mb-1">Max Days on Market</label>
              <select
                value={filters.maxDom}
                onChange={(e) => updateFilter('maxDom', Number(e.target.value))}
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
      </div>
    </div>
  );
}
