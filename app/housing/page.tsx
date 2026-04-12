'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  minBaths: number;
  minSqft: number;
  // Multi-select. Empty array = no filter (all types). Values match the
  // RentCast `propertyType` strings stored in metadata: "Single Family",
  // "Condo", "Townhouse", "Multi-Family", "Land", "Manufactured".
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

const DEFAULT_WEIGHTS: ScoringWeights = {
  crime: 9,
  schools: 5,
  commute_work: 7,
  commute_downtown: 6,
  walkability: 2,
  income: 5,
  price: 8,
};

// Stale-cache threshold: refresh listings if the newest cached row was
// last seen more than this many days ago. The cooldown protection
// (server-side) prevents loops if a refresh fails.
const LISTINGS_STALE_DAYS = 7;

// Map legacy "tier" strings to numeric credit scores so any existing
// `housing.credit_score_tier` pref from the old string-dropdown migrates
// cleanly to the numeric `housing.credit_score`.
const TIER_TO_SCORE: Record<string, number> = {
  excellent: 780,
  good: 740,
  fair: 700,
  poor: 660,
};

export default function HousingPage() {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodScore[]>([]);
  const [listings, setListings] = useState<ListingData[]>([]);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [filters, setFilters] = useState<Filters>({
    priceMin: 0,
    priceMax: 0,
    minBeds: 0,
    minBaths: 0,
    minSqft: 0,
    propertyTypes: [],
    bookmarksOnly: false,
    maxDom: 0,
    yearMin: 0,
    yearMax: 0,
    minLotSqft: 0,
    maxHoa: 0,
    hasHoa: 'any',
  });
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

  // Round 4: zip-code price trend heat map. Both pieces of state live here
  // (the lowest common ancestor of HousingMap and LeftPanel) so they can be
  // read by both children. The heat map renders in HousingMap; the period
  // selector lives in a new "Price Trends" section in LeftPanel.
  // Default: visible, period = 12 months.
  const [showPriceTrends, setShowPriceTrends] = useState(true);
  const [priceTrendMonths, setPriceTrendMonths] = useState(12);

  // Only fetch isochrones on explicit trigger (Go button or initial load)
  useEffect(() => {
    async function fetchIsochrones() {
      const addressesWithCoords = isoAddresses.filter((a) => a.lat !== 0 && a.lng !== 0);
      if (addressesWithCoords.length === 0) return;

      setIsoLoading(true);
      try {
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
      } finally {
        // Always clear the loading flag — otherwise an unexpected throw
        // strands the overlay forever, which used to block pin clicks.
        setIsoLoading(false);
      }
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

  // Housing-module preferences
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [creditScore, setCreditScore] = useState(780);
  const [city, setCity] = useState('Austin');
  const [stateCode, setStateCode] = useState('TX');
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((prefs) => {
        if (prefs['housing.down_payment_pct']) setDownPaymentPct(Number(prefs['housing.down_payment_pct']));
        if (prefs['housing.credit_score']) {
          setCreditScore(Number(prefs['housing.credit_score']));
        } else if (prefs['housing.credit_score_tier']) {
          // Legacy: migrate string tier → number on first read.
          const mapped = TIER_TO_SCORE[prefs['housing.credit_score_tier']] ?? 780;
          setCreditScore(mapped);
        }
        if (prefs['housing.city']) setCity(prefs['housing.city']);
        if (prefs['housing.state']) setStateCode(prefs['housing.state']);
        if (prefs['housing.scoring_weights']) {
          try { setWeights(JSON.parse(prefs['housing.scoring_weights'])); } catch { /* defaults */ }
        }
      })
      .catch(() => {});
  }, []);

  // Persist housing prefs whenever they change.
  async function savePref(key: string, value: string | number) {
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: String(value) }),
    });
  }

  // Refresh Bankrate rates with the user's current Budget & Loan values.
  // Bankrate is free (no MPP), so this is safe to invoke from a button
  // without spend gating. Defaults the home value to Austin median ($540k)
  // since we don't have a specific listing context here.
  async function refreshRates() {
    const homeValue = 540000;
    const downPayment = Math.round((homeValue * downPaymentPct) / 100);
    const params = new URLSearchParams({
      refresh: 'true',
      purchasePrice: String(homeValue),
      downPayment: String(downPayment),
      creditScore: String(creditScore),
      zipCode: '78757',
    });
    const res = await fetch(`/api/housing/rates?${params}`);
    if (res.ok) {
      const r = await res.json();
      if (Array.isArray(r)) setRates(r);
      setRatesUpdatedAt(new Date().toISOString());
    }
  }

  // Build the listings query params from current filters. Used by both
  // the per-zip loop and the single zipless bookmarks call.
  function buildFilterParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.priceMin) params.set('minPrice', String(filters.priceMin));
    if (filters.priceMax) params.set('maxPrice', String(filters.priceMax));
    if (filters.minBeds) params.set('minBeds', String(filters.minBeds));
    if (filters.minBaths) params.set('minBaths', String(filters.minBaths));
    if (filters.minSqft) params.set('minSqft', String(filters.minSqft));
    if (filters.maxDom) params.set('maxDom', String(filters.maxDom));
    if (filters.yearMin) params.set('yearMin', String(filters.yearMin));
    if (filters.yearMax) params.set('yearMax', String(filters.yearMax));
    if (filters.minLotSqft) params.set('minLotSqft', String(filters.minLotSqft));
    if (filters.maxHoa) params.set('maxHoa', String(filters.maxHoa));
    if (filters.hasHoa !== 'any') params.set('hasHoa', filters.hasHoa);
    if (filters.propertyTypes.length > 0) params.set('propertyTypes', filters.propertyTypes.join(','));
    return params;
  }

  // Listings: re-runs whenever filters change. When bookmarksOnly is on,
  // we issue a single locationless request so bookmarks anywhere in the
  // cache are reachable. Otherwise we issue a single city+state query.
  const loadListings = useCallback(async () => {
    const params = buildFilterParams();
    if (filters.bookmarksOnly) {
      params.set('bookmarksOnly', 'true');
    } else {
      params.set('city', city);
      params.set('state', stateCode);
    }
    const res = await fetch(`/api/housing/listings?${params}`);
    if (res.ok) setListings(await res.json());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, city, stateCode]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  // Auto-refresh on stale cache. On mount (and when the configured city
  // changes), check listings-meta to see if we have fresh data. If not,
  // POST to refresh-listings — server enforces the cooldown so this is
  // safe to call on every reload. After the refresh resolves (or skips),
  // re-run loadListings to pick up the new data.
  const [refreshStatus, setRefreshStatus] = useState<{
    active: boolean;
    message: string | null;
  }>({ active: false, message: null });
  const refreshTriggeredRef = useRef(false);

  useEffect(() => {
    if (refreshTriggeredRef.current) return;
    if (!city || !stateCode) return;
    refreshTriggeredRef.current = true;

    (async () => {
      try {
        const metaRes = await fetch(
          `/api/housing/listings-meta?city=${encodeURIComponent(city)}&state=${encodeURIComponent(stateCode)}`
        );
        if (!metaRes.ok) return;
        const meta = (await metaRes.json()) as {
          rowCount: number;
          newestLastSeen: string | null;
        };

        // Decide: stale?
        const staleMs = LISTINGS_STALE_DAYS * 24 * 60 * 60 * 1000;
        let isStale = false;
        if (meta.rowCount === 0) {
          isStale = true;
        } else if (meta.newestLastSeen) {
          // SQLite returns 'YYYY-MM-DD HH:MM:SS' (UTC, no TZ designator).
          // Append Z to force UTC parsing — otherwise it's read as local.
          const newestMs = new Date(meta.newestLastSeen.replace(' ', 'T') + 'Z').getTime();
          isStale = Date.now() - newestMs > staleMs;
        }

        if (!isStale) return;

        setRefreshStatus({
          active: true,
          message: `Refreshing listings for ${city}, ${stateCode}…`,
        });

        const refreshRes = await fetch('/api/housing/refresh-listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, state: stateCode }),
        });
        const refreshData = await refreshRes.json();

        if (refreshData.skipped) {
          if (refreshData.skippedReason === 'cooldown') {
            const m = refreshData.cooldownMinutesRemaining;
            setRefreshStatus({
              active: false,
              message: `Auto-refresh paused — last attempt ${60 - m}m ago. Retry in ${m}m.`,
            });
          } else {
            setRefreshStatus({ active: false, message: null });
          }
        } else if (refreshData.error) {
          setRefreshStatus({
            active: false,
            message: `Refresh failed: ${refreshData.detail ?? refreshData.error}`,
          });
        } else {
          const truncatedNote = refreshData.truncated
            ? ' (more results exist beyond the safety cap)'
            : '';
          setRefreshStatus({
            active: false,
            message: `Refreshed ${refreshData.fetched.toLocaleString()} listings across ${refreshData.pages} pages for $${refreshData.cost.toFixed(3)}${truncatedNote}`,
          });
          // Auto-clear the success toast after 6 seconds.
          setTimeout(() => setRefreshStatus({ active: false, message: null }), 6000);
          // Reload listings to pick up the new rows.
          loadListings();
        }
      } catch (err) {
        setRefreshStatus({
          active: false,
          message: `Refresh error: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, stateCode]);

  // Static-ish data: scores + predictions. Loaded once on mount.
  // Doesn't need to re-run when filters change.
  useEffect(() => {
    fetch('/api/housing/scores')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setNeighborhoods(data); })
      .catch(() => {});
    fetch('/api/housing/predictions')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPrediction(data); })
      .catch(() => {});
  }, []);

  // Initial rates load: fires once after prefs have loaded so the first
  // Bankrate call uses the user's actual credit score (not the API's
  // default of 780). Subsequent rate refreshes happen via the Apply
  // button in Budget & Loan, never automatically.
  const ratesLoadedRef = useRef(false);
  useEffect(() => {
    if (ratesLoadedRef.current) return;
    if (creditScore === 0) return; // prefs haven't loaded yet
    ratesLoadedRef.current = true;
    refreshRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditScore]);

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
    .slice(0, 10);

  return (
    <div className="h-[calc(100vh-3.5rem-4rem)] flex flex-col">
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
        <div className="relative border-r border-outline overflow-hidden">
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
            <div className="h-full relative overflow-hidden">
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
                creditScore={creditScore}
                city={city}
                stateCode={stateCode}
                ratesUpdatedAt={ratesUpdatedAt}
                onCreditScoreChange={(v) => { setCreditScore(v); savePref('housing.credit_score', v); }}
                onCityChange={(v) => { setCity(v); savePref('housing.city', v); }}
                onStateChange={(v) => { setStateCode(v); savePref('housing.state', v); }}
                onRefreshRates={refreshRates}
                isochroneAddresses={isoAddresses}
                onIsochroneAddressesChange={setIsoAddresses}
                onIsochroneSubmit={triggerIsochroneFetch}
                priceTrendMonths={priceTrendMonths}
                onPriceTrendMonthsChange={setPriceTrendMonths}
              />
            </div>
          )}
        </div>

        {/* Map */}
        <div className="relative overflow-hidden">
          <HousingMap
            listings={listings}
            isochroneAddresses={isoAddresses}
            isoPolygons={isoPolygons}
            isoIntersection={isoIntersection}
            onListingClick={setSelectedListingId}
            showPriceTrends={showPriceTrends}
            onShowPriceTrendsChange={setShowPriceTrends}
            priceTrendMonths={priceTrendMonths}
          />
          {/* Refresh status banner — floats above the map, centered top.
              Active state shows a pill with the in-flight message; inactive
              with a non-null message acts as a transient toast. */}
          {refreshStatus.message && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none">
              <div
                className={`px-4 py-2 border text-xs font-mono shadow-lg ${
                  refreshStatus.active
                    ? 'bg-surface-container border-primary text-primary'
                    : 'bg-surface-container border-outline text-on-surface'
                }`}
              >
                {refreshStatus.active && (
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse mr-2 align-middle" />
                )}
                {refreshStatus.message}
              </div>
            </div>
          )}
          {isoLoading && (
            // pointer-events-none on the wrapper so the loading indicator
            // doesn't block pin clicks while isochrones are still fetching
            // (Valhalla can take 10+ seconds and used to silently swallow
            // every click on the map underneath).
            <div className="absolute inset-0 z-[2000] flex items-center justify-center pointer-events-none">
              <div className="bg-surface-container border border-outline px-8 py-4 text-on-surface text-sm shadow-lg">
                Loading isochrones…
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
