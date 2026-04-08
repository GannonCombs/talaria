/**
 * Endpoint catalog for the MPP latency harness.
 *
 * Each entry MUST have been verified as `charge` intent (not `session`) before
 * being added. Source of truth: docs/mpp-endpoints.md.
 *
 * Sub-caps are enforced by budget.ts before every paid call.
 */

import type { ServiceConfig } from './runner';

export interface CatalogEntry {
  config: ServiceConfig;
  /** Hard per-service cap. Aborts the sweep if cumulative spend on this service exceeds it. */
  subCapUsd: number;
  /** Default sample size for measurement runs. */
  defaultSamples: number;
}

export const SERVICES: Record<string, CatalogEntry> = {
  // ── Locus-proxied (charge intent, Tempo USDC.e) ──

  'openweather-current': {
    config: {
      id: 'openweather-current',
      proxyClass: 'locus',
      url: 'https://openweather.mpp.paywithlocus.com/openweather/current-weather',
      method: 'POST',
      body: { lat: 30.27, lon: -97.74 }, // Austin
      expectedCostUsd: 0.006,
    },
    subCapUsd: 0.10,
    defaultSamples: 3,
  },

  'timezone-current': {
    config: {
      id: 'timezone-current',
      proxyClass: 'locus',
      url: 'https://abstract-timezone.mpp.paywithlocus.com/abstract-timezone/current-time',
      method: 'POST',
      body: { location: 'Austin, TX' },
      expectedCostUsd: 0.006,
    },
    subCapUsd: 0.10,
    defaultSamples: 3,
  },

  'mapbox-geocode': {
    config: {
      id: 'mapbox-geocode',
      proxyClass: 'locus',
      url: 'https://mapbox.mpp.paywithlocus.com/mapbox/geocode-forward',
      method: 'POST',
      body: { q: 'Austin, TX' },
      expectedCostUsd: 0.0037,
    },
    subCapUsd: 0.05,
    defaultSamples: 3,
  },

  'rentcast-markets': {
    config: {
      id: 'rentcast-markets',
      proxyClass: 'locus',
      url: 'https://rentcast.mpp.paywithlocus.com/rentcast/markets',
      method: 'POST',
      body: { zipCode: '78704' }, // /markets is per-zip, not per-city
      expectedCostUsd: 0.033,
    },
    subCapUsd: 0.30,
    defaultSamples: 2, // expensive — minimum needed to split cold/warm
  },

  // ── Direct (Alchemy: not behind a third-party proxy) ──

  'alchemy-rpc': {
    config: {
      id: 'alchemy-rpc',
      proxyClass: 'direct',
      url: 'https://mpp.alchemy.com/eth-mainnet/v2',
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
      expectedCostUsd: 0.001, // catalog said $0.0001, live preflight says $0.001 (docs stale)
    },
    subCapUsd: 0.05,
    defaultSamples: 10, // cheapest — clean control distribution
  },

  // Same upstream as alchemy-rpc, but routed through Tempo's own proxy.
  // This is the controlled experiment for "is Tempo's proxy class
  // structurally slow?" — same Alchemy eth_blockNumber call, same chain,
  // only the proxy operator differs.
  'alchemy-tempo': {
    config: {
      id: 'alchemy-tempo',
      proxyClass: 'tempo',
      url: 'https://alchemy.mpp.tempo.xyz/eth-mainnet/v2',
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
      expectedCostUsd: 0.0001, // 10× cheaper than the direct alchemy proxy
    },
    subCapUsd: 0.02,
    defaultSamples: 10,
  },

  // ── Tempo-hosted proxies (the suspect class — Google Maps lives here) ──
  // URLs from yesterday's session. Bodies marked TBD will be discovered
  // empirically on the first attempt; the sweep handles 4xx gracefully.

  'gmaps-streetview': {
    config: {
      id: 'gmaps-streetview',
      proxyClass: 'tempo',
      // Legacy Google Maps Static Street View API — GET with query params.
      url: 'https://googlemaps.mpp.tempo.xyz/maps/streetview?size=600x400&location=30.2672,-97.7431&fov=80&heading=70&pitch=0',
      method: 'GET',
      expectedCostUsd: 0.008,
    },
    subCapUsd: 0.05,
    defaultSamples: 3,
  },

  'gmaps-textsearch': {
    config: {
      id: 'gmaps-textsearch',
      proxyClass: 'tempo',
      // Legacy Google Places Text Search — GET with query params.
      // Live preflight: $0.032 (Google's wholesale Places price, not $0.008).
      url: 'https://googlemaps.mpp.tempo.xyz/maps/place/textsearch/json?query=restaurants+in+Austin+TX',
      method: 'GET',
      expectedCostUsd: 0.032,
    },
    subCapUsd: 0.20, // 5 samples × $0.032 = $0.16, plus 1 seed for photo chain
    defaultSamples: 3, // expensive — keep small
  },

  // gmaps-place-photo is built dynamically inside sweeps/googlemaps.ts because
  // its URL depends on the textsearch response. No static catalog entry.

  // ── Round 2: our own local mpp-reseller ──
  // Same Google Maps upstreams as the gmaps-* entries above, but routed
  // through the locally-hosted mpp-reseller (mpp-reseller/src/server.ts).
  // Each endpoint is exposed in TWO modes:
  //   confirmed = waitForConfirmation: true  (mppx default — matches Locus baseline)
  //   fast      = waitForConfirmation: false (skip on-chain wait)
  // The reseller listens on 127.0.0.1:8787 and must be running before any
  // sweep against these entries.

  'reseller-streetview-confirmed': {
    config: {
      id: 'reseller-streetview-confirmed',
      proxyClass: 'self',
      url: 'http://127.0.0.1:8787/maps/streetview?location=30.2672,-97.7431&size=600x400&fov=80&heading=70&pitch=0',
      method: 'GET',
      expectedCostUsd: 0.001,
    },
    subCapUsd: 0.02,
    defaultSamples: 5,
  },

  'reseller-streetview-fast': {
    config: {
      id: 'reseller-streetview-fast',
      proxyClass: 'self',
      url: 'http://127.0.0.1:8787/fast/maps/streetview?location=30.2672,-97.7431&size=600x400&fov=80&heading=70&pitch=0',
      method: 'GET',
      expectedCostUsd: 0.001,
    },
    subCapUsd: 0.02,
    defaultSamples: 5,
  },

  'reseller-textsearch-confirmed': {
    config: {
      id: 'reseller-textsearch-confirmed',
      proxyClass: 'self',
      url: 'http://127.0.0.1:8787/maps/place/textsearch/json?query=restaurants+in+Austin+TX',
      method: 'GET',
      expectedCostUsd: 0.001,
    },
    subCapUsd: 0.02,
    defaultSamples: 3,
  },

  'reseller-textsearch-fast': {
    config: {
      id: 'reseller-textsearch-fast',
      proxyClass: 'self',
      url: 'http://127.0.0.1:8787/fast/maps/place/textsearch/json?query=restaurants+in+Austin+TX',
      method: 'GET',
      expectedCostUsd: 0.001,
    },
    subCapUsd: 0.02,
    defaultSamples: 3,
  },

  // ── x402 free reads (no payment, isolates protocol overhead) ──

  'agentres-availability': {
    config: {
      id: 'agentres-availability',
      proxyClass: 'x402-base',
      url: 'https://www.agentres.dev/api/availability',
      method: 'GET',
      expectedCostUsd: 0,
      freeEndpoint: true,
    },
    subCapUsd: 0,
    defaultSamples: 10,
  },

  'agentres-search': {
    config: {
      id: 'agentres-search',
      proxyClass: 'x402-base',
      url: 'https://www.agentres.dev/api/search?q=ramen',
      method: 'GET',
      expectedCostUsd: 0,
      freeEndpoint: true,
    },
    subCapUsd: 0,
    defaultSamples: 10,
  },
};

export function getService(id: string): CatalogEntry {
  const entry = SERVICES[id];
  if (!entry) {
    throw new Error(`Unknown service id: ${id}. Known: ${Object.keys(SERVICES).join(', ')}`);
  }
  return entry;
}

export const GLOBAL_CAP_USD = 1.00;
