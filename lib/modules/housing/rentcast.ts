import { getDb } from '@/lib/db';

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
  minSqft?: number;
  maxDom?: number;
}

// Cache freshness thresholds (in hours)
const STATS_STALE_HOURS = 7 * 24; // 7 days
const LISTINGS_STALE_HOURS = 24;   // 1 day

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

export async function fetchListings(
  zip: string,
  filters?: ListingFilters
): Promise<Listing[]> {
  // TODO: When Tempo wallet is live, check staleness and make MPP call to RentCast:
  // const response = await tempoFetch(`https://rentcast.mpp.tempo.xyz/v1/listings?zip=${zip}`);
  // logMppTransaction({ service: 'RentCast', module: 'housing', endpoint: '/v1/listings', costUsd: 0.05 });

  // For now, return from DB (seeded by seed.ts)
  return getCachedListings(zip, filters);
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

function getCachedListings(zip: string, filters?: ListingFilters): Listing[] {
  const db = getDb();
  const conditions = ['zip = ?'];
  const params: unknown[] = [zip];

  if (filters?.minPrice) {
    conditions.push('price >= ?');
    params.push(filters.minPrice);
  }
  if (filters?.maxPrice) {
    conditions.push('price <= ?');
    params.push(filters.maxPrice);
  }
  if (filters?.minBeds) {
    conditions.push('beds >= ?');
    params.push(filters.minBeds);
  }
  if (filters?.minSqft) {
    conditions.push('sqft >= ?');
    params.push(filters.minSqft);
  }
  if (filters?.maxDom) {
    conditions.push('days_on_market <= ?');
    params.push(filters.maxDom);
  }

  const rows = db
    .prepare(
      `SELECT * FROM housing_listings
       WHERE ${conditions.join(' AND ')}
       ORDER BY deal_score DESC NULLS LAST, price ASC`
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
