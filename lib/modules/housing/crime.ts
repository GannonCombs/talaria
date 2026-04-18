// Per-listing crime data via Austin PD open data + Census block group centroids.
//
// 1. Fetches annual crime counts by Census block group from Austin PD (free)
// 2. Fetches block group centroids from Census TIGERweb (free, cached in memory)
// 3. For each listing (has lat/lon), finds the nearest block group centroid
//    and stores that block group's raw incident count as listing.crime_count
//
// No normalization at storage time — raw counts are preserved.
// The scoring algorithm normalizes across all listings at score time.

import { dbAll, dbBatch } from '@/lib/db';
import { setWiredDimension } from './scoring';

const AUSTIN_CRIME_API = 'https://data.austintexas.gov/resource/fdj4-gpfu.json';
const TIGERWEB_API = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/10/query';

interface BlockGroupCentroid {
  geoid: string; // e.g. "484530319002" → last 10 chars match APD format "4530319002"
  lat: number;
  lon: number;
}

interface CrimeByCbg {
  census_block_group: string;
  count: string;
}

// ── Fetch block group centroids for Travis County ───────────────────────

let _cachedCentroids: BlockGroupCentroid[] | null = null;

async function getBlockGroupCentroids(): Promise<BlockGroupCentroid[]> {
  if (_cachedCentroids) return _cachedCentroids;

  const url = `${TIGERWEB_API}?where=STATE%3D%2748%27+AND+COUNTY%3D%27453%27` +
    `&outFields=GEOID,CENTLAT,CENTLON&f=json&resultRecordCount=1000&returnGeometry=false`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`TIGERweb API returned ${res.status}`);

  const data = await res.json();
  const features = data.features as Array<{ attributes: { GEOID: string; CENTLAT: string; CENTLON: string } }>;

  _cachedCentroids = features.map((f) => ({
    geoid: f.attributes.GEOID,
    lat: parseFloat(f.attributes.CENTLAT),
    lon: parseFloat(f.attributes.CENTLON),
  }));

  return _cachedCentroids;
}

// ── Fetch crime counts by block group from Austin PD ────────────────────

async function getCrimeCounts(): Promise<Map<string, number>> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const dateStr = oneYearAgo.toISOString().split('T')[0];

  const url = `${AUSTIN_CRIME_API}?$select=census_block_group,count(*)` +
    `&$where=occ_date>'${dateStr}' AND census_block_group IS NOT NULL` +
    `&$group=census_block_group&$limit=5000`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Austin PD API returned ${res.status}`);

  const data = (await res.json()) as CrimeByCbg[];

  // APD uses 10-char format "453XXXXXXB", TIGERweb uses 12-char "48453XXXXXXB"
  // Map both to the 10-char APD format for matching
  const counts = new Map<string, number>();
  for (const row of data) {
    counts.set(row.census_block_group, parseInt(row.count, 10));
  }
  return counts;
}

// ── Find nearest block group for a lat/lon ──────────────────────────────

function distSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = lat1 - lat2;
  const dlon = lon1 - lon2;
  return dlat * dlat + dlon * dlon;
}

function findNearestBlockGroup(
  lat: number,
  lon: number,
  centroids: BlockGroupCentroid[],
): BlockGroupCentroid | null {
  let best: BlockGroupCentroid | null = null;
  let bestDist = Infinity;

  for (const c of centroids) {
    const d = distSq(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// ── Main: fetch crime data and assign to listings ───────────────────────

export async function fetchCrimeData(): Promise<{
  listingsUpdated: number;
  blockGroupsWithCrime: number;
}> {
  const [centroids, crimeCounts] = await Promise.all([
    getBlockGroupCentroids(),
    getCrimeCounts(),
  ]);

  // Load all listings with coordinates
  const listings = await dbAll<{ id: number; latitude: number; longitude: number }>(
    'SELECT id, latitude, longitude FROM housing_listings WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
  );

  // For each listing, find nearest block group and look up its crime count
  const statements: { sql: string; args: unknown[] }[] = [];
  let updated = 0;

  for (const listing of listings) {
    const nearest = findNearestBlockGroup(listing.latitude, listing.longitude, centroids);
    if (!nearest) continue;

    // Convert TIGERweb 12-char GEOID to APD 10-char format
    // TIGERweb: "484530319002" → APD: "4530319002" (drop state prefix "48")
    const apdKey = nearest.geoid.slice(2);
    const count = crimeCounts.get(apdKey) ?? 0;

    statements.push({ sql: 'UPDATE housing_listings SET crime_count = ? WHERE id = ?', args: [count, listing.id] });
    updated++;
  }

  await dbBatch(statements);

  // Mark crime as wired
  await setWiredDimension('crime');

  return {
    listingsUpdated: updated,
    blockGroupsWithCrime: crimeCounts.size,
  };
}
