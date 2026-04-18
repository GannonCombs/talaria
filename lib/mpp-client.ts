// Server-side MPP client. Wraps mppx/client + viem so any server route
// can call paid MPP endpoints natively. Returns real Response objects,
// so callers can `.arrayBuffer()` or `.blob()` the result.
//
// Strict server-only — never import from a client component. The wallet
// private key is read from the OS keychain (see lib/security/keychain.ts)
// and never leaves Node.

// Server-only by virtue of node:fs/path/os imports — Next won't bundle
// these to the client. Do not import this module from client components.
import { Mppx, tempo } from 'mppx/client';
import { privateKeyToAccount } from 'viem/accounts';
import { dbGet, dbRun } from './db';
import { logMppTransaction, reserveTransaction, completeTransaction, failTransaction } from './mpp';
import { KeychainManager } from './security/keychain';
import { SpendLimits } from './security/limits';
import { ApprovalManager } from './security/approval';
import { estimateCost } from './security/costs';

// ── DIAGNOSTIC: per-fetch timing wrapper ─────────────────────────────────
//
// We installed this to investigate why a single Street View call was
// taking 16+ seconds. mppx + viem make multiple fetch() calls under
// the hood (RPC submits, receipt polls, the resource roundtrip itself)
// and the only way to see the breakdown is to wrap globalThis.fetch
// before mppx is built.
//
// Each fetch logs: method, host+path (truncated), duration in ms,
// and HTTP status. Looks like:
//   [fetch:1843ms 200] POST rpc.tempo.xyz/
//   [fetch:489ms 200] GET googlemaps.mpp.tempo.xyz/maps/streetview?...
//
// Wrapper is idempotent — second import doesn't re-wrap.
//
// Once we know where the time goes, this can stay (it's noise but cheap)
// or be removed.

const FETCH_WRAPPED = Symbol.for('talaria.mpp.fetch.wrapped');
type WrappableGlobal = typeof globalThis & { [FETCH_WRAPPED]?: boolean };

function installFetchTiming(): void {
  const g = globalThis as WrappableGlobal;
  if (g[FETCH_WRAPPED]) return;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? 'GET';

    // Compact display: drop scheme, truncate query strings to keep
    // logs scannable.
    let display = url.replace(/^https?:\/\//, '');
    if (display.length > 80) display = display.slice(0, 77) + '...';

    const start = performance.now();
    let status: number | string = '?';
    try {
      const res = await original(input, init);
      status = res.status;
      return res;
    } finally {
      const ms = (performance.now() - start).toFixed(0).padStart(5, ' ');
      console.log(`[fetch:${ms}ms ${status}] ${method} ${display}`);
    }
  }) as typeof fetch;
  g[FETCH_WRAPPED] = true;
}

// Install before any mppx code runs.
installFetchTiming();

// ────────────────────────────────────────────────────────────────────────

let _clientPromise: Promise<ReturnType<typeof Mppx.create>> | null = null;

async function buildClient() {
  const privateKey = await KeychainManager.getEvmKey();
  if (!privateKey) {
    throw new Error(
      'No EVM key found in keychain. Run: npx tsx scripts/migrate-wallet.ts'
    );
  }
  const hex = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(hex);
  return Mppx.create({
    polyfill: false,
    methods: [tempo({ account })],
  });
}

function getMppxClient() {
  if (!_clientPromise) _clientPromise = buildClient();
  return _clientPromise;
}

// ── Error types ─────────────────────────────────────────────────────────

export class SpendLimitError extends Error {
  constructor(public errors: string[]) {
    super(`Spend limit exceeded: ${errors.join('; ')}`);
    this.name = 'SpendLimitError';
  }
}

export class ApprovalDeniedError extends Error {
  constructor(service?: string) {
    super(`Payment approval denied${service ? ` for ${service}` : ''}`);
    this.name = 'ApprovalDeniedError';
  }
}

// ── Paid fetch with approval gate ───────────────────────────────────────

export interface PaidFetchOptions {
  service?: string;       // 'RentCast', 'Mapbox', etc.
  module?: string;        // 'housing', 'portfolio', etc.
  endpoint?: string;      // '/rentcast/sale-listings', etc.
  estimatedCost?: number; // Override cost estimate (USD)
}

function extractServiceName(url: string): string {
  try {
    const host = new URL(url).hostname;
    // 'rentcast.mpp.paywithlocus.com' → 'RentCast'
    const first = host.split('.')[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return 'Unknown';
  }
}

// Approval-gated paid fetch. Validates spending limits, requests
// biometric approval (if configured), reserves a pending transaction,
// then executes the MPP payment. On failure, marks the transaction failed.
export async function paidFetch(
  url: string,
  init?: RequestInit,
  opts?: PaidFetchOptions,
): Promise<Response> {
  const cost = opts?.estimatedCost ?? estimateCost(url);

  // 1. Validate against hard limits
  const validation = await SpendLimits.validateTransaction(cost);
  if (!validation.valid) {
    throw new SpendLimitError(validation.errors);
  }

  // 2. Request approval (may trigger Touch ID)
  const approval = await ApprovalManager.requestApproval({
    amount: cost,
    merchantName: opts?.service ?? extractServiceName(url),
    description: opts?.endpoint ?? url,
    rail: 'stablecoin',
  });
  if (!approval.approved) {
    throw new ApprovalDeniedError(opts?.service ?? extractServiceName(url));
  }

  // 3. Reserve transaction (pending — counts toward daily limits)
  const txId = await reserveTransaction({
    service: opts?.service ?? extractServiceName(url),
    module: opts?.module ?? 'unknown',
    endpoint: opts?.endpoint,
    estimatedCostUsd: cost,
  });

  // 4. Execute payment
  try {
    const client = await getMppxClient();
    const res = await client.fetch(url, init);
    await completeTransaction(txId, cost);
    return res;
  } catch (e) {
    await failTransaction(txId);
    throw e;
  }
}

// ── Cache (legacy JSON-call helper used by mapbox.ts) ──
//
// Kept for backward compatibility with existing call sites. New code
// that needs binary or fine-grained control should use paidFetch directly.

interface CacheEntry {
  cache_key: string;
  endpoint: string;
  response: string;
  cost_usd: number;
  created_at: string;
  expires_at: string | null;
}

export async function getCached(cacheKey: string): Promise<string | null> {
  const row = await dbGet<Pick<CacheEntry, 'response' | 'expires_at'>>(
    `SELECT response, expires_at FROM mpp_cache WHERE cache_key = ?`,
    cacheKey
  );

  if (!row) return null;

  if (row.expires_at) {
    const expires = new Date(row.expires_at).getTime();
    if (Date.now() > expires) {
      await dbRun('DELETE FROM mpp_cache WHERE cache_key = ?', cacheKey);
      return null;
    }
  }

  return row.response;
}

async function setCache(
  cacheKey: string,
  endpoint: string,
  response: string,
  costUsd: number,
  expiresAt: string | null
): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO mpp_cache (cache_key, endpoint, response, cost_usd, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    cacheKey, endpoint, response, costUsd, expiresAt
  );
}

export interface CachedMppCallOptions {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
  cacheKey: string;
  service: string;
  module: string;
  endpoint: string;
  expiresInDays?: number | null; // null = never expires
}

// JSON-only convenience wrapper around paidFetch + caching. For text
// endpoints (geocoding, search, etc.). Returns parsed JSON.
export async function cachedMppCall(opts: CachedMppCallOptions): Promise<unknown> {
  const cached = await getCached(opts.cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const res = await paidFetch(opts.url, {
    method: opts.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`MPP: ${opts.url} returned ${res.status}`);
  }

  const data = await res.json();
  const responseStr = JSON.stringify(data);

  // Reading the cost from the X-Payment-Receipt header would be cleaner
  // but mppx exposes it via Receipt.fromResponse(). For now we trust the
  // caller to know the price; pass it via metadata if needed.
  // We'll log a placeholder cost of 0 here and let direct paidFetch
  // callers do their own logMppTransaction with the real cost.
  const expiresAt = opts.expiresInDays !== undefined && opts.expiresInDays !== null
    ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  await setCache(opts.cacheKey, opts.endpoint, responseStr, 0, expiresAt);

  await logMppTransaction({
    service: opts.service,
    module: opts.module,
    endpoint: opts.endpoint,
    rail: 'tempo',
    costUsd: 0, // legacy path doesn't surface the actual price
    metadata: { via: 'usdc', cacheKey: opts.cacheKey },
  });

  return data;
}

// Preview the cost of an MPP endpoint without paying. Reads the 402
// challenge and decodes the amount. Returns null if the endpoint is
// free, doesn't speak MPP, or refuses to issue a challenge.
export async function previewMppCost(url: string, body?: Record<string, unknown>): Promise<{
  costUsd: number;
  intent: string;
  method: string;
} | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    if (res.status !== 402) return null;

    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    // Quick parse — just enough to surface cost in the UI before paying.
    const intent = wwwAuth.match(/intent="([^"]+)"/)?.[1] ?? '';
    const method = wwwAuth.match(/method="([^"]+)"/)?.[1] ?? '';
    const requestB64 = wwwAuth.match(/request="([^"]+)"/)?.[1];
    if (!requestB64) return null;
    const decoded = JSON.parse(Buffer.from(requestB64, 'base64url').toString());

    return {
      costUsd: Number(decoded.amount) / 1e6,
      intent,
      method,
    };
  } catch {
    return null;
  }
}
