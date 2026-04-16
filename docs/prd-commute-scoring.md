# PRD: Commute Scoring for Housing Module

## Summary
Wire up the `commute_work` and `commute_social` dimensions in the housing scoring system using the free Valhalla routing API. This gives each listing a real drive-time score based on user-configured work and social addresses.

## Scoring Curve

| Drive time | Score |
|---|---|
| 0–5 min | 10 |
| 5–10 min | 9 |
| 10–15 min | 8 |
| 15–20 min | 7 |
| 20–25 min | 6 |
| 25–30 min | 5 |
| 30–33 min | 4 |
| 33–36 min | 3 |
| 36–40 min | 2 |
| 40+ min | 1 |

Scores compress in the 30–40 range because that's the user's pain threshold — small differences there matter more than the difference between 5 and 10 minutes.

## Architecture

### Data Source
- **Valhalla matrix API** (`sources_to_targets`): free, no API key, already used for isochrones
- Handles 2 sources (work + social) × 100 listing targets per request
- Returns drive time in seconds per pair

### Fetch Strategy
- **Background, one-time** — NOT on every page load
- Runs after listings refresh or on first setup
- Incremental: only queries listings with NULL commute data
- ~120 batch requests × ~2.3s each = ~5 min total for ~12K listings
- Fire-and-forget from the page; scores update when data arrives

### Storage
- Two new columns on `housing_listings`: `commute_work_min REAL`, `commute_social_min REAL`
- Raw minutes stored (not mapped scores) — preserves data for display/filtering
- Scoring curve applied at score-computation time via a mapping function

### Scoring Integration
- Commute dimensions use the absolute curve above instead of min-max normalization
- `getValue` returns the mapped 1–10 score from raw minutes
- `invert: false` since higher score = better (short commute)
- Weight sliders in the UI already exist and work

## Files to Create
- `lib/modules/housing/commute.ts` — fetch + assign logic (follows crime.ts pattern)
- `app/api/housing/commute/route.ts` — POST endpoint to trigger

## Files to Modify
- `lib/modules/housing/scoring.ts` — uncomment commute dimensions, add curve function
- `lib/modules/housing/tables.ts` — add columns to CREATE TABLE
- `lib/db.ts` — ALTER TABLE migration for existing DBs
- `app/housing/page.tsx` — trigger background commute fetch

## Open Concerns

### 1. 5-minute background job
The biggest concern. ~12K listings × 2 destinations = ~120 Valhalla batch calls taking ~5 minutes total. This is a one-time cost per listings refresh, but:
- What if the user navigates away mid-fetch?
- Should there be progress indication?
- Should we abort if the server restarts?
- Could we pre-filter listings to only score those within a reasonable bounding box (e.g., skip listings 100+ miles from either destination)?

### 2. Free API rate limits
Valhalla's public server has no documented rate limits, but it's a community resource. Hammering it with 120 requests in rapid succession could get us throttled or blocked. Current plan is 200ms delay between batches, but we may need to be more conservative.

### 3. Stale commute data
Drive times don't change much day-to-day, but they do change with road construction, new highways, etc. How often should we re-fetch? Current plan: only when commute columns are NULL (new listings). No periodic refresh.

### 4. User-changed addresses
If the user changes their work or social address in settings, all existing commute data becomes stale. Need a way to invalidate and re-fetch. Could NULL out all commute columns and re-run.

### 5. Housing page load performance (unrelated but noted)
User reports the housing page is already starting to churn on navigation. This is a separate issue from commute scoring but should be investigated — adding more scoring dimensions will make it worse if the root cause isn't addressed.
