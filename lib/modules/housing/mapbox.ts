import { cachedMppCall, getCached } from '@/lib/mpp-client';

const MAPBOX_BASE = 'https://mapbox.mpp.paywithlocus.com';

// ── Geocode ──

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const cacheKey = `geocode:${address.toLowerCase().trim()}`;

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Try free Nominatim first before spending money
  const freeResult = await geocodeNominatim(address);
  if (freeResult) {
    // Cache the free result too (so we don't even hit Nominatim again)
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO mpp_cache (cache_key, endpoint, response, cost_usd, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(cacheKey, 'nominatim', JSON.stringify(freeResult), 0, null);
    return freeResult;
  }

  // Fall back to Mapbox via MPP
  const data = await cachedMppCall({
    url: `${MAPBOX_BASE}/mapbox/geocode-forward`,
    body: { q: address },
    cacheKey,
    service: 'Mapbox',
    module: 'housing',
    endpoint: '/mapbox/geocode-forward',
    expiresInDays: null, // never expires
  });

  const result = parseMapboxGeocodeResponse(data);
  return result;
}

async function geocodeNominatim(address: string): Promise<GeocodeResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      {
        headers: { 'User-Agent': 'Talaria/1.0' },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await res.json();
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name ?? address,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseMapboxGeocodeResponse(data: unknown): GeocodeResult | null {
  // Mapbox returns features with center coordinates
  const d = data as Record<string, unknown>;
  const features = (d.features ?? d.results ?? []) as Array<{
    center?: [number, number];
    geometry?: { coordinates: [number, number] };
    place_name?: string;
  }>;

  if (features.length > 0) {
    const f = features[0];
    const coords = f.center ?? f.geometry?.coordinates;
    if (coords) {
      return {
        lat: coords[1],
        lng: coords[0],
        displayName: f.place_name ?? '',
      };
    }
  }
  return null;
}

// ── Isochrone (via Valhalla — free, no API key) ──

export interface IsochroneResult {
  polygon: [number, number][];
  driveMinutes: number;
}

export async function fetchIsochrone(
  lat: number,
  lng: number,
  minutes: number,
  mode: string = 'auto'
): Promise<IsochroneResult | null> {
  const cacheKey = `isochrone:${lat.toFixed(4)},${lng.toFixed(4)},${minutes},${mode}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Use Valhalla public server (free, no API key)
  const params = JSON.stringify({
    locations: [{ lat, lon: lng }],
    costing: mode,
    contours: [{ time: minutes }],
    polygons: true,
  });

  try {
    const res = await fetch(
      `https://valhalla1.openstreetmap.de/isochrone?json=${encodeURIComponent(params)}`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) throw new Error(`Valhalla ${res.status}`);

    const data = await res.json();
    const result = parseValhallaResponse(data, minutes);

    if (result) {
      // Cache forever (address + time combo doesn't change)
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      db.prepare(
        `INSERT OR REPLACE INTO mpp_cache (cache_key, endpoint, response, cost_usd, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(cacheKey, 'valhalla', JSON.stringify(result), 0, null);
    }

    return result;
  } catch (err) {
    console.error('Valhalla isochrone failed:', err);
    return null;
  }
}

function parseValhallaResponse(data: unknown, minutes: number): IsochroneResult | null {
  const d = data as { features?: Array<{ geometry?: { coordinates: number[][][] } }> };

  if (d.features?.[0]?.geometry?.coordinates?.[0]) {
    const coords = d.features[0].geometry.coordinates[0];
    // Valhalla returns [lng, lat], Leaflet needs [lat, lng]
    const polygon: [number, number][] = coords.map((c) => [c[1], c[0]]);
    return { polygon, driveMinutes: minutes };
  }
  return null;
}
