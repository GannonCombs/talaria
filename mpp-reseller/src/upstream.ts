/**
 * Google Maps upstream call helpers.
 *
 * Three endpoints:
 *   - streetview  (legacy Static Street View API, GET, image bytes)
 *   - textsearch  (legacy Places Text Search, GET, JSON)
 *   - photo       (Places API New, GET, image bytes)
 *
 * Each helper:
 *   - Builds the upstream URL with query params + API key.
 *   - Wraps fetch in a 15s AbortController.
 *   - Returns a tuple: [Response object, redacted upstream URL string].
 *     The redacted URL is for logging — it strips the `key=` query param so
 *     the API key never lands in NDJSON or stdout.
 *
 * The handlers do NOT touch payment, mppx, or anything Hono-specific.
 * They take a plain query record and return a plain Response.
 */

import { getConfig } from './config.js';

export interface UpstreamResult {
  response: Response;
  redactedUrl: string;
}

/**
 * Replace `key=...` query param values with `REDACTED` so the API key
 * never lands in logs, NDJSON, or stdout. Exported for testing.
 *
 * The character class `[^&#]+` stops at `&` (next param) AND `#` (fragment)
 * so a URL like `https://x.com/path?key=AIza...#frag` becomes
 * `https://x.com/path?key=REDACTED#frag` rather than swallowing the fragment.
 */
export function redactKey(url: string): string {
  return url.replace(/(\bkey=)[^&#]+/g, '$1REDACTED');
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function passQuery(input: Record<string, string | undefined>, allowed: readonly string[]): URLSearchParams {
  const out = new URLSearchParams();
  for (const k of allowed) {
    const v = input[k];
    if (v !== undefined && v !== '') out.set(k, v);
  }
  return out;
}

// ── Streetview ──────────────────────────────────────────────────────────────

const STREETVIEW_PARAMS = [
  'location', 'pano', 'size', 'heading', 'pitch', 'fov', 'radius', 'source', 'return_error_code',
] as const;

export async function fetchStreetview(
  query: Record<string, string | undefined>
): Promise<UpstreamResult> {
  const cfg = getConfig();
  const params = passQuery(query, STREETVIEW_PARAMS);
  if (!params.has('size')) params.set('size', '600x400');
  params.set('key', cfg.googleMapsApiKey);

  const url = `${cfg.upstream.streetview}?${params.toString()}`;
  const response = await fetch(url, { signal: timeoutSignal(cfg.upstreamTimeoutMs) });
  return { response, redactedUrl: redactKey(url) };
}

// ── Streetview Metadata (FREE per Google's pricing) ─────────────────────────
//
// Returns JSON like { status: "OK", ... } if imagery exists, or
// { status: "ZERO_RESULTS" } if there's no Street View pano near the
// requested coordinates. Free to call (no Google charges, $0 USDC.e
// because we expose this as a non-paid route on the reseller).
//
// Use this to skip the paid /maps/streetview call entirely for ~60% of
// Austin residential addresses, which return Google's tiny placeholder
// instead of real imagery.

const STREETVIEW_METADATA_PARAMS = ['location', 'pano', 'size', 'radius', 'source'] as const;

export async function fetchStreetviewMetadata(
  query: Record<string, string | undefined>
): Promise<UpstreamResult> {
  const cfg = getConfig();
  const params = passQuery(query, STREETVIEW_METADATA_PARAMS);
  params.set('key', cfg.googleMapsApiKey);

  // Same base path as the paid endpoint, just with /metadata appended.
  const url = `${cfg.upstream.streetview}/metadata?${params.toString()}`;
  const response = await fetch(url, { signal: timeoutSignal(cfg.upstreamTimeoutMs) });
  return { response, redactedUrl: redactKey(url) };
}

// ── Text Search (legacy Places API) ─────────────────────────────────────────

const TEXTSEARCH_PARAMS = [
  'query', 'location', 'radius', 'minprice', 'maxprice', 'opennow',
  'pagetoken', 'region', 'type', 'language',
] as const;

export async function fetchTextSearch(
  query: Record<string, string | undefined>
): Promise<UpstreamResult> {
  const cfg = getConfig();
  const params = passQuery(query, TEXTSEARCH_PARAMS);
  if (!params.has('query')) params.set('query', 'austin tx');
  params.set('key', cfg.googleMapsApiKey);

  const url = `${cfg.upstream.textsearch}?${params.toString()}`;
  const response = await fetch(url, { signal: timeoutSignal(cfg.upstreamTimeoutMs) });
  return { response, redactedUrl: redactKey(url) };
}

// ── Place Photo (Places API New) ────────────────────────────────────────────
//
// URL pattern: /v1/places/{placeId}/photos/{photoResource}/media
// Query params: maxWidthPx, maxHeightPx, skipHttpRedirect

const PHOTO_PARAMS = ['maxWidthPx', 'maxHeightPx', 'skipHttpRedirect'] as const;

export async function fetchPlacePhoto(
  placeId: string,
  photoResource: string,
  query: Record<string, string | undefined>
): Promise<UpstreamResult> {
  const cfg = getConfig();
  const params = passQuery(query, PHOTO_PARAMS);
  if (!params.has('maxWidthPx')) params.set('maxWidthPx', '600');
  params.set('key', cfg.googleMapsApiKey);

  // The placeId in the new Places API can be either a bare ID or a full
  // resource name like "places/ChIJ...". Normalize to bare ID.
  const cleanPlaceId = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
  // Same for the photo resource.
  const cleanPhoto = photoResource.includes('/photos/')
    ? photoResource.split('/photos/').pop()!
    : photoResource;

  const url = `${cfg.upstream.placesNew}/v1/places/${encodeURIComponent(cleanPlaceId)}/photos/${encodeURIComponent(cleanPhoto)}/media?${params.toString()}`;
  const response = await fetch(url, { signal: timeoutSignal(cfg.upstreamTimeoutMs) });
  return { response, redactedUrl: redactKey(url) };
}
