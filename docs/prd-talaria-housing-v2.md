# Talaria Housing Module — Product Requirements Document

## Overview

The Housing module is a real estate analysis tool for a first-time home buyer. It combines neighborhood scoring, live mortgage rates, prediction market data (Fed rate probabilities), market trend tracking, and individual listing analysis into a single map-centric interface. The user configures their city, target zip codes, and commute addresses in the module's settings — the tool is not hardcoded to any specific metro area.

**Depends on:** Talaria Shell (must be built first)

**Visual Reference:** Housing Tool screen from Stitch mockups — three-column layout with controls on the left, a map in the center, and market data panels on the right.

---

## MPP Service Dependencies

| Service | What It Provides | Approx Cost/Call | Refresh Cadence |
|---------|-----------------|------------------|-----------------|
| RentCast | Property listings, market stats, AVM valuations, tax data | $0.01-0.05 | Daily (listings), Weekly (stats) |
| Mapbox | Isochrone computation, geocoding | $0.005-0.01 | Cache indefinitely per query |
| Polymarket | Fed rate prediction odds (free upstream) | $0.00 (free API) | On-demand, cache 15 min |
| Kalshi | Fed rate prediction odds (free upstream) | $0.00 (free API) | On-demand, cache 15 min |

**Bankrate mortgage rates** are fetched via a custom-built scraper (direct HTTP, no MPP, no cost). Not listed above because it's not an MPP service.

**Note on RentCast listing coverage:** RentCast's 140M+ property records are strong for market stats, valuations, and property details. For-sale listing coverage may be less complete than Zillow or Redfin, which have deeper MLS partnerships. The tool links directly to Zillow/Redfin from listing detail cards so the user always has access to the most complete listing data. If RentCast listings prove too thin for a given market, we can supplement by adding a Zillow scraper or exploring MLS aggregator APIs in a future iteration.

**Estimated daily cost if used once per day:** $0.05 - $0.15

---

## Database Tables (Housing-specific)

These tables are created via the Shell's migration system when the Housing module registers itself.

```sql
-- Cached market statistics by zip code
CREATE TABLE housing_market_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zip TEXT NOT NULL,
  date TEXT NOT NULL,
  median_price REAL,
  median_ppsf REAL,              -- price per sq ft
  active_listings INTEGER,
  sold_count INTEGER,
  median_dom INTEGER,            -- days on market
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(zip, date)
);

-- Individual property listings
CREATE TABLE housing_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  zip TEXT NOT NULL,
  price REAL NOT NULL,
  beds INTEGER,
  baths REAL,
  sqft INTEGER,
  lot_sqft INTEGER,
  year_built INTEGER,
  hoa_monthly REAL DEFAULT 0,
  tax_annual REAL,               -- from TCAD/RentCast
  listing_url TEXT,              -- Zillow/Redfin link
  days_on_market INTEGER,
  status TEXT DEFAULT 'active',  -- 'active', 'pending', 'sold', 'delisted'
  latitude REAL,
  longitude REAL,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  deal_score REAL,               -- computed composite score 0-100
  monthly_cost REAL,             -- computed estimated total monthly payment
  metadata TEXT,                 -- JSON blob for additional fields
  UNIQUE(address, zip)
);

CREATE INDEX idx_listings_zip ON housing_listings(zip);
CREATE INDEX idx_listings_deal_score ON housing_listings(deal_score);

-- Mortgage rate snapshots
CREATE TABLE housing_mortgage_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  product TEXT NOT NULL,          -- '30yr_fixed', '15yr_fixed', '30yr_fha', etc.
  rate REAL NOT NULL,             -- interest rate (e.g., 5.98)
  apr REAL,                       -- APR if available
  loan_amount REAL,              -- the loan amount this rate applies to
  source TEXT DEFAULT 'bankrate', -- 'bankrate', 'pmms'
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, product, loan_amount)
);

-- Fed rate prediction snapshots
CREATE TABLE housing_fed_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  meeting_date TEXT NOT NULL,     -- next FOMC meeting date
  cut_prob REAL,                  -- probability of rate cut (0-1)
  hold_prob REAL,                 -- probability of hold
  hike_prob REAL,                 -- probability of hike
  source TEXT NOT NULL,           -- 'polymarket', 'kalshi', 'combined'
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Neighborhood data (walkability, crime, schools, income)
CREATE TABLE housing_neighborhoods (
  zip TEXT PRIMARY KEY,
  walk_score REAL,
  crime_index REAL,              -- normalized 0-10, higher = safer
  school_rating REAL,            -- normalized 0-10
  median_income REAL,
  commute_jollyville_min REAL,   -- drive time in minutes
  commute_downtown_min REAL,     -- drive time in minutes
  composite_score REAL,          -- computed weighted score
  polygon_geojson TEXT,          -- GeoJSON for map rendering
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tracked homes (user's watchlist)
CREATE TABLE housing_tracked (
  listing_id INTEGER PRIMARY KEY REFERENCES housing_listings(id),
  tracked_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);
```

### Housing Module Preferences

Stored in the Shell's `user_preferences` table with `housing.` prefix:

```
housing.target_zips       → ["78745", "78704", "78749", "78748", "78731"]
housing.scoring_weights   → {"crime": 9, "schools": 5, "commute_work": 7, "commute_downtown": 6, "walkability": 2, "income": 5, "price": 8}
housing.work_address      → {"lat": 30.4441, "lng": -97.7584, "label": "Visa Jollyville"}
housing.downtown_address  → {"lat": 30.2672, "lng": -97.7431, "label": "Downtown Austin"}
housing.alert_min_score   → 85
housing.max_price         → 550000
```

These are configurable from the Housing module's left panel (My Profile section and a settings gear within the module).

---

## Data Flow Architecture

### On Module Load (user navigates to /housing)

```
1. Check freshness of cached data
   ├── Market stats: stale if oldest target zip was fetched >7 days ago
   ├── Listings: stale if fetched >24 hours ago
   ├── Rates: stale if fetched >12 hours ago
   ├── Fed predictions: stale if fetched >15 minutes ago
   └── Neighborhoods: stale if fetched >30 days ago

2. If stale, show banner: "Data last refreshed [X ago]. Refresh?"
   └── User clicks Refresh Data button

3. Refresh sequence (on button click):
   a. Fetch mortgage rates (custom Bankrate scraper, no MPP cost) → cache in DB
   b. Fetch market stats per target zip (RentCast)          → log mpp_transaction per zip
   c. Fetch active listings per target zip (RentCast)       → log mpp_transaction per zip
   d. Fetch Fed predictions (Polymarket + Kalshi APIs)      → log mpp_transaction (free)
   e. Compute deal scores for all listings
   f. Update UI with fresh data
   g. Total cost indicator updates in real time during this sequence
```

### Bankrate Rate Scraper

**File:** `lib/modules/housing/bankrate.ts`

This is a custom scraper — a direct HTTP request to Bankrate, parsed server-side. No MPP service, no external dependency, zero cost per call.

```typescript
export async function fetchBankrateRates(params: {
  homeValue: number;
  downPayment: number;
  loanTerm: 30 | 15;
  creditScore: 'excellent' | 'good' | 'fair';
  zipCode: string;
  loanType: 'conventional' | 'fha' | 'va';
}): Promise<MortgageRate[]>
```

Implementation: Make an HTTP GET to Bankrate's rate table page with the appropriate query parameters. Parse the HTML response to extract lender names, rates, and APRs. This runs server-side (Next.js API route) so there's no CORS issue.

The scraper should be resilient to HTML structure changes — extract data from the structured portions of the page (tables, data attributes) and fail gracefully with a logged error if the structure changes.

**No MPP cost** — this is a direct HTTP request with no payment involved. Do not log an mpp_transaction for Bankrate calls.

### RentCast Integration

**File:** `lib/modules/housing/rentcast.ts`

RentCast is accessed via MPP (Tempo wallet pays per request).

```typescript
export async function fetchMarketStats(zip: string): Promise<MarketStats>
export async function fetchListings(zip: string, filters?: ListingFilters): Promise<Listing[]>
export async function fetchPropertyDetails(address: string): Promise<PropertyDetails>
```

Each call:
1. Constructs the RentCast API URL
2. Makes the request via Tempo (either `tempo request` CLI shelling out, or direct HTTP with MPP Payment header)
3. Logs an `mpp_transaction` with service='RentCast', module='housing', the endpoint path, and the cost
4. Caches the response in the appropriate SQLite table
5. Returns the data

### Polymarket / Kalshi Integration

**File:** `lib/modules/housing/predictions.ts`

These are free public APIs — no MPP cost.

```typescript
export async function fetchFedPredictions(): Promise<FedPrediction> {
  // 1. Query Polymarket CLOB API for Fed-related markets
  //    GET https://clob.polymarket.com/markets?tag=fed-rates
  //    Parse out the probability for each outcome
  
  // 2. Query Kalshi API for Fed-related events
  //    GET https://api.elections.kalshi.com/v1/events?series_ticker=FED
  //    Parse out the probability for each outcome
  
  // 3. Combine: average the probabilities from both sources
  //    Return { meetingDate, cutProb, holdProb, hikeProb, source: 'combined' }
  
  // 4. Cache in housing_fed_predictions table
}
```

**No MPP cost** for now. If we later build this as an MPP reseller, the cost would be near-zero.

### Mapbox Isochrones

**File:** `lib/modules/housing/mapbox.ts`

```typescript
export async function fetchIsochrone(params: {
  lat: number;
  lng: number;
  minutes: number;
  mode: 'driving' | 'walking';
}): Promise<GeoJSON.Polygon>
```

Two isochrones are computed based on user-configured addresses stored in `user_preferences`:
1. 30 minutes from the user's work address (`housing.work_address`)
2. 30 minutes from the user's downtown/social center (`housing.downtown_address`)

Defaults for Austin, TX:
- Work: Visa Jollyville office (lat: 30.4441, lng: -97.7584)
- Downtown: downtown Austin (lat: 30.2672, lng: -97.7431)

These addresses are set in the Housing module's settings panel (accessible from the left panel). When the user changes city, they update these two addresses and the isochrones recompute.

These are fetched once per address pair and cached indefinitely (commute times don't change). Stored in `user_preferences` as GeoJSON. MPP cost: one-time ~$0.01-0.02.

---

## Neighborhood Scoring Algorithm

**File:** `lib/modules/housing/scoring.ts`

### Data Sources for Scoring

| Dimension | Source | How to Get |
|-----------|--------|-----------|
| Crime safety | Local police open data (e.g., Austin PD) | Free, direct HTTP, no MPP. Varies by city — most major metros publish crime CSVs |
| School quality | GreatSchools API (free tier) | Free, API key required. Or scrape niche.com school ratings |
| Commute to Jollyville | Mapbox Directions API via MPP | One-time per zip centroid, cache forever |
| Commute to Downtown | Mapbox Directions API via MPP | One-time per zip centroid, cache forever |
| Walkability | Walk Score API (free tier) | Free, API key required. One call per zip, cache 30 days |
| Median household income | Census ACS data | Free, direct HTTP from census.gov API. Cache 1 year |
| Price | RentCast market stats | Already fetched for market trends |

### Scoring Computation

```typescript
interface ScoringWeights {
  crime: number;        // 0-10, user-configurable
  schools: number;
  commute_work: number;
  commute_downtown: number;
  walkability: number;
  income: number;
  price: number;
}

function computeNeighborhoodScore(
  neighborhood: NeighborhoodData,
  weights: ScoringWeights,
  allNeighborhoods: NeighborhoodData[]  // for normalization
): number {
  // 1. Normalize each dimension to 0-1 across all neighborhoods
  //    e.g., crime: safest zip = 1.0, least safe = 0.0
  //    For commute: shortest = 1.0, longest = 0.0
  //    For price: cheapest = 1.0, most expensive = 0.0 (inverted)
  
  // 2. Apply weights: sum(normalized_i * weight_i) / sum(weights)
  
  // 3. Scale to 0-100
  
  return compositeScore;
}
```

When the user drags a scoring slider on the left panel, the weights update in React state, `computeNeighborhoodScore` runs for all neighborhoods, and the map polygon colors update in real time. No API calls needed — all data is already cached locally.

### Deal Score for Individual Listings

```typescript
function computeDealScore(
  listing: Listing,
  neighborhoodScore: number,
  zipMedianPrice: number,
  zipMedianDom: number,
  userBudget: number,
  currentRate: number
): number {
  // Components:
  // 1. Neighborhood fit (40%): the neighborhood's composite score
  // 2. Price value (30%): how far below zip median (price / zipMedianPrice, inverted)
  // 3. Market timing (15%): days on market vs avg (longer = more negotiable)
  // 4. Budget fit (15%): how far below user's max budget

  // Weighted sum, scaled to 0-100
  return dealScore;
}
```

---

## Mortgage Calculator

**File:** `lib/modules/housing/mortgage.ts`

```typescript
interface MortgageCostBreakdown {
  principal_interest: number;     // monthly P&I
  property_tax: number;           // monthly (annual / 12)
  insurance: number;              // monthly (estimated or override)
  hoa: number;                    // monthly (from listing or user override)
  pmi: number;                    // monthly (if down payment < 20%)
  total_monthly: number;          // sum of all
  total_interest_lifetime: number; // total interest over loan term
  total_payments_lifetime: number; // total of all payments over loan term
}

export function calculateMortgage(params: {
  homePrice: number;
  downPaymentPct: number;
  interestRate: number;         // annual rate as decimal (5.98 → 0.0598)
  loanTermYears: number;
  annualPropertyTax: number;
  annualInsurance?: number;     // default: homePrice * 0.006
  monthlyHoa?: number;          // default: 0
}): MortgageCostBreakdown
```

The calculator is pure math — no API calls. It uses:
- Standard amortization formula for P&I: `M = P * [r(1+r)^n] / [(1+r)^n - 1]`
- PMI: 0.5% of loan amount annually, only if down payment < 20%
- Property tax: from RentCast data (tax_annual field) or estimated at 1.95% of home value for Travis County
- Insurance: estimated at 0.6% of home value annually, user-overridable
- HOA: from listing data or user-overridable (defaults to $0)

### Rate Sensitivity

```typescript
export function rateSensitivity(params: {
  homePrice: number;
  downPaymentPct: number;
  currentRate: number;
  loanTermYears: number;
  annualPropertyTax: number;
}): Array<{ rateChange: number; monthlyPayment: number }>
```

Returns monthly payments at current rate, ±0.25%, and ±0.50%. Displayed in the Rate Watch panel and in the Listing Detail Drawer.

---

## UI Components

### Housing Page Layout

**File:** `app/housing/page.tsx`

Three-column CSS grid: `grid-cols-[280px_1fr_320px]` (left fixed, center flexible, right fixed). Full height below top bar.

### Left Panel

**File:** `components/modules/housing/LeftPanel.tsx`

Scrollable column containing collapsible sections:

1. **MyProfile** — reads from `user_preferences`, shows budget, loan structure, down payment slider, credit score badge
2. **NeighborhoodScoring** — renders weight sliders, updates React state on change, triggers map re-render
3. **Filters** — min sqft, beds dropdown, days on market dropdown, property type toggles
4. **RefreshButton** — "Refresh Data" outlined button, triggers the data refresh sequence

### Map Component

**File:** `components/modules/housing/HousingMap.tsx`

Uses Mapbox GL JS (via `react-map-gl` or direct integration).

**Map layers:**
1. Base layer: Mapbox dark style
2. Neighborhood polygons: GeoJSON polygons for each target zip, fill color interpolated from composite score (teal gradient: low opacity for low scores, high opacity/saturation for high scores)
3. Isochrone boundaries: two GeoJSON lines (teal dashed for Jollyville, amber dashed for downtown)
4. Listing pins: GeoJSON points with circle markers. Teal for normal, amber for high-score (85+). Size scales slightly with deal score

**Map controls (floating top-right panel):**
- "Color By" dropdown: switches polygon fill data source between personal score, median price, and estimated monthly cost
- Isochrone toggle
- Polygon toggle

**Interactions:**
- Hover on pin: tooltip with address, price, monthly cost, deal score
- Click on pin: opens Listing Detail Drawer
- Click on polygon: could show neighborhood stats in a tooltip (stretch goal)

### Right Panel

**File:** `components/modules/housing/RightPanel.tsx`

Scrollable column containing stacked data cards:

1. **RateWatch** — hero rate number, rate trend sparkline, APR
2. **FedForecast** — next meeting date, probability bar (cut/hold/hike), rate sensitivity note
3. **MarketTrends** — median price, $/sqft, active listings, avg DOM, trend chart
4. **TopMatches** — top 3-5 listings by deal score, compact cards with grayscale photos (color on hover)

### Listing Detail Drawer

**File:** `components/modules/housing/ListingDrawer.tsx`

A slide-in panel from the right (~400px wide) that overlays the right panel.

**Triggered by:** clicking a listing pin on the map or a listing card in Top Matches.

**Contents (top to bottom):**
1. Close button (X, top-right)
2. Property photo (full color, full width, ~200px tall)
3. Deal score badge overlaid on photo
4. Address + property details (beds/baths/sqft/lot)
5. Days on market with zip average context
6. Listing price (large) + $/sqft with zip median comparison
7. Monthly Cost Breakdown card (P&I, tax, insurance, HOA, PMI, total) — insurance and HOA have edit icons for user override
8. Rate sensitivity (±0.5% scenarios)
9. Neighborhood score summary (compact pills)
10. Action buttons (sticky bottom):
    - "View on Zillow" (external link)
    - "View on Redfin" (external link)
    - "Track This Home" (saves to housing_tracked table)

User overrides for HOA and insurance are saved per-listing in `housing_listings.metadata` as JSON.

---

## Dashboard Metrics (Housing → Shell)

The Housing module registers itself with the Shell and provides dashboard metrics:

```typescript
registerModule({
  id: 'housing',
  name: 'Housing',
  icon: 'Home',
  route: '/housing',
  services: ['RentCast', 'Mapbox', 'Polymarket', 'Kalshi'],
  getDashboardMetrics: async () => {
    const stats = getLatestMarketStats(targetZips);
    const rate = getLatestRate('30yr_fixed');
    const fed = getLatestFedPrediction();
    return {
      primary: {
        label: `${city} Median Price`,  // dynamic from user_preferences.city
        value: formatCurrency(stats.medianPrice),
        trend: `${stats.priceChangePct > 0 ? '↑' : '↓'}${Math.abs(stats.priceChangePct)}%`,
        trendDirection: stats.priceChangePct > 0 ? 'up' : 'down',
        trendPeriod: '90d',
      },
      secondary: [
        { label: 'Best 30yr Rate', value: `${rate.rate}%` },
        { label: 'Fed Cut Prob', value: `${Math.round(fed.cutProb * 100)}%` },
      ],
    };
  },
  getTables: () => [
    // Return all CREATE TABLE SQL statements for housing tables
  ],
});
```

---

## Build Order

**Phase 1 — Data Layer:**
1. Create all housing database tables via Shell migration system
2. Implement Bankrate scraper (`lib/modules/housing/bankrate.ts`)
3. Implement RentCast integration (`lib/modules/housing/rentcast.ts`) — start with mock data if Tempo wallet isn't set up yet
4. Implement Polymarket + Kalshi fetchers (`lib/modules/housing/predictions.ts`)
5. Implement mortgage calculator (`lib/modules/housing/mortgage.ts`)
6. Test all data fetchers independently via Next.js API routes

**Phase 2 — Scoring:**
7. Implement neighborhood scoring algorithm
8. Implement deal score computation
9. Seed neighborhood data for target zips (Walk Score, Census, crime data)
10. Compute and store scores for all cached listings

**Phase 3 — Map:**
11. Set up Mapbox GL JS with dark style
12. Render neighborhood polygons with score-based coloring
13. Compute and cache isochrones for Jollyville and downtown
14. Render listing pins with tooltips
15. Add map controls (color-by dropdown, toggles)

**Phase 4 — UI Panels:**
16. Build left panel (profile, scoring sliders, filters, refresh button)
17. Build right panel (Rate Watch, Fed Forecast, Market Trends, Top Matches)
18. Wire slider changes to real-time map updates
19. Wire Refresh Data button to the data fetch sequence

**Phase 5 — Listing Detail:**
20. Build Listing Detail Drawer
21. Implement monthly cost breakdown with editable HOA/insurance
22. Implement rate sensitivity display
23. Wire action buttons (Zillow/Redfin links, Track This Home)

**Phase 6 — Integration:**
24. Register housing module with Shell
25. Implement getDashboardMetrics
26. Verify full flow: Dashboard card → Housing view → click listing → drawer → back to dashboard
27. Verify cost tracking: every MPP call during refresh appears in the transaction log
