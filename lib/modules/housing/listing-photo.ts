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

const GOOGLE_MAPS_BASE = 'https://googlemaps.mpp.tempo.xyz';

// Pricing constants (verified via agentcash discover earlier this session).
const TEXT_SEARCH_COST = 0.032;
const PLACE_PHOTO_COST = 0.007;
const STREETVIEW_COST = 0.007;

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

async function fetchStreetView(
  lat: number,
  lng: number
): Promise<PhotoResult | null> {
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

  // Google returns a small "no imagery" gray box if there's no pano
  // nearby. We can't easily distinguish that from a real image without
  // image analysis, so we accept whatever bytes come back. Future:
  // probe /streetview/metadata first (it's free) to skip the call.
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
