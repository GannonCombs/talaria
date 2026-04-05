'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import LeftPanel from '@/components/modules/housing/LeftPanel';
import RightPanel from '@/components/modules/housing/RightPanel';
import ListingDrawer from '@/components/modules/housing/ListingDrawer';
import type { ScoringWeights } from '@/lib/modules/housing/scoring';

const HousingMap = dynamic(
  () => import('@/components/modules/housing/HousingMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-surface flex items-center justify-center text-on-surface-variant text-sm">
        Loading map...
      </div>
    ),
  }
);

interface NeighborhoodScore {
  zip: string;
  compositeScore: number;
  medianPrice: number;
  walkScore: number;
}

interface ListingData {
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

interface RateData {
  rate: number;
  apr: number;
  product: string;
}

interface FedPrediction {
  meetingDate: string;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
}

interface MarketStats {
  medianPrice: number;
  medianPpsf: number;
  activeListings: number;
  medianDom: number;
}

interface Filters {
  minSqft: number;
  minBeds: number;
  maxDom: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  crime: 9,
  schools: 5,
  commute_work: 7,
  commute_downtown: 6,
  walkability: 2,
  income: 5,
  price: 8,
};

const TARGET_ZIPS = ['78745', '78704', '78749', '78748', '78731'];

export default function HousingPage() {
  // State
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodScore[]>([]);
  const [listings, setListings] = useState<ListingData[]>([]);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [filters, setFilters] = useState<Filters>({ minSqft: 0, minBeds: 0, maxDom: 0 });
  const [rate, setRate] = useState<RateData | null>(null);
  const [prediction, setPrediction] = useState<FedPrediction | null>(null);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);

  // Preferences (read from DB)
  const [budget, setBudget] = useState(550000);
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [creditScoreTier, setCreditScoreTier] = useState('excellent');

  // Load preferences
  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((prefs) => {
        if (prefs['housing.budget']) setBudget(Number(prefs['housing.budget']));
        if (prefs['housing.down_payment_pct']) setDownPaymentPct(Number(prefs['housing.down_payment_pct']));
        if (prefs['housing.loan_term_years']) setLoanTermYears(Number(prefs['housing.loan_term_years']));
        if (prefs['housing.credit_score_tier']) setCreditScoreTier(prefs['housing.credit_score_tier']);
        if (prefs['housing.scoring_weights']) {
          try { setWeights(JSON.parse(prefs['housing.scoring_weights'])); } catch { /* use defaults */ }
        }
      })
      .catch(() => {});
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    // Neighborhoods
    const scoresRes = await fetch('/api/housing/scores');
    if (scoresRes.ok) {
      const data = await scoresRes.json();
      if (data.length === 0 && !seeded) {
        await fetch('/api/housing/seed', { method: 'POST' });
        await fetch('/api/housing/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget, currentRate: 5.98 }),
        });
        setSeeded(true);
        loadData();
        return;
      }
      setNeighborhoods(data);
    }

    // Listings
    const allListings: ListingData[] = [];
    for (const zip of TARGET_ZIPS) {
      const params = new URLSearchParams({ zip });
      if (filters.minSqft) params.set('minSqft', String(filters.minSqft));
      if (filters.minBeds) params.set('minBeds', String(filters.minBeds));
      if (filters.maxDom) params.set('maxDom', String(filters.maxDom));
      const res = await fetch(`/api/housing/listings?${params}`);
      if (res.ok) allListings.push(...(await res.json()));
    }
    setListings(allListings);

    // Rates
    const rateRes = await fetch('/api/housing/rates?product=30yr_fixed');
    if (rateRes.ok) {
      const r = await rateRes.json();
      if (r) setRate(r);
    }

    // Predictions
    const predRes = await fetch('/api/housing/predictions');
    if (predRes.ok) setPrediction(await predRes.json());

    // Market stats (aggregate from first zip)
    const mktRes = await fetch('/api/housing/market?zip=78745');
    if (mktRes.ok) setMarketStats(await mktRes.json());
  }, [budget, filters, seeded]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recompute scores when weights change
  async function recomputeScores(newWeights: ScoringWeights) {
    setWeights(newWeights);
    const currentRate = rate?.rate ?? 5.98;
    await fetch('/api/housing/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights: newWeights, budget, currentRate }),
    });
    // Reload neighborhoods and listings to get updated scores
    const scoresRes = await fetch('/api/housing/scores');
    if (scoresRes.ok) setNeighborhoods(await scoresRes.json());

    const allListings: ListingData[] = [];
    for (const zip of TARGET_ZIPS) {
      const res = await fetch(`/api/housing/listings?zip=${zip}`);
      if (res.ok) allListings.push(...(await res.json()));
    }
    setListings(allListings);
  }

  // Refresh data from external sources
  async function handleRefresh() {
    setRefreshing(true);
    try {
      // Fetch fresh rates
      await fetch(`/api/housing/rates?refresh=true&homeValue=${budget}&downPayment=${budget * downPaymentPct / 100}&creditScore=${creditScoreTier}&zip=78745`);
      // Fetch fresh predictions
      await fetch('/api/housing/predictions');
      // Recompute scores
      await recomputeScores(weights);
      // Reload everything
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  function handleListingClick(id: number) {
    setSelectedListingId(id);
  }

  const selectedListing = listings.find((l) => l.id === selectedListingId) ?? null;
  const selectedNeighborhood = selectedListing
    ? neighborhoods.find((n) => n.zip === selectedListing.zip) ?? null
    : null;
  const selectedZipStats = marketStats; // TODO: per-zip stats lookup

  // Top listings by deal score
  const topListings = [...listings]
    .filter((l) => l.dealScore !== null)
    .sort((a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0))
    .slice(0, 5);

  return (
    <div className="h-[calc(100vh-3.5rem-4rem)] grid grid-cols-[280px_1fr_320px]">
      {/* Left Panel */}
      <LeftPanel
        budget={budget}
        downPaymentPct={downPaymentPct}
        loanTermYears={loanTermYears}
        creditScoreTier={creditScoreTier}
        weights={weights}
        onWeightsChange={recomputeScores}
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Map */}
      <div className="relative overflow-hidden">
        <HousingMap
          neighborhoods={neighborhoods}
          listings={listings}
          onListingClick={handleListingClick}
        />
      </div>

      {/* Right Panel + Drawer overlay */}
      <div className="relative overflow-hidden">
        <RightPanel
          rate={rate}
          prediction={prediction}
          marketStats={marketStats}
          topListings={topListings}
          onListingClick={handleListingClick}
        />

        {/* Listing Detail Drawer */}
        {selectedListing && (
          <ListingDrawer
            listing={selectedListing}
            neighborhoodScore={selectedNeighborhood}
            zipMedianPrice={selectedZipStats?.medianPrice ?? 415000}
            zipMedianDom={selectedZipStats?.medianDom ?? 28}
            currentRate={rate?.rate ?? 5.98}
            downPaymentPct={downPaymentPct}
            loanTermYears={loanTermYears}
            onClose={() => setSelectedListingId(null)}
          />
        )}
      </div>
    </div>
  );
}
