# City-Wide Austin Listings via Paginated city/state Query (Auto-Refresh on Stale Cache)

## Context

Today's housing module shows ~1,036 listings spread across 5 hand-picked Austin zip codes (78745, 78704, 78749, 78748, 78731). That's a tiny slice of greater Austin, where there are 35-80 zip codes depending on how you draw the boundary.

The naive fix — loop the existing per-zip refresh function over all 35-80 zips — is too expensive: 35-80 × $0.033 = **$1.16 to $2.64 per refresh**, $5-10/month at weekly cadence.

The opportunity: RentCast's `/rentcast/sale-listings` endpoint accepts `city` + `state` parameters in addition to `zipCode`. **One $0.033 call returns up to 500 listings city-wide regardless of how many zip codes they span**, and `offset` lets us paginate. I verified this directly:

- `agentcash check` confirms `city` and `state` are real input fields
- A live `limit:1` probe to `{city: "Austin", state: "TX"}` returned an Austin Single Family at $0.033 — confirmed via the agentcash payment metadata in the response envelope

Cost math (weekly cadence):

| Approach | Listings covered | Calls/refresh | Cost/refresh | Cost/month |
|---|---|---|---|---|
| Current 5 zips | ~1,000 | 5 | $0.165 | $0.66 |
| Per-zip × 35 (small Austin) | ~10,000 | 35 | $1.16 | $4.62 |
| Per-zip × 80 (greater Austin) | ~15,000+ | 80 | $2.64 | $10.56 |
| **City-wide paginated** | **All Austin** | **~10-30** | **$0.33-$0.99** | **$1.32-$3.96** |

City-wide is cheaper than the most conservative per-zip approach AND gives full coverage. It's the right call.

## How refresh fires (per user direction)

**Cache-age check on page load.** The user expected this to already work weekly — it doesn't, because the existing freshness check only covers `fetchMarketStats`, not `fetchListings`. The listings refresh function (`refreshListingsFromMpp`) is currently never called from anywhere.

The new behavior:

1. On every load of `/housing`, check the most recent `last_seen` timestamp on any row in `housing_listings` for the user's configured city
2. If `now - last_seen > 7 days` OR the table is empty for this city → fire one paginated city-wide refresh
3. Otherwise → use cache

**Infinite-loop protection is critical** — the user explicitly called this out. Two guard mechanisms:

1. **Per-process cooldown**: Once a refresh starts (even before it completes), set an in-memory or DB flag with a "refresh started at" timestamp. Don't fire another refresh if one is already in progress, *or* if one finished/errored within the last hour. Even an *errored* refresh counts — we don't want a 402/network failure to fire on every page load until it works. The user can wait an hour or manually clear the flag.

2. **DB-backed last-attempt timestamp**: Store the most recent refresh attempt (success or failure) in `user_preferences` as `housing.listings_last_refresh_attempt`. The freshness check considers `max(last_seen, last_refresh_attempt)` — so a failed refresh "uses up" the attempt for the cooldown window even though no rows were inserted.

The combo guarantees: at most one refresh per session per hour, and at most one per week on success.

## Authorization scope

Per user: "I give permission to try to pull all of Austin's data, as long as you think it's <$2 and all-inclusive."

Setting `MAX_PAGES = 60` ⇒ hard ceiling of 60 × $0.033 = **$1.98**. This covers up to 30,000 listings, which is way more than greater Austin will ever have (real-world: somewhere between 5,000 and 15,000 active sale listings depending on season). The cap is a safety net, not the expected spend.

If a single refresh ever hits MAX_PAGES, that's a signal something is wrong (either the city is way bigger than I expect, or RentCast's pagination is misbehaving). I'll log it as a warning in the transaction metadata and surface it in a banner the next time the user loads /housing.

The expected real cost per refresh is **$0.33-$0.99** for Austin specifically. $1.98 is the catastrophe cap.

---

## Recommended approach

### 1. New paginated refresh function

Replace `refreshListingsFromMpp(zip)` in [lib/modules/housing/rentcast.ts](lib/modules/housing/rentcast.ts) with:

```typescript
export async function refreshListingsForCity(
  city: string,
  state: string,
  opts?: { maxPages?: number }
): Promise<{ fetched: number; pages: number; cost: number; truncated: boolean }>
```

Loop body:
1. Call `/rentcast/sale-listings` with `{ city, state, status: 'Active', limit: 500, offset }`
2. If the response is empty or non-array → terminate
3. Upsert all returned records into `housing_listings` (existing upsert logic, generalized)
4. Log one `mpp_transactions` row per page
5. If `records.length < 500` → terminate (last page)
6. If `pageCount >= maxPages` → terminate with `truncated: true`
7. Else → `offset += 500`, repeat

Default `maxPages = 60`. The function does not catch its own errors — callers handle retries / cooldowns.

### 2. Cache-age check + auto-refresh on page load

In [app/housing/page.tsx](app/housing/page.tsx), the existing `loadListings()` becomes a two-step:

```
1. Read latest `last_seen` for the configured city (new helper endpoint /api/housing/listings-meta)
2. If stale OR empty AND not in cooldown → POST /api/housing/refresh-listings (city, state)
3. After refresh completes (or skips) → load listings normally from cache
```

Both steps run automatically on page load, in that order. No button. No modal. The user sees a small inline banner during the refresh ("Refreshing Austin listings… page 4 / ?") and the map populates when it's done.

### 3. Cooldown / infinite-loop protection

Two complementary mechanisms:

**(a)** A single-row preference `housing.listings_last_refresh_attempt` (ISO timestamp) gets written **at the start** of every refresh attempt, before any MPP call. The auto-refresh logic refuses to fire if `now - last_refresh_attempt < 1 hour`. This survives page reloads and protects against the infinite-loop scenario the user is worried about.

**(b)** An in-process module-level Promise flag in [lib/modules/housing/rentcast.ts](lib/modules/housing/rentcast.ts) prevents two refreshes from running simultaneously in the same Next.js process (e.g. if two browser tabs hit /housing at once). Subsequent calls await the in-flight Promise instead of starting a new one.

The page-load logic specifically:

```
if (cache is fresh) → use cache, no refresh
else if (last_refresh_attempt < 1h ago) → use stale cache, skip refresh, log a console warning
else → write last_refresh_attempt = now → call refresh → after success/failure, load cache
```

Worst case: refresh fails. User sees stale cache + cooldown blocks retries for 1 hour. Once an hour passes, next page load tries again. Never an infinite loop.

### 4. Schema migration: add city + state columns to housing_listings

[lib/modules/housing/tables.ts](lib/modules/housing/tables.ts) gains:

```sql
ALTER TABLE housing_listings ADD COLUMN city TEXT;
ALTER TABLE housing_listings ADD COLUMN state TEXT;
CREATE INDEX IF NOT EXISTS idx_listings_city_state ON housing_listings(city, state);
```

Plus a one-shot UPDATE to backfill the existing 1,036 rows from `formattedAddress`. Format is consistent: `"12106 Salvador St, Austin, TX 78748"` — easy to extract via SQL `substr` or just a JS one-shot if SQLite's string functions get clunky. I'll do the JS one-shot in a migration step since `formattedAddress` isn't even a column on the table — only the metadata blob has it.

Wait, let me verify: [housing_listings](lib/modules/housing/tables.ts) has `address TEXT` (which stores the formatted address), so we can backfill from `address` directly.

The schema migration runs through the existing version-bump path in [lib/db.ts](lib/db.ts) — bump `SCHEMA_VERSION`, the `if (currentVersion < N) { ALTER... }` block handles ALTER + INDEX + the backfill UPDATE.

### 5. Drop TARGET_ZIPS, switch reads to city/state

[app/housing/page.tsx:94](app/housing/page.tsx#L94) drops `const TARGET_ZIPS = [...]`. The listings load loop becomes a single fetch with `city` + `state` query params.

[app/api/housing/listings/route.ts](app/api/housing/listings/route.ts) adds `city` and `state` query params (the existing `zip` param stays for backward compat / per-zip queries if anyone wants them later, but page.tsx stops using it). When `city` is present, the SQL `WHERE` is `l.city = ? AND l.state = ?` instead of `l.zip = ?`.

[lib/modules/housing/rentcast.ts](lib/modules/housing/rentcast.ts) `getCachedListings` gains a parallel parameter shape — accepts either `(zip, filters)` OR `(city, state, filters)`. Cleanest is to widen the signature to accept `{zip?, city?, state?}` as the first argument. The bookmarks-only path stays — bookmarks compose with city/state filters the same way they composed with zip.

### 6. New API endpoint: /api/housing/refresh-listings

POST `{city, state}` → invokes `refreshListingsForCity` server-side, returns `{fetched, pages, cost, truncated, skippedReason?}`. The route also enforces the cooldown server-side (defense in depth — even if the client-side logic glitches, the server refuses).

This is the only paid path. Read API stays cached.

### 7. UI surfaces during the refresh

Page.tsx shows a small banner above the map while a refresh is in flight:

```
Refreshing listings for Austin, TX… (page 4 of ~?, ~$0.13 spent so far)
```

After completion: a transient toast for ~5 seconds:

```
Refreshed: 5,234 listings across 47 zip codes for $0.561.
```

If `truncated`: the toast adds "More listings exist beyond the safety cap. Will retry next week."

If a cooldown skip happens (refresh wanted but blocked): a more discreet inline notice in the listings count area, like "Listings cached 3h ago — auto-refresh paused 1h cooldown."

---

## What this round does NOT do

- **Pin clustering** for high-density maps. Skip until we see what 5-15k pins actually looks like.
- **Multi-city support.** DB columns allow it but UI is one-city-at-a-time.
- **Bankrate hardcode `78757`.** Out of scope, separate fix.
- **Dropping `zip` param from the listings route.** Kept for backward compatibility — only the page.tsx call site stops using it.
- **Migrating the cache from old data.** The existing 1,036 rows get city/state backfilled and stay in place. They become a small subset of the new dataset after the first city-wide refresh.

---

## Critical files

| File | Change |
|---|---|
| [lib/modules/housing/rentcast.ts](lib/modules/housing/rentcast.ts) | Replace `refreshListingsFromMpp(zip)` with `refreshListingsForCity(city, state, opts)`. Add in-process Promise lock. Generalize `getCachedListings` to accept city/state. |
| [lib/modules/housing/tables.ts](lib/modules/housing/tables.ts) | Add `city`, `state` columns + index on `housing_listings`. |
| [lib/db.ts](lib/db.ts) | Bump `SCHEMA_VERSION`, add migration block for ALTER + backfill UPDATE from `address` column. |
| [app/api/housing/listings/route.ts](app/api/housing/listings/route.ts) | Accept `city`+`state` as alternatives to `zip`. |
| [app/api/housing/refresh-listings/route.ts](app/api/housing/refresh-listings/route.ts) | NEW. POST `{city, state}` → invokes refresh + enforces cooldown + writes `housing.listings_last_refresh_attempt` pref. |
| [app/api/housing/listings-meta/route.ts](app/api/housing/listings-meta/route.ts) | NEW. GET `?city=...&state=...` → returns `{newestLastSeen, rowCount, lastRefreshAttempt}` so the client knows whether to fire a refresh. |
| [app/housing/page.tsx](app/housing/page.tsx) | Drop `TARGET_ZIPS`. Listings load now: GET listings-meta → maybe POST refresh → GET listings. Add a refresh-status banner. |
| [components/modules/housing/HousingMap.tsx](components/modules/housing/HousingMap.tsx) | No changes (already handles arbitrary listing counts). |

No changes to: ListingDrawer, RightPanel, scoring, mortgage calc, bookmarks, filters.

New tests:
- `tests/refresh-listings.test.ts` — covers the cooldown logic (1h block), the freshness check (>7d triggers, ≤7d doesn't), and the truncation flag at MAX_PAGES.
- Pagination loop (mock the agentcash CLI call): one page partial → terminates, two pages full → calls twice, hits MAX_PAGES → returns truncated.

---

## Verification

After implementation:

1. **Schema migration**: drop the listings cache (or use the existing rows), reload — city/state columns exist, existing rows have backfilled values. `SELECT city, state, COUNT(*) FROM housing_listings GROUP BY city, state` shows `Austin, TX, 1036`.
2. **Empty cache + first load**: clear `housing_listings` entirely. Reload /housing → banner appears, refresh starts, paginates through Austin, banner updates with page count, map populates with all the new pins. Expected cost: $0.33-$0.99.
3. **Fresh cache**: reload /housing immediately after the first refresh → no banner, no MPP calls, map renders from cache.
4. **Cooldown protection**: artificially set `housing.listings_last_refresh_attempt` to 30 minutes ago, set `last_seen` on all rows to 8 days ago. Reload → no refresh fires, console warns about cooldown. Set `last_refresh_attempt` to 90 minutes ago → refresh fires.
5. **Two-tab race**: open /housing in two tabs simultaneously (after clearing the cache) → only one refresh fires, the second tab sees an in-flight Promise lock and waits.
6. **MAX_PAGES truncation**: temporarily set `MAX_PAGES = 2`, clear cache, reload → refresh stops at 2 pages, returns `truncated: true`, banner shows truncation warning.
7. **Filter composition**: with the city-wide dataset, all existing filters (price, beds, baths, property type, year built, lot, HOA, DOM, bookmarks) still work and produce reasonable counts.
8. **Spend audit**: total `mpp_transactions` cost from this round's testing ≤ $1.98 hard ceiling. I will report the actual number to the user before pushing.
9. **Type check + tests**: `npx tsc --noEmit -p tsconfig.json` passes; existing 42 tests pass; new tests for cooldown + pagination loop.

---

## What I'll spend during implementation

I'll need to fire the refresh **once** to verify the full flow end-to-end. Expected: ~10-30 calls × $0.033 = **$0.33-$0.99**, hard-capped at $1.98 by MAX_PAGES. Per the user's standing rule and explicit grant ("I give permission to try to pull all of Austin's data"), this is authorized in advance for this implementation. I will report the actual spend number in the final summary before pushing.
