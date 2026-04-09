// Photo lookup chain for a single listing.
//
// Strategy:
// 1. Call Google Maps text-search ($0.032) with the address. The legacy
//    text-search response includes both place_id AND photos[] in one shot.
// 2. If a photo reference is present, call /maps/place/photo ($0.007) for
//    the bytes. This is the "real listing photo" path.
// 3. If no photo reference, fall back to /maps/streetview ($0.007) at the
//    listing's lat/lng. This is the "what does the street look like" path.
// 4. If even Street View has no imagery, return null and the route will
//    save a sentinel marker so we don't keep retrying.
//
// Total cost per listing: $0.039 ever (cached by the route on disk after).
// All MPP calls are logged to mpp_transactions for the cost ledger.

import { paidFetch } from '@/lib/mpp-client';
import { logMppTransaction } from '@/lib/mpp';

// Round 3: swapped from googlemaps.mpp.tempo.xyz (the Tempo-operated proxy
// that had a 15-17s structural latency floor — see docs/mpp-latency-findings.md)
// to our locally-hosted reseller at mpp-reseller/. The reseller exposes the
// same /maps/streetview path with the same query-parameter shape and the
// same MPP charge intent on Tempo USDC.e. End-to-end cold load drops from
// ~17s to ~2-4s and per-call price drops from $0.007 to $0.001.
//
// The reseller MUST be running on 127.0.0.1:8787 for this to work — see
// mpp-reseller/README.md for the start command.
const GOOGLE_MAPS_BASE = 'http://127.0.0.1:8787';

// Pricing constants. These mirror the reseller's per-endpoint prices in
// mpp-reseller/src/config.ts. If the reseller's prices change, update here.
const TEXT_SEARCH_COST = 0.001;
const PLACE_PHOTO_COST = 0.001;
const STREETVIEW_COST = 0.001;

export interface PhotoResult {
  bytes: Buffer;
  source: 'place_photo' | 'streetview';
  contentType: string;
}

interface TextSearchResult {
  place_id?: string;
  photos?: Array<{ photo_reference: string; width?: number; height?: number }>;
}

interface TextSearchResponse {
  results?: TextSearchResult[];
  status?: string;
}

async function searchPlace(address: string): Promise<TextSearchResult | null> {
  const url = `${GOOGLE_MAPS_BASE}/maps/place/textsearch/json?query=${encodeURIComponent(address)}`;
  const res = await paidFetch(url, { method: 'GET' });
  logMppTransaction({
    service: 'Google Maps',
    module: 'housing',
    endpoint: '/maps/place/textsearch/json',
    rail: 'tempo',
    costUsd: TEXT_SEARCH_COST,
    metadata: { via: 'usdc', address },
  });

  if (!res.ok) {
    throw new Error(`text-search returned ${res.status}`);
  }

  const data = (await res.json()) as TextSearchResponse;
  return data.results?.[0] ?? null;
}

async function fetchPlacePhoto(photoReference: string): Promise<PhotoResult> {
  const url = `${GOOGLE_MAPS_BASE}/maps/place/photo?photoreference=${encodeURIComponent(photoReference)}&maxwidth=800`;
  const res = await paidFetch(url, { method: 'GET' });
  logMppTransaction({
    service: 'Google Maps',
    module: 'housing',
    endpoint: '/maps/place/photo',
    rail: 'tempo',
    costUsd: PLACE_PHOTO_COST,
    metadata: { via: 'usdc' },
  });

  if (!res.ok) {
    throw new Error(`place/photo returned ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    bytes: buffer,
    source: 'place_photo',
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  };
}

// Free preflight: ask the reseller (which proxies Google's free metadata
// endpoint) whether Street View imagery exists at the given coordinates.
// Returns true if Google says imagery is available, false otherwise.
//
// Round 3 Phase D found that ~60% of randomly-picked Austin residential
// addresses have no Street View coverage and return Google's tiny
// 7,838-byte placeholder from the paid endpoint. The metadata endpoint
// is free per Google's pricing, runs in ~50-200ms, and lets us skip
// the paid call entirely for those 60% of addresses — saving USDC.e and
// avoiding the bad-UX placeholder.
async function checkStreetViewMetadata(lat: number, lng: number): Promise<boolean> {
  const url = `${GOOGLE_MAPS_BASE}/maps/streetview/metadata?location=${lat},${lng}&radius=50&source=outdoor`;
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      // Reseller down or returned an error — fail open and try the paid call
      // anyway. We'd rather pay and get a placeholder than skip on a transient
      // network blip.
      console.warn(`[listing-photo] metadata preflight returned ${res.status}, failing open`);
      return true;
    }
    const data = (await res.json()) as { status?: string };
    return data.status === 'OK';
  } catch (err) {
    console.warn('[listing-photo] metadata preflight threw, failing open:', (err as Error).message);
    return true;
  }
}

async function fetchStreetView(
  lat: number,
  lng: number
): Promise<PhotoResult | null> {
  // Free preflight first — ~50-200ms, no MPP, no USDC.e. Skips ~60% of
  // Austin residential addresses that have no Street View coverage.
  console.time('[photo:streetview:metadata]');
  const hasImagery = await checkStreetViewMetadata(lat, lng);
  console.timeEnd('[photo:streetview:metadata]');
  if (!hasImagery) {
    console.log(`[listing-photo] no Street View imagery at ${lat},${lng}`);
    return null;
  }

  const url = `${GOOGLE_MAPS_BASE}/maps/streetview?location=${lat},${lng}&size=800x500&radius=50&source=outdoor`;
  const res = await paidFetch(url, { method: 'GET' });
  logMppTransaction({
    service: 'Google Maps',
    module: 'housing',
    endpoint: '/maps/streetview',
    rail: 'tempo',
    costUsd: STREETVIEW_COST,
    metadata: { via: 'usdc', lat, lng },
  });

  if (!res.ok) {
    return null;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    bytes: buffer,
    source: 'streetview',
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  };
}

export async function fetchListingPhoto(
  address: string,
  lat: number | null,
  lng: number | null
): Promise<PhotoResult | null> {
  // Both live probes confirmed: Austin residential addresses don't
  // register as Google Places, so the text-search step always returned
  // empty `photos[]` and we fell back to Street View. The text-search
  // call cost $0.032 + a full on-chain payment confirmation just to
  // learn that. Going straight to Street View cuts cost from $0.039 to
  // $0.007 per listing (5.6× cheaper) and removes one round of payment
  // signing latency.
  //
  // The text-search + place-photo path (`searchPlace`, `fetchPlacePhoto`)
  // is kept above for trivial re-enablement if a future use case
  // (commercial properties, vacation rentals, listings registered as
  // businesses) makes it worth chasing. Suppress unused-warning noise:
  void searchPlace;
  void fetchPlacePhoto;
  // We accept that we use `address` only for diagnostics now.
  void address;

  if (lat == null || lng == null) {
    return null;
  }

  console.time('[photo:streetview]');
  try {
    const result = await fetchStreetView(lat, lng);
    console.timeEnd('[photo:streetview]');
    return result;
  } catch (err) {
    console.timeEnd('[photo:streetview]');
    console.error('[listing-photo] streetview failed:', err);
    return null;
  }
}
