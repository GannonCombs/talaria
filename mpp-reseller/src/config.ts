/**
 * Frozen runtime configuration loaded from environment variables.
 *
 * Loaded once at server startup. Missing required values throw a loud error
 * BEFORE the server attempts to listen — fail closed.
 *
 * Env vars are loaded via `node --env-file=.env` (Node 20.6+ built-in).
 * No `dotenv` dependency.
 */

const TEMPO_USDC_E = '0x20C000000000000000000000b9537d11c60E8b50' as const;
const TEMPO_CHAIN_ID = 4217;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '' || value.startsWith('REPLACE_ME') || value.startsWith('AIza_REPLACE')) {
    throw new Error(
      `Missing required env var: ${name}\n` +
      `  Copy mpp-reseller/.env.example to mpp-reseller/.env and fill in real values.\n` +
      `  See mpp-reseller/README.md for the GOOGLE_MAPS_API_KEY walkthrough.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function buildConfig() {
  const googleMapsApiKey = required('GOOGLE_MAPS_API_KEY');
  const finnhubApiKey = optional('FINNHUB_API_KEY', '');
  const resyApiKey = optional('RESY_API_KEY', '');
  const resyAuthToken = optional('RESY_AUTH_TOKEN', '');
  const mppSecretKey = required('MPP_SECRET_KEY');
  const port = parseInt(optional('RESELLER_PORT', '8787'), 10);
  const logDir = optional('LOG_DIR', './logs');

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid RESELLER_PORT: ${process.env.RESELLER_PORT}`);
  }

  return Object.freeze({
    googleMapsApiKey,
    finnhubApiKey,
    resyApiKey,
    resyAuthToken,
    mppSecretKey,
    port,
    hostname: '127.0.0.1' as const,
    logDir,
    chain: Object.freeze({
      id: TEMPO_CHAIN_ID,
      name: 'tempo' as const,
      usdcE: TEMPO_USDC_E,
      decimals: 6,
    }),
    // Per-endpoint pricing in WHOLE USD (mppx multiplies by 10^decimals
    // internally before emitting the on-chain smallest-unit amount in the
    // 402 challenge). $0.001 per call.
    //
    // GOTCHA: do NOT pass smallest-unit values here. mppx's tempo.charge()
    // accepts the human-readable currency value as a string. Passing '1000'
    // means $1000 per call, not $0.001 — verified empirically when an
    // earlier version emitted amount=1000000000 (= $1000) in the challenge.
    prices: Object.freeze({
      streetview: '0.001',
      textsearch: '0.001',
      photo: '0.001',
      quote: '0.001',
      resySearch: '0.001',
      resyAvailability: '0.001',
    }),
    // Upstream Google Maps base URLs
    upstream: Object.freeze({
      streetview: 'https://maps.googleapis.com/maps/api/streetview',
      textsearch: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
      // Places API (new) — different host. Photo media path is templated.
      placesNew: 'https://places.googleapis.com',
      finnhubQuote: 'https://finnhub.io/api/v1/quote',
      resy: 'https://api.resy.com',
    }),
    // Upstream fetch timeout — protects the reseller from hung Google calls
    upstreamTimeoutMs: 15_000,
  });
}

export type Config = ReturnType<typeof buildConfig>;

// Lazy-init so importing this module doesn't crash before env is loaded
let cached: Config | null = null;
export function getConfig(): Config {
  if (!cached) cached = buildConfig();
  return cached;
}
