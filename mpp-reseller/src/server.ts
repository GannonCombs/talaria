/**
 * mpp-reseller — local MPP reseller for Google Maps endpoints.
 *
 * Two Mppx instances at startup:
 *   - mppxConfirmed: tempo.charge with waitForConfirmation: true (matches
 *     Locus/direct baseline behavior — should land at the ~4.5s floor)
 *   - mppxFast:      tempo.charge with waitForConfirmation: false (skips
 *     on-chain wait, simulates + broadcasts only — should be faster)
 *
 * Three Google Maps endpoints, each mounted on both mppx instances:
 *   /maps/streetview                       (confirmed)
 *   /maps/place/textsearch/json            (confirmed)
 *   /places/v1/places/:id/photos/:photo/media (confirmed)
 *   /fast/maps/streetview                  (fast)
 *   /fast/maps/place/textsearch/json       (fast)
 *   /fast/places/v1/places/:id/photos/:photo/media (fast)
 *
 * The flat URL shape (no /gmaps/ prefix) is required so the Round 1 harness
 * can add a single catalog entry for each endpoint.
 *
 * Run from mpp-reseller directory:
 *   npm start
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Mppx, tempo } from 'mppx/hono';
import { getConfig } from './config.js';
import { loadWallet, shortAddress } from './wallet.js';
import {
  fetchStreetview,
  fetchStreetviewMetadata,
  fetchTextSearch,
  fetchPlacePhoto,
} from './upstream.js';
import {
  timed,
  markHandlerEntry,
  markPhase,
  recordUpstream,
  recordError,
  getRecentRecords,
} from './instrumentation.js';
import type { Context } from 'hono';

// ── Boot ────────────────────────────────────────────────────────────────────

const config = getConfig();
const wallet = loadWallet();

// Two mppx instances. Same wallet, same currency, same chain — only
// waitForConfirmation differs. This is the controlled experiment.
const mppxConfirmed = Mppx.create({
  realm: 'mpp-reseller-local',
  secretKey: config.mppSecretKey,
  methods: [
    tempo.charge({
      currency: config.chain.usdcE,
      recipient: wallet.address,
      decimals: config.chain.decimals,
      waitForConfirmation: true,
    }),
  ],
});

const mppxFast = Mppx.create({
  realm: 'mpp-reseller-local-fast',
  secretKey: config.mppSecretKey,
  methods: [
    tempo.charge({
      currency: config.chain.usdcE,
      recipient: wallet.address,
      decimals: config.chain.decimals,
      waitForConfirmation: false,
    }),
  ],
});

// ── Hono app ────────────────────────────────────────────────────────────────

const app = new Hono();

// Health
app.get('/health', (c) =>
  c.json({
    ok: true,
    address: wallet.address,
    chain: config.chain.name,
    chainId: config.chain.id,
    gmapsKeyPresent: !!config.googleMapsApiKey,
    finnhubKeyPresent: !!config.finnhubApiKey,
    resyKeyPresent: !!config.resyApiKey,
    modes: ['confirmed', 'fast'],
  })
);

// /internal/recent — last N NDJSON records, localhost only
app.get('/internal/recent', (c) => {
  const host = c.req.header('host') ?? '';
  if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    return c.json({ error: 'forbidden — internal endpoint' }, 403);
  }
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  return c.json({ count: ring().length, records: getRecentRecords(limit) });
});

function ring(): unknown[] {
  return getRecentRecords(1_000_000);
}

// ── Route handlers (framework-agnostic logic, used by both modes) ───────────

async function streetviewHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    markPhase(c, 'T2');
    const { response, redactedUrl } = await fetchStreetview(
      Object.fromEntries(new URL(c.req.url).searchParams)
    );
    markPhase(c, 'T3');
    const buf = await response.arrayBuffer();
    markPhase(c, 'T4');
    recordUpstream(c, redactedUrl, response.status, buf.byteLength);
    const out = new Response(buf, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'image/jpeg',
        'content-length': String(buf.byteLength),
      },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

// Free passthrough — Google charges $0 for the streetview metadata endpoint,
// so the reseller exposes it without an mppx payment middleware. Used by
// Talaria's listing-photo path to skip the paid /maps/streetview call when
// Google says ZERO_RESULTS for the requested coordinates (~60% of Austin
// residential addresses, per the Round 3 Phase D experiment).
async function streetviewMetadataHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    markPhase(c, 'T2');
    const { response, redactedUrl } = await fetchStreetviewMetadata(
      Object.fromEntries(new URL(c.req.url).searchParams)
    );
    markPhase(c, 'T3');
    const text = await response.text();
    markPhase(c, 'T4');
    recordUpstream(c, redactedUrl, response.status, text.length);
    const out = new Response(text, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

async function textsearchHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    markPhase(c, 'T2');
    const { response, redactedUrl } = await fetchTextSearch(
      Object.fromEntries(new URL(c.req.url).searchParams)
    );
    markPhase(c, 'T3');
    const text = await response.text();
    markPhase(c, 'T4');
    recordUpstream(c, redactedUrl, response.status, text.length);
    const out = new Response(text, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

async function photoHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    const placeId = c.req.param('placeId');
    const photoId = c.req.param('photoId');
    if (!placeId || !photoId) {
      recordError(c, 'missing placeId/photoId');
      markPhase(c, 'T5');
      return c.json({ error: 'missing placeId or photoId' }, 400);
    }
    markPhase(c, 'T2');
    const { response, redactedUrl } = await fetchPlacePhoto(
      placeId,
      photoId,
      Object.fromEntries(new URL(c.req.url).searchParams)
    );
    markPhase(c, 'T3');
    const buf = await response.arrayBuffer();
    markPhase(c, 'T4');
    recordUpstream(c, redactedUrl, response.status, buf.byteLength);
    const out = new Response(buf, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'image/jpeg',
        'content-length': String(buf.byteLength),
      },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

// ── Free passthrough routes (no MPP payment middleware) ────────────────────

// Streetview metadata — Google charges $0 for this endpoint. Used by Talaria
// to skip the paid streetview call when Google says ZERO_RESULTS, which
// happens for ~60% of Austin residential addresses (Round 3 Phase D finding).
app.get(
  '/maps/streetview/metadata',
  timed('streetview-metadata', 'free'),
  streetviewMetadataHandler
);

// ── Route handler — Resy (search + availability) ────────────────────────────

// Resy/Imperva CDN blocks requests without a browser User-Agent
const RESY_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15';

// Resy venue search — POST /3/venuesearch/search
async function resySearchHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    if (!config.resyApiKey || !config.resyAuthToken) {
      recordError(c, 'no RESY credentials');
      markPhase(c, 'T5');
      return c.json({ error: 'Resy API credentials not configured' }, 500);
    }

    const params = new URL(c.req.url).searchParams;
    const lat = parseFloat(params.get('lat') ?? '30.2672');
    const long = parseFloat(params.get('long') ?? '-97.7431');
    const query = params.get('query') ?? '';
    const perPage = parseInt(params.get('per_page') ?? '10', 10);

    const url = `${config.upstream.resy}/3/venuesearch/search`;
    const body = JSON.stringify({
      geo: { latitude: lat, longitude: long },
      query,
      per_page: perPage,
      page: 1,
      types: ['venue'],
    });

    markPhase(c, 'T2');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ResyAPI api_key="${config.resyApiKey}"`,
        'X-Resy-Auth-Token': config.resyAuthToken,
        'X-Resy-Universal-Auth': config.resyAuthToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Origin': 'https://resy.com',
        'Referer': 'https://resy.com/',
        'User-Agent': RESY_UA,
      },
      body,
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    markPhase(c, 'T3');
    const text = await response.text();
    markPhase(c, 'T4');
    recordUpstream(c, 'api.resy.com/3/venuesearch/search', response.status, text.length);
    const out = new Response(text, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

// Resy availability — POST /4/find with JSON body
async function resyAvailabilityHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    if (!config.resyApiKey || !config.resyAuthToken) {
      recordError(c, 'no RESY credentials');
      markPhase(c, 'T5');
      return c.json({ error: 'Resy API credentials not configured' }, 500);
    }

    const params = new URL(c.req.url).searchParams;
    const venueId = parseInt(params.get('venue_id') ?? '0', 10);
    const day = params.get('day') ?? new Date().toISOString().split('T')[0];
    const partySize = parseInt(params.get('party_size') ?? '2', 10);

    const url = `${config.upstream.resy}/4/find`;
    const body = JSON.stringify({
      lat: 0,
      long: 0,
      day,
      party_size: partySize,
      venue_id: venueId,
    });

    markPhase(c, 'T2');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ResyAPI api_key="${config.resyApiKey}"`,
        'X-Resy-Auth-Token': config.resyAuthToken,
        'X-Resy-Universal-Auth': config.resyAuthToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Origin': 'https://resy.com',
        'Referer': 'https://resy.com/',
        'User-Agent': RESY_UA,
      },
      body,
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    markPhase(c, 'T3');
    const text = await response.text();
    markPhase(c, 'T4');
    if (!response.ok) {
      console.error(`[resy-availability] Resy returned ${response.status} for venue ${venueId} day=${day} party=${partySize}: ${text.slice(0, 200)}`);
    }
    recordUpstream(c, `api.resy.com/4/find (venue ${venueId})`, response.status, text.length);
    const out = new Response(text, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

// ── Route handler — Finnhub quote ───────────────────────────────────────────

async function quoteHandler(c: Context): Promise<Response> {
  markHandlerEntry(c);
  try {
    const symbol = c.req.query('symbol');
    if (!symbol) {
      recordError(c, 'missing symbol');
      markPhase(c, 'T5');
      return c.json({ error: 'missing ?symbol= query param' }, 400);
    }
    if (!config.finnhubApiKey) {
      recordError(c, 'no FINNHUB_API_KEY');
      markPhase(c, 'T5');
      return c.json({ error: 'Finnhub API key not configured' }, 500);
    }
    markPhase(c, 'T2');
    const url = `${config.upstream.finnhubQuote}?symbol=${encodeURIComponent(symbol)}&token=${config.finnhubApiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(config.upstreamTimeoutMs) });
    markPhase(c, 'T3');
    const text = await response.text();
    markPhase(c, 'T4');
    recordUpstream(c, `finnhub.io/api/v1/quote?symbol=${symbol}`, response.status, text.length);
    const out = new Response(text, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
    markPhase(c, 'T5');
    return out;
  } catch (err) {
    recordError(c, (err as Error).message);
    markPhase(c, 'T5');
    return c.json({ error: 'upstream failed', message: (err as Error).message }, 502);
  }
}

// ── Routes — confirmed mode ─────────────────────────────────────────────────

app.get(
  '/maps/streetview',
  timed('streetview', 'confirmed'),
  mppxConfirmed.charge({ amount: config.prices.streetview, description: 'Google Streetview (confirmed)' }),
  streetviewHandler
);

app.get(
  '/maps/place/textsearch/json',
  timed('textsearch', 'confirmed'),
  mppxConfirmed.charge({ amount: config.prices.textsearch, description: 'Google Places Text Search (confirmed)' }),
  textsearchHandler
);

app.get(
  '/places/v1/places/:placeId/photos/:photoId/media',
  timed('photo', 'confirmed'),
  mppxConfirmed.charge({ amount: config.prices.photo, description: 'Google Places Photo (confirmed)' }),
  photoHandler
);

// ── Route — Finnhub stock quote ─────────────────────────────────────────────

app.get(
  '/quote',
  timed('quote', 'confirmed'),
  mppxConfirmed.charge({ amount: config.prices.quote, description: 'Finnhub Stock Quote' }),
  quoteHandler
);

// ── Routes — Resy restaurant search + availability ──────────────────────────

app.get(
  '/resy/search',
  timed('resy-search', 'confirmed'),
  mppxConfirmed.charge({ amount: config.prices.resySearch, description: 'Resy Venue Search' }),
  resySearchHandler
);

app.get(
  '/resy/availability',
  timed('resy-availability', 'confirmed'),
  mppxConfirmed.charge({ amount: config.prices.resyAvailability, description: 'Resy Availability' }),
  resyAvailabilityHandler
);

// ── Routes — fast mode (waitForConfirmation: false) ─────────────────────────

app.get(
  '/fast/maps/streetview',
  timed('streetview', 'fast'),
  mppxFast.charge({ amount: config.prices.streetview, description: 'Google Streetview (fast)' }),
  streetviewHandler
);

app.get(
  '/fast/maps/place/textsearch/json',
  timed('textsearch', 'fast'),
  mppxFast.charge({ amount: config.prices.textsearch, description: 'Google Places Text Search (fast)' }),
  textsearchHandler
);

app.get(
  '/fast/places/v1/places/:placeId/photos/:photoId/media',
  timed('photo', 'fast'),
  mppxFast.charge({ amount: config.prices.photo, description: 'Google Places Photo (fast)' }),
  photoHandler
);

// ── Listen ──────────────────────────────────────────────────────────────────

serve({ fetch: app.fetch, hostname: config.hostname, port: config.port }, (info) => {
  const apiKeyHint = config.googleMapsApiKey.slice(-4);
  const today = new Date().toISOString().slice(0, 10);
  console.log('');
  console.log(`mpp-reseller listening on http://${info.address}:${info.port}`);
  console.log('─────────────────────────────────────────────────');
  console.log(`Reseller wallet: ${wallet.address}  (${shortAddress(wallet.address)})`);
  console.log(`Tempo chain:     mainnet (${config.chain.id})`);
  console.log(`USDC.e contract: ${config.chain.usdcE}`);
  console.log(`Modes:           confirmed (/maps/...)  +  fast (/fast/maps/...)`);
  console.log(`GMaps API key:   present (last 4: ...${apiKeyHint})`);
  console.log(`Logs:            ${config.logDir}/${today}.ndjson`);
  console.log('─────────────────────────────────────────────────');
  console.log('');
  console.log("NEVER SHARE THIS WALLET'S PRIVATE KEY. It lives at:");
  console.log('  mpp-reseller/keys/reseller-wallet.json');
  console.log('Back it up before funding.');
  console.log('');
});
