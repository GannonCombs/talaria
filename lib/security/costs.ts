// Static cost table for known MPP services. Used to estimate the cost of
// an API call before requesting approval — avoids the latency of a live
// 402 preview call for every request.

const KNOWN_COSTS: Record<string, number> = {
  'rentcast.mpp.paywithlocus.com': 0.033,
  'mapbox.mpp.paywithlocus.com/mapbox/geocode-forward': 0.00375,
  'mapbox.mpp.paywithlocus.com/mapbox/isochrone': 0.005,
  'googlemaps.mpp.tempo.xyz': 0.01,
  '127.0.0.1:8787': 0.001, // local mpp-reseller
};

const DEFAULT_COST = 0.05; // conservative fallback for unknown endpoints

export function estimateCost(url: string): number {
  for (const [pattern, cost] of Object.entries(KNOWN_COSTS)) {
    if (url.includes(pattern)) return cost;
  }
  return DEFAULT_COST;
}
