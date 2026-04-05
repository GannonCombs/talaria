'use client';

import type { ScoringWeights } from '@/lib/modules/housing/scoring';

interface LeftPanelProps {
  budget: number;
  downPaymentPct: number;
  loanTermYears: number;
  creditScoreTier: string;
  weights: ScoringWeights;
  onWeightsChange: (weights: ScoringWeights) => void;
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

interface ListingFilters {
  minSqft: number;
  minBeds: number;
  maxDom: number;
}

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
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] text-on-surface-variant w-36 shrink-0 section-header">
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-primary bg-surface-container-highest appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
      />
      <span className="font-mono text-[10px] text-on-surface w-5 text-right">
        {value}
      </span>
    </div>
  );
}

export default function LeftPanel({
  budget,
  downPaymentPct,
  loanTermYears,
  creditScoreTier,
  weights,
  onWeightsChange,
  filters,
  onFiltersChange,
  onRefresh,
  refreshing,
}: LeftPanelProps) {
  function updateWeight(key: keyof ScoringWeights, value: number) {
    onWeightsChange({ ...weights, [key]: value });
  }

  return (
    <div className="h-full overflow-y-auto border-r border-outline bg-background p-4 space-y-5">
      {/* My Profile */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-header text-[10px] text-on-surface-variant">
            My Profile
          </h3>
          <span className="text-[9px] font-bold text-on-primary bg-primary px-2 py-0.5 uppercase tracking-wider">
            {creditScoreTier}
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <span className="text-[9px] text-on-surface-variant section-header block">
              Loan Structure
            </span>
            <span className="font-mono text-xs text-on-surface">
              {loanTermYears}yr Fixed Mortgage
            </span>
          </div>
          <div>
            <span className="text-[9px] text-on-surface-variant section-header block">
              Down Payment
            </span>
            <span className="font-mono text-xs text-on-surface">
              {downPaymentPct}%
            </span>
          </div>
          <div>
            <span className="text-[9px] text-on-surface-variant section-header block">
              Budget Ceiling
            </span>
            <span className="font-mono text-xl font-bold text-on-surface">
              ${budget.toLocaleString()}.00
            </span>
          </div>
        </div>
      </section>

      {/* Neighborhood Scoring */}
      <section>
        <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
          Neighborhood Scoring
        </h3>
        <div className="space-y-0.5">
          <WeightSlider label="Safety / Crime" value={weights.crime} onChange={(v) => updateWeight('crime', v)} />
          <WeightSlider label="School Ranking" value={weights.schools} onChange={(v) => updateWeight('schools', v)} />
          <WeightSlider label="Commute: Jollyville" value={weights.commute_work} onChange={(v) => updateWeight('commute_work', v)} />
          <WeightSlider label="Commute: Downtown" value={weights.commute_downtown} onChange={(v) => updateWeight('commute_downtown', v)} />
          <WeightSlider label="Walkability" value={weights.walkability} onChange={(v) => updateWeight('walkability', v)} />
          <WeightSlider label="Price Optimization" value={weights.price} onChange={(v) => updateWeight('price', v)} />
        </div>
      </section>

      {/* Global Filters */}
      <section>
        <h3 className="section-header text-[10px] text-on-surface-variant mb-3">
          Global Filters
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="section-header text-[9px] text-on-surface-variant block mb-1">
              Min Sqft
            </label>
            <input
              type="number"
              value={filters.minSqft || ''}
              onChange={(e) =>
                onFiltersChange({ ...filters, minSqft: Number(e.target.value) })
              }
              placeholder="1,000"
              className="w-full bg-surface-container-lowest border border-outline text-xs px-2 py-1.5 text-on-surface font-mono focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="section-header text-[9px] text-on-surface-variant block mb-1">
              Beds
            </label>
            <select
              value={filters.minBeds}
              onChange={(e) =>
                onFiltersChange({ ...filters, minBeds: Number(e.target.value) })
              }
              className="w-full bg-surface-container-lowest border border-outline text-xs px-2 py-1.5 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value={0}>Any</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="section-header text-[9px] text-on-surface-variant block mb-1">
            Days on Market
          </label>
          <select
            value={filters.maxDom}
            onChange={(e) =>
              onFiltersChange({ ...filters, maxDom: Number(e.target.value) })
            }
            className="w-full bg-surface-container-lowest border border-outline text-xs px-2 py-1.5 text-on-surface focus:border-primary focus:outline-none"
          >
            <option value={0}>Any</option>
            <option value={7}>≤ 7 days</option>
            <option value={14}>≤ 14 days</option>
            <option value={30}>≤ 30 days</option>
            <option value={60}>≤ 60 days</option>
          </select>
        </div>
      </section>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="w-full h-10 border border-primary text-primary hover:bg-primary hover:text-on-primary text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {refreshing ? 'Refreshing...' : 'Execute Analysis Refresh'}
      </button>
    </div>
  );
}
