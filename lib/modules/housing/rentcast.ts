import { getDb } from '@/lib/db';
import { logMppTransaction } from '@/lib/mpp';
import { paidFetch } from '@/lib/mpp-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callRentcast(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await paidFetch(
    `https://rentcast.mpp.paywithlocus.com${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`RentCast MPP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

export interface MarketStats {
  zip: string;
  date: string;
  medianPrice: number;
  medianPpsf: number;
  activeListings: number;
  soldCount: number;
  medianDom: number;
}

export interface Listing {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  hoaMonthly: number;
  taxAnnual: number;
  listingUrl: string | null;
  daysOnMarket: number;
  status: string;
  latitude: number;
  longitude: number;
  dealScore: number | null;
  monthlyCost: number | null;
}

export interface ListingFilters {
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  minSqft?: number;
  maxDom?: number;
  // Comma-separated list of property types when arriving via API; an
  // array internally. Empty/undefined = no filter.
  propertyTypes?: string[];
  yearMin?: number;
  yearMax?: number;
  minLotSqft?: number;
  maxHoa?: number;
  hasHoa?: 'yes' | 'no' | 'any';
  // When true, INNER JOIN housing_tracked so only bookmarked rows return.
  bookmarksOnly?: boolean;
}

// Cache freshness thresholds (in hours)
const STATS_STALE_HOURS = 7 * 24; // 7 days

export async function fetchMarketStats(zip: string): Promise<MarketStats | null> {
  const cached = getCachedStats(zip);
  if (cached && !isStale(cached.fetchedAt, STATS_STALE_HOURS)) {
    return cached.stats;
  }

  // TODO: When Tempo wallet is live, make MPP call to RentCast here:
  // const response = await tempoFetch(`https://rentcast.mpp.tempo.xyz/v1/markets?zip=${zip}`);
  // logMppTransaction({ service: 'RentCast', module: 'housing', endpoint: '/v1/markets', costUsd: 0.03 });
  // Cache and return response.

  // For now, return cached data (seeded by seed.ts)
  return cached?.stats ?? null;
}

export interface ListingLocation {
  zip?: string | null;
  city?: string | null;
  state?: string | null;
}

// READ-ONLY. Never makes a paid call. Always returns whatever is in the
// SQLite cache. The MPP-spending refresh path is `refreshListingsForCity()`
// — it must be invoked explicitly (e.g. by the auto-refresh-on-stale-cache
// path), never from a code path that runs on every render.
//
// `location` may be empty (or all-null) when filtering by bookmarks across
// the entire cache. The cached SQL query handles every combination.
export async function fetchListings(
  location: ListingLocation,
  filters?: ListingFilters
): Promise<Listing[]> {
  return getCachedListings(location, filters);
}

export interface RefreshResult {
  fetched: number;
  pages: number;
  cost: number;
  truncated: boolean;
}

const PAGE_LIMIT = 500;
// Hard ceiling: 60 pages × $0.033 = $1.98. Catastrophe cap, not the
// expected spend. Real Austin refresh runs ~10-30 pages = $0.33-$0.99.
const DEFAULT_MAX_PAGES = 60;
const COST_PER_PAGE = 0.033;

// In-process Promise lock. If a refresh is already running for any city,
// callers await the in-flight Promise instead of starting their own. This
// guards against two simultaneous /housing tabs both kicking off a refresh.
let inflightRefresh: Promise<RefreshResult> | null = null;

function upsertOnePage(
  records: RentcastListing[],
  fallbackCity: string,
  fallbackState: string
): number {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO housing_listings
       (address, city, state, zip, price, beds, baths, sqft, lot_sqft,
        year_built, hoa_monthly, listing_url, days_on_market, status,
        latitude, longitude, last_seen, metadata)
     VALUES
       (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(address, zip) DO UPDATE SET
       city = excluded.city,
       state = excluded.state,
       price = excluded.price,
       beds = excluded.beds,
       baths = excluded.baths,
       sqft = excluded.sqft,
       lot_sqft = excluded.lot_sqft,
       year_built = excluded.year_built,
       hoa_monthly = excluded.hoa_monthly,
       listing_url = excluded.listing_url,
       days_on_market = excluded.days_on_market,
       status = excluded.status,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       last_seen = datetime('now'),
       metadata = excluded.metadata`
  );

  let inserted = 0;
  const insertMany = db.transaction((rows: RentcastListing[]) => {
    for (const r of rows) {
      if (!r.formattedAddress || r.price == null) continue;
      upsert.run(
        r.formattedAddress,
        r.city ?? fallbackCity,
        r.state ?? fallbackState,
        r.zipCode ?? '',
        r.price,
        r.bedrooms ?? null,
        r.bathrooms ?? null,
        r.squareFootage ?? null,
        r.lotSize ?? null,
        r.yearBuilt ?? null,
        r.hoa?.fee ?? 0,
        null,
        r.daysOnMarket ?? null,
        r.status ?? 'Active',
        r.latitude ?? null,
        r.longitude ?? null,
        JSON.stringify({
          rentcastId: r.id,
          propertyType: r.propertyType,
          mlsName: r.mlsName,
          mlsNumber: r.mlsNumber,
          listedDate: r.listedDate,
          listingAgent: r.listingAgent?.name,
          listingOffice: r.listingOffice?.name,
        })
      );
      inserted++;
    }
  });
  insertMany(records);
  return inserted;
}

// EXPLICITLY-INVOKED ONLY (or via the auto-refresh path on stale cache).
// Paginated city-wide RentCast call. Costs ~$0.033 per page; expected
// real cost for greater Austin is $0.33-$0.99. Hard-capped at $1.98.
//
// The in-process Promise lock ensures concurrent callers all await the
// same in-flight refresh instead of stacking calls. The route layer
// adds a DB-backed cooldown on top to survive page reloads.
export async function refreshListingsForCity(
  city: string,
  state: string,
  opts?: { maxPages?: number }
): Promise<RefreshResult> {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;

  inflightRefresh = (async () => {
    let totalFetched = 0;
    let pageCount = 0;
    let naturallyTerminated = false;
    let offset = 0;

    while (pageCount < maxPages) {
      const data = await callRentcast('/rentcast/sale-listings', {
        city,
        state,
        status: 'Active',
        limit: PAGE_LIMIT,
        offset,
      });
      // paidFetch returns the raw API response; unwrap if nested under a `data` key
      const unwrapped = Array.isArray(data) ? data : (data?.data ?? data);
      const records: RentcastListing[] = Array.isArray(unwrapped) ? unwrapped : [];
      pageCount++;

      const inserted = upsertOnePage(records, city, state);
      totalFetched += inserted;

      logMppTransaction({
        service: 'RentCast',
        module: 'housing',
        endpoint: '/rentcast/sale-listings',
        rail: 'tempo',
        costUsd: COST_PER_PAGE,
        metadata: {
          via: 'usdc',
          city,
          state,
          page: pageCount,
          offset,
          count: records.length,
        },
      });

      // Termination: a non-full page means we hit the end of results.
      // Track this explicitly so we can distinguish a natural finish on
      // the Nth page from hitting the cap on the Nth page.
      if (records.length < PAGE_LIMIT) {
        naturallyTerminated = true;
        break;
      }

      offset += PAGE_LIMIT;
    }

    return {
      fetched: totalFetched,
      pages: pageCount,
      cost: pageCount * COST_PER_PAGE,
      // Truncated only if the loop exited via the cap. If page #maxPages
      // happened to be the last page (records < PAGE_LIMIT), we finished
      // cleanly and the user has everything.
      truncated: !naturallyTerminated,
    };
  })();

  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

interface RentcastListing {
  id?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  hoa?: { fee?: number };
  daysOnMarket?: number;
  status?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  mlsName?: string;
  mlsNumber?: string;
  listedDate?: string;
  listingAgent?: { name?: string };
  listingOffice?: { name?: string };
}

export async function fetchPropertyDetails(
  address: string,
  zip: string
): Promise<Listing | null> {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM housing_listings WHERE address = ? AND zip = ?')
    .get(address, zip) as Record<string, unknown> | undefined;

  if (!row) return null;
  return mapListingRow(row);
}

// ── Cache helpers ──

function getCachedStats(zip: string): { stats: MarketStats; fetchedAt: string } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM housing_market_stats
       WHERE zip = ? ORDER BY fetched_at DESC LIMIT 1`
    )
    .get(zip) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    stats: {
      zip: row.zip as string,
      date: row.date as string,
      medianPrice: row.median_price as number,
      medianPpsf: row.median_ppsf as number,
      activeListings: row.active_listings as number,
      soldCount: row.sold_count as number,
      medianDom: row.median_dom as number,
    },
    fetchedAt: row.fetched_at as string,
  };
}

function getCachedListings(
  location: ListingLocation,
  filters?: ListingFilters
): Listing[] {
  const db = getDb();
  // Always alias the listings table as `l` so the optional bookmarks JOIN
  // can disambiguate. Conditions all reference `l.column`.
  // Location filters are all optional. When all-empty, the query spans
  // every cached row (used by the bookmarks-only path so a bookmark
  // anywhere is reachable).
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (location.zip) {
    conditions.push('l.zip = ?');
    params.push(location.zip);
  }
  if (location.city) {
    conditions.push('l.city = ?');
    params.push(location.city);
  }
  if (location.state) {
    conditions.push('l.state = ?');
    params.push(location.state);
  }

  if (filters?.minPrice) {
    conditions.push('l.price >= ?');
    params.push(filters.minPrice);
  }
  if (filters?.maxPrice) {
    conditions.push('l.price <= ?');
    params.push(filters.maxPrice);
  }
  if (filters?.minBeds) {
    conditions.push('l.beds >= ?');
    params.push(filters.minBeds);
  }
  if (filters?.minBaths) {
    conditions.push('l.baths >= ?');
    params.push(filters.minBaths);
  }
  if (filters?.minSqft) {
    conditions.push('l.sqft >= ?');
    params.push(filters.minSqft);
  }
  if (filters?.maxDom) {
    conditions.push('l.days_on_market <= ?');
    params.push(filters.maxDom);
  }
  if (filters?.yearMin) {
    conditions.push('l.year_built >= ?');
    params.push(filters.yearMin);
  }
  if (filters?.yearMax) {
    conditions.push('l.year_built <= ?');
    params.push(filters.yearMax);
  }
  if (filters?.minLotSqft) {
    conditions.push('l.lot_sqft >= ?');
    params.push(filters.minLotSqft);
  }
  if (filters?.maxHoa) {
    conditions.push('l.hoa_monthly <= ?');
    params.push(filters.maxHoa);
  }
  if (filters?.hasHoa === 'yes') {
    conditions.push('l.hoa_monthly > 0');
  } else if (filters?.hasHoa === 'no') {
    conditions.push('(l.hoa_monthly = 0 OR l.hoa_monthly IS NULL)');
  }
  if (filters?.propertyTypes && filters.propertyTypes.length > 0) {
    // propertyType lives in the metadata JSON column. Use json_extract.
    const placeholders = filters.propertyTypes.map(() => '?').join(',');
    conditions.push(`json_extract(l.metadata, '$.propertyType') IN (${placeholders})`);
    params.push(...filters.propertyTypes);
  }

  // Bookmarks filter: INNER JOIN housing_tracked so non-bookmarked rows
  // are excluded entirely.
  const join = filters?.bookmarksOnly
    ? 'INNER JOIN housing_tracked t ON t.listing_id = l.id'
    : '';

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT l.* FROM housing_listings l
       ${join}
       ${where}
       ORDER BY l.deal_score DESC NULLS LAST, l.price ASC`
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map(mapListingRow);
}

function mapListingRow(row: Record<string, unknown>): Listing {
  return {
    id: row.id as number,
    address: row.address as string,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    zip: row.zip as string,
    price: row.price as number,
    beds: row.beds as number,
    baths: row.baths as number,
    sqft: row.sqft as number,
    lotSqft: row.lot_sqft as number,
    yearBuilt: row.year_built as number,
    hoaMonthly: row.hoa_monthly as number,
    taxAnnual: row.tax_annual as number,
    listingUrl: row.listing_url as string | null,
    daysOnMarket: row.days_on_market as number,
    status: row.status as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    dealScore: row.deal_score as number | null,
    monthlyCost: row.monthly_cost as number | null,
  };
}

function isStale(fetchedAt: string, maxHours: number): boolean {
  const fetched = new Date(fetchedAt).getTime();
  const now = Date.now();
  return now - fetched > maxHours * 60 * 60 * 1000;
}
