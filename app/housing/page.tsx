'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import * as turf from '@turf/turf';
import BackButton from '@/components/layout/BackButton';
import LeftPanel, { type IsochroneAddress } from '@/components/modules/housing/LeftPanel';
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

interface Filters {
  priceMin: number;
  priceMax: number;
  minBeds: number;
  minSqft: number;
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
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodScore[]>([]);
  const [listings, setListings] = useState<ListingData[]>([]);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [filters, setFilters] = useState<Filters>({ priceMin: 0, priceMax: 0, minBeds: 0, minSqft: 0, maxDom: 0 });
  const [rates, setRates] = useState<RateData[]>([]);
  const [prediction, setPrediction] = useState<FedPrediction | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [isoAddresses, setIsoAddresses] = useState<IsochroneAddress[]>([
    { id: '1', label: 'Visa', address: '12301 Research Blvd, Building 3, Austin, TX 78759', lat: 30.4255, lng: -97.7529, color: '#46f1c5', driveMinutes: 30 },
    { id: '2', label: 'Convention Center', address: '500 E Cesar Chavez St, Austin, TX 78701', lat: 30.2624, lng: -97.7409, color: '#fbab29', driveMinutes: 30 },
  ]);
  const [isoPolygons, setIsoPolygons] = useState<Array<{ id: string; color: string; label: string; polygon: [number, number][]; driveMinutes: number }>>([]);
  const [isoLoading, setIsoLoading] = useState(false);
  const [isoFetchTrigger, setIsoFetchTrigger] = useState(0);

  // Only fetch isochrones on explicit trigger (Go button or initial load)
  useEffect(() => {
    async function fetchIsochrones() {
      const addressesWithCoords = isoAddresses.filter((a) => a.lat !== 0 && a.lng !== 0);
      if (addressesWithCoords.length === 0) return;

      setIsoLoading(true);
      const results: typeof isoPolygons = [];
      for (const addr of addressesWithCoords) {
        try {
          const res = await fetch('/api/housing/isochrone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: addr.lat, lng: addr.lng, minutes: addr.driveMinutes }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.polygon) {
              results.push({ id: addr.id, color: addr.color, label: addr.label, polygon: data.polygon, driveMinutes: addr.driveMinutes });
            }
          }
        } catch { /* skip failed */ }
      }
      setIsoPolygons(results);
      setIsoLoading(false);
    }
    fetchIsochrones();
  }, [isoFetchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute intersection of all isochrone polygons
  const isoIntersection = useMemo<[number, number][][] | undefined>(() => {
    if (isoPolygons.length < 2) return undefined;
    try {
      function toTurfRing(polygon: [number, number][]) {
        const coords = polygon.map((p) => [p[1], p[0]] as [number, number]);
        if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
          coords.push([...coords[0]] as [number, number]);
        }
        return coords;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any = turf.polygon([toTurfRing(isoPolygons[0].polygon)]);
      for (let i = 1; i < isoPolygons.length; i++) {
        const next = turf.polygon([toTurfRing(isoPolygons[i].polygon)]);
        const inter = turf.intersect(turf.featureCollection([result, next]));
        if (!inter) return undefined;
        result = inter;
      }

      // Simplify the result to reduce rendering load
      const simplified = turf.simplify(result, { tolerance: 0.002, highQuality: true });
      const geom = simplified.geometry;
      const rings: [number, number][][] = [];

      if (geom.type === 'Polygon') {
        const coords = geom.coordinates[0] as [number, number][];
        rings.push(coords.map((c) => [c[1], c[0]] as [number, number]));
      } else if (geom.type === 'MultiPolygon') {
        for (const sub of geom.coordinates) {
          const coords = sub[0] as [number, number][];
          if (coords.length > 3) {
            rings.push(coords.map((c) => [c[1], c[0]] as [number, number]));
          }
        }
      }

      return rings.length > 0 ? rings : undefined;
    } catch {
      return undefined;
    }
  }, [isoPolygons]);

  function triggerIsochroneFetch() {
    setIsoLoading(true);
    setIsoFetchTrigger((t) => t + 1);
  }

  // Preferences
  const [budget, setBudget] = useState(550000);
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [creditScore, setCreditScore] = useState('excellent');

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((prefs) => {
        if (prefs['housing.budget']) setBudget(Number(prefs['housing.budget']));
        if (prefs['housing.down_payment_pct']) setDownPaymentPct(Number(prefs['housing.down_payment_pct']));
        if (prefs['housing.credit_score_tier']) setCreditScore(prefs['housing.credit_score_tier']);
        if (prefs['housing.scoring_weights']) {
          try { setWeights(JSON.parse(prefs['housing.scoring_weights'])); } catch { /* defaults */ }
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    const scoresRes = await fetch('/api/housing/scores');
    if (scoresRes.ok) setNeighborhoods(await scoresRes.json());

    const allListings: ListingData[] = [];
    for (const zip of TARGET_ZIPS) {
      const params = new URLSearchParams({ zip });
      if (filters.priceMin) params.set('minPrice', String(filters.priceMin));
      if (filters.priceMax) params.set('maxPrice', String(filters.priceMax));
      if (filters.minBeds) params.set('minBeds', String(filters.minBeds));
      if (filters.minSqft) params.set('minSqft', String(filters.minSqft));
      if (filters.maxDom) params.set('maxDom', String(filters.maxDom));
      const res = await fetch(`/api/housing/listings?${params}`);
      if (res.ok) allListings.push(...(await res.json()));
    }
    setListings(allListings);

    const rateRes = await fetch('/api/housing/rates?refresh=true');
    if (rateRes.ok) {
      const r = await rateRes.json();
      if (Array.isArray(r)) setRates(r);
    }

    const predRes = await fetch('/api/housing/predictions');
    if (predRes.ok) setPrediction(await predRes.json());
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedListing = listings.find((l) => l.id === selectedListingId) ?? null;
  const selectedNeighborhood = selectedListing
    ? neighborhoods.find((n) => n.zip === selectedListing.zip) ?? null
    : null;

  // Rudimentary "deal" ranking: lowest price-per-square-foot wins.
  // 100% weighted on $/sqft because it's the only signal we have wired
  // up right now (RentCast sale-listings provides price + sqft directly).
  // Replace with the full neighborhood-weighted dealScore once that path
  // is wired.
  const topListings = [...listings]
    .filter((l) => l.sqft != null && l.sqft > 0 && l.price > 0)
    .sort((a, b) => a.price / a.sqft - b.price / b.sqft)
    .slice(0, 3);

  return (
    <div className="h-[calc(100vh-3.5rem-2rem)] flex flex-col">
      {/* Top Bar */}
      <div className="relative flex items-center px-4 py-2 border-b border-outline shrink-0">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-lg font-bold tracking-tight text-on-surface">
            Housing
          </h1>
        </div>
        {/* Listing count — absolute-positioned to mirror the floating
            overlay controls box. Right edge at 336px (320px right panel +
            16px controls margin) and width matches the box, with text-center
            so the count visually centers within imaginary vertical lines
            extended upward from the box walls. */}
        <div
          className="absolute font-mono text-xs text-on-surface-variant text-center"
          style={{ right: '336px', width: '156px' }}
        >
          {listings.length.toLocaleString()} {listings.length === 1 ? 'listing' : 'listings'}
        </div>
      </div>

      {/* Three-column layout */}
      <div className={`flex-1 grid ${leftCollapsed ? 'grid-cols-[auto_1fr_320px]' : 'grid-cols-[260px_1fr_320px]'} overflow-hidden`}>
        {/* Left Panel */}
        <div className="relative border-r border-outline">
          {leftCollapsed ? (
            <div className="h-full flex items-start pt-4 px-1 bg-background">
              <button
                onClick={() => setLeftCollapsed(false)}
                className="p-2 text-on-surface-variant hover:text-on-surface"
              >
                <PanelLeftOpen size={16} />
              </button>
            </div>
          ) : (
            <div className="h-full relative">
              <button
                onClick={() => setLeftCollapsed(true)}
                className="absolute top-3 right-3 z-10 p-1 text-on-surface-variant hover:text-on-surface"
              >
                <PanelLeftClose size={14} />
              </button>
              <LeftPanel
                filters={filters}
                onFiltersChange={setFilters}
                weights={weights}
                onWeightsChange={setWeights}
                budget={budget}
                downPaymentPct={downPaymentPct}
                creditScore={creditScore}
                onBudgetChange={setBudget}
                onDownPaymentChange={setDownPaymentPct}
                onCreditScoreChange={setCreditScore}
                isochroneAddresses={isoAddresses}
                onIsochroneAddressesChange={setIsoAddresses}
                onIsochroneSubmit={triggerIsochroneFetch}
              />
            </div>
          )}
        </div>

        {/* Map */}
        <div className="relative overflow-hidden">
          <HousingMap
            neighborhoods={neighborhoods}
            listings={listings}
            isochroneAddresses={isoAddresses}
            isoPolygons={isoPolygons}
            isoIntersection={isoIntersection}
            onListingClick={setSelectedListingId}
          />
          {isoLoading && (
            <div className="absolute inset-0 z-[2000] bg-background/70 flex items-center justify-center">
              <div className="bg-surface-container border border-outline px-8 py-4 text-on-surface text-sm">
                Please Wait...
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="relative overflow-hidden">
          {selectedListing ? (
            <ListingDrawer
              listing={selectedListing}
              neighborhoodScore={selectedNeighborhood}
              zipMedianPrice={415000}
              zipMedianDom={28}
              downPaymentPct={downPaymentPct}
              loanTermYears={30}
              allRates={rates}
              onClose={() => setSelectedListingId(null)}
            />
          ) : (
            <RightPanel
              rates={rates}
              prediction={prediction}
              topListings={topListings}
              onListingClick={setSelectedListingId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
