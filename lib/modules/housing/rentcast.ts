import { getDb } from '@/lib/db';
import { logMppTransaction } from '@/lib/mpp';
import { spawnSync } from 'child_process';
import path from 'path';

// Path to the installed agentcash CLI bin. Computed from process.cwd() at
// runtime — Turbopack rewrites `require.resolve` for externals into a fake
// `[externals]` placeholder string, so we deliberately avoid it.
const agentcashCli = path.join(
  process.cwd(),
  'node_modules',
  'agentcash',
  'dist',
  'esm',
  'index.js'
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callRentcast(endpoint: string, body: Record<string, unknown>): any {
  const result = spawnSync(
    process.execPath,
    [
      agentcashCli,
      'fetch',
      `https://rentcast.mpp.paywithlocus.com${endpoint}`,
      '-m', 'POST',
      '-b', JSON.stringify(body),
      '--format', 'json',
    ],
    { timeout: 120000, shell: false, encoding: 'utf8' }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`agentcash exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  if (parsed.success === false) {
    throw new Error(`agentcash error: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.data?.data ?? parsed.data ?? parsed;
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

// READ-ONLY. Never makes a paid call. Always returns whatever is in the
// SQLite cache. The MPP-spending refresh path is `refreshListingsFromMpp()`
// below — it must be invoked explicitly (e.g. by a Refresh button), never
// from a code path that runs on page load or browser reload.
//
// `zip` may be null when filtering by bookmarks (or other zip-agnostic
// criteria). The cached SQL query handles both shapes.
export async function fetchListings(
  zip: string | null,
  filters?: ListingFilters
): Promise<Listing[]> {
  return getCachedListings(zip, filters);
}

// EXPLICITLY-INVOKED ONLY. Costs $0.033 per call to RentCast via MPP.
// Do not wire this into any auto-firing path (useEffect, page load,
// GET endpoint that the UI calls on render). Refresh buttons, manual
// API calls only.
export async function refreshListingsFromMpp(zip: string): Promise<{
  fetched: number;
  cost: number;
}> {
  const data = callRentcast('/rentcast/sale-listings', {
    zipCode: zip,
    status: 'Active',
    limit: 500,
  });
  const records: RentcastListing[] = Array.isArray(data) ? data : [];

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO housing_listings
       (address, zip, price, beds, baths, sqft, lot_sqft, year_built,
        hoa_monthly, listing_url, days_on_market, status, latitude,
        longitude, last_seen, metadata)
     VALUES
       (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(address, zip) DO UPDATE SET
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

  const insertMany = db.transaction((rows: RentcastListing[]) => {
    for (const r of rows) {
      if (!r.formattedAddress || r.price == null) continue;
      upsert.run(
        r.formattedAddress,
        r.zipCode ?? zip,
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
    }
  });
  insertMany(records);

  logMppTransaction({
    service: 'RentCast',
    module: 'housing',
    endpoint: '/rentcast/sale-listings',
    rail: 'tempo',
    costUsd: 0.033,
    metadata: { via: 'usdc', zipCode: zip, count: records.length },
  });

  return { fetched: records.length, cost: 0.033 };
}

interface RentcastListing {
  id?: string;
  formattedAddress?: string;
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

function getCachedListings(zip: string | null, filters?: ListingFilters): Listing[] {
  const db = getDb();
  // Always alias the listings table as `l` so the optional bookmarks JOIN
  // can disambiguate. Conditions all reference `l.column`.
  // zip is optional — when omitted, the query spans all zips (used by the
  // bookmarks-only filter so a bookmark in any zip is reachable).
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (zip) {
    conditions.push('l.zip = ?');
    params.push(zip);
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
