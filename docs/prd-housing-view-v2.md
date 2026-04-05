# Housing View — Product Requirements Document v2

## Problem Statement

A first-time home buyer in Austin needs a daily-check dashboard that aggregates housing prices, mortgage rates, neighborhood quality, and market trends in one place. Must cost pennies per day via MPP at most. Must be legitimately useful — not a demo.

---

## Layout

Three columns: left panel + map + right panel. No page scroll. Panels scroll internally.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Housing                                                    [⚙]    │
├──────────┬───────────────────────────────────┬───────────────────────┤
│          │                                   │                       │
│ FILTERS  │                                   │  RATE WATCH           │
│ Price    │                                   │  30yr 5.37%           │
│ [min-max]│                                   │  20yr 5.12%           │
│ Beds [▾] │            MAP                    │  15yr 4.63%           │
│ Sqft [▾] │                                   │  10yr 4.49%           │
│ [More ▾] │  Neighborhoods: red/green         │                       │
│          │  Pins: sized by score             │  FED FORECAST         │
│──────────│  Isochrones: color-coded          │  Hold 98%  Cut 1%    │
│          │  Flood zones: toggleable          │                       │
│ SECTIONS │                                   │  MARKET TRENDS        │
│ > Iso    │                                   │  [sparkline/chart]    │
│ > Score  │                                   │                       │
│ > etc    │                                   │  TOP MATCHES          │
│          │                                   │  ┌─────────────────┐  │
│          │                                   │  │ 1204 Esperanza  │  │
│          │                                   │  │ $432K  Score 91 │  │
│          │                                   │  └─────────────────┘  │
│          │                                   │  ┌─────────────────┐  │
│          │                                   │  │ 7421 Oak Cliff  │  │
│          │                                   │  │ $415K  Score 87 │  │
│          │                                   │  └─────────────────┘  │
└──────────┴───────────────────────────────────┴───────────────────────┘
```

### Top Bar

- Back button + "Housing" (consistent title size with other pages)
- Settings gear (⚙) on far right

### Left Panel — Upper Half: Filters

Always visible. Contains:

- **Price range**: Min/Max with draggable range slider (like Zillow)
- **Beds**: Dropdown (Any, 1+, 2+, 3+, 4+)
- **Min Sqft**: Dropdown or input
- **More Options** (expandable): Pool, AC, garage, year built range, lot size, HOA max — whatever minutiae RentCast supports

Changing any filter re-queries listings and updates map pins + homes list.

### Left Panel — Lower Half: Expandable Sections

Full-panel takeover navigation. Section headers shown as a list. Click one → it fills the panel with a back button at top to return.

Sections:

1. **Isochrones** — Manage commute addresses (1-5). Each has a label, text input (geocoded), and a distinct color. Colors match the map overlay.
2. **Scoring** — Weight sliders for neighborhood quality dimensions (crime, schools, commute, walkability, AVM, flood risk, etc). Changes recompute scores in real time.
3. **Budget & Loan** — Budget, down payment %, credit score.

The left panel is collapsible via a toggle to give the map more room.

Pin size on map scales with deal score (bigger = better). Users find homes by clicking pins or checking Top Matches in the right panel.

### Map

- **Brighter tiles** — increase brightness beyond 1.6x, reference the original housing mockup
- **Neighborhood boundaries**: Real Census tract GeoJSON for Travis County, colored by price trend. Strong green = high appreciation, strong red = decline. Always visible (core feature, not a toggle — but can be turned off).
- **Listing pins**: Sized by deal score. Click → right panel swaps to listing detail.
- **Isochrone overlays**: 1-5 configured addresses, each a distinct color from a fixed palette. Dashed lines on map. Color legend on map.
- **Flood zone overlay**: Toggleable FEMA data. Semi-transparent red.
- **Map controls** (floating top-right): Neighborhood overlay toggle, Isochrone toggle, Flood zone toggle, Period selector (3mo/6mo) for neighborhood coloring.

### Right Panel — Two Modes

**Mode 1: Dashboard (default)**

- **Rate Watch** — 4-term table (30/20/15/10yr). Already built.
- **Fed Forecast** — Polymarket Hold/Cut/Hike probabilities + next FOMC. Title: "Fed Forecast".
- **Market Trends** — Austin median home price over time. Sparkline or small chart. This is the Zillow-style price trend.
- **Top Matches** — 2-3 highest-scored listings within the current map view. Compact cards. Click → listing detail.

**Mode 2: Listing Detail (when a listing is clicked)**

- **Back button** (←) at top to return to dashboard mode
- Address, beds/baths/sqft/lot, year built, days on market
- Price + $/sqft vs neighborhood median
- **AVM valuation** from RentCast (if available) — shows estimated value vs listing price
- **Mortgage Calculator**:
  - Term selector tabs (10/15/20/30yr). Selecting a term recalculates immediately.
  - Shows for selected term: best rate, monthly payment breakdown (P&I, tax, insurance, HOA, PMI), total monthly payment
  - **Headline: Total mortgage interest** over life of loan
  - Down payment amount shown
- Neighborhood score + flood zone status
- [Zillow] [Redfin] [Track] buttons

### Settings (⚙ gear icon)

Opens in the left panel as a full-panel takeover (back button to return).
Contains:

- **Isochrone addresses**: Add/remove 1-5 addresses. Each has a label, text input (geocoded via Mapbox forward geocode at $0.0037), and a color from a fixed palette. Colors match the map overlay.
- **Scoring weights**: Sliders for each dimension. AVM is a scoring category.
- **Budget + Down Payment %**
- **Credit Score**

---

## Data Sources & Costs

### MPP-Paid Services

| Service  | Endpoint                     | Cost    | Use                              |
| -------- | ---------------------------- | ------- | -------------------------------- |
| RentCast | `/rentcast/sale-listings`  | $0.033  | Listing search                   |
| RentCast | `/rentcast/value-estimate` | $0.033  | AVM valuation per listing        |
| RentCast | `/rentcast/markets`        | $0.033  | Market stats per zip             |
| RentCast | `/rentcast/properties`     | $0.033  | Property details                 |
| Mapbox   | `/mapbox/isochrone`        | $0.005  | Drive-time isochrone per address |
| Mapbox   | `/mapbox/geocode-forward`  | $0.0037 | Geocode text address → lat/lng  |

### Free Data

| Data                    | Source                 | Notes                                              |
| ----------------------- | ---------------------- | -------------------------------------------------- |
| Mortgage rates          | Bankrate API (direct)  | Free, personalized, already built                  |
| Fed predictions         | Polymarket Gamma API   | Free, already built                                |
| Census tract boundaries | Census TIGER/Line      | Free GeoJSON download                              |
| Flood zones             | FEMA NFHL              | Free GeoJSON/WMS                                   |
| Austin price history    | Zillow ZHVI CSV        | Free research data download                        |
| Crime data              | Austin PD open data    | Free CSV                                           |
| School ratings          | GreatSchools free tier | Free API with key                                  |
| Isochrone computation   | OSRM public server     | Free but rate-limited. Mapbox at $0.005 if needed. |

### Email Alerts

- **StableEmail via MPP** (`stableemail.dev`) for sending alert emails when high-score listings appear
- Check if free transactional email exists (Resend free tier: 100 emails/day, Mailgun: 100/day)
- Not deferred — implement in an early round

---

## Scoring System

Dimensions (all normalized 0-1, weighted by user sliders):

1. **Crime safety** — Austin PD data
2. **School quality** — GreatSchools
3. **Commute (work)** — drive time from Mapbox/OSRM
4. **Commute (social)** — drive time from Mapbox/OSRM
5. **Walkability** — Walk Score free tier
6. **Income** — Census ACS
7. **Price** — below neighborhood median = better
8. **AVM** — RentCast valuation vs listing price. If AVM > listing price, it's underpriced = higher score.
9. **Flood risk** — FEMA zone. High risk = score penalty.

---

## Build Rounds

### Round 1: Layout + Cleanup + Right Panel

- Three-column layout: left panel + map + right panel
- Left panel upper half: filter inputs (price range slider, beds, sqft, More Options)
- Left panel lower half: expandable sections (Isochrones, Scoring, Budget & Loan) — full-panel takeover on click
- Right panel: Rate Watch, Fed Forecast, Market Trends, Top Matches
- Fix title size, fix scroll, brighter map
- Remove all current slop (My Profile badge, Execute Analysis Refresh, Price Optimization)
- Settings gear opens settings in left panel
- Collapsible left panel

### Round 2: Listing Detail + Mortgage Calculator

- Right panel listing detail with back button
- Mortgage calculator with term selector tabs
- Total interest headline
- AVM display (when data available)
- Zillow/Redfin/Track buttons

### Round 3: Real Neighborhoods + Price Coloring

- Census tract GeoJSON for Travis County
- Price trend coloring (green/red shading by tract)
- 3mo/6mo period toggle
- Zillow ZHVI data for historical Austin prices
- Market Trends chart wired to real data

### Round 4: Isochrone Management + Geocoding

- Settings: add/remove 1-5 addresses with labels and colors
- Geocode via Mapbox forward geocode ($0.0037 per address)
- Real isochrone computation (Mapbox at $0.005 or OSRM free)
- Color-coordinated overlays on map with legend

### Round 5: Flood Zones + Scoring + Alerts

- FEMA flood zone overlay (toggleable)
- Full scoring system with AVM and flood risk
- Email alerts via StableEmail/MPP or free tier (Resend)
- Alert when new listing exceeds score threshold

---

## Cost Estimate (Daily Use)

Assuming 1 search/day, 5 zip codes, click into ~5 listings:

- RentCast listings: 5 × $0.033 = $0.17
- RentCast AVM: 5 × $0.033 = $0.17
- Mapbox isochrones: cached (one-time per address)
- Mapbox geocode: cached (one-time per address)
- Bankrate: $0 (direct API)
- Polymarket: $0 (free API)
- **Total: ~$0.34/day** (much lower with caching)

---

## Deferred Items (Requires Funded Wallet or Further Research)

- **Real isochrone boundaries**: Mapbox isochrone API ($0.005/call) generates drive-time polygons. Currently showing center dots only. Needs funded Tempo wallet.
- **Geocoding**: Mapbox forward geocode ($0.0037/call) converts address text → lat/lng. Currently using hardcoded coordinates. Needs funded Tempo wallet.
- **Neighborhood price trend coloring**: Census tract boundaries are on the map but not colored by price trend. Need per-tract price data — Zillow neighborhood-level data or RentCast market stats per zip. Currently uniform gray outlines.
- **3mo/6mo period toggle**: Infrastructure ready but no per-neighborhood price history to drive it yet.
- **RentCast integration for real listings**: Mock data only. Needs funded Tempo wallet for MPP calls.
- **RentCast AVM valuations**: Needs funded wallet ($0.033/call).
- **Listing photos**: Unknown if RentCast returns photo URLs.
- **Crime, school, walkability data**: Free sources identified (Austin PD, GreatSchools, Walk Score) but not yet integrated.

## Open Questions

- Best source for neighborhood-level price data: Zillow free neighborhood data vs RentCast market stats vs ATTOM
- Whether OSRM public server is reliable enough or if we should use Mapbox isochrones
- StableEmail vs Resend free tier for alert emails
