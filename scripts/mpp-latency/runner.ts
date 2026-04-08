/**
 * MPP latency runner — uses the agentcash CLI as the primary call path.
 *
 * Per user direction: "We should always try to use agentcash first if we can.
 * Only if it breaks should we resort to writing our own code." Yesterday's
 * Google Maps test confirmed the CLI does not add meaningful overhead.
 *
 * The CLI is a black box from the outside, so phase splits are limited:
 * we can only time total round-trip per call. CLI startup time is measured
 * once per sweep so the user knows what's baked into every total.
 *
 * previewMppCost is the one exception — it does a direct fetch to read the
 * 402 challenge without paying. The CLI has no "preview without payment"
 * mode, and this lets us catch session intents and verify costs before any
 * paid call.
 */

import { spawnSync } from 'child_process';
import path from 'path';

const AGENTCASH_CLI = path.join(
  process.cwd(),
  'node_modules',
  'agentcash',
  'dist',
  'esm',
  'index.js'
);

const HARNESS_TIMEOUT_MS = 60_000;

// ── Types ──

export interface ServiceConfig {
  id: string;
  proxyClass: 'locus' | 'tempo' | 'direct' | 'x402-base' | 'self';
  url: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
  expectedCostUsd: number;
  freeEndpoint?: boolean;
}

export interface PhaseTiming {
  // Round 1 only measures total round-trip when going through the CLI.
  // The other fields exist for free-endpoint calls (which use direct fetch
  // and can be split) and for forward-compat with Round 2.
  initial_402: number;
  payment: number;
  retry_response: number;
  body: number;
  total: number;
}

export interface CallResult {
  ts: string;
  service: string;
  endpoint: string;
  proxy_class: ServiceConfig['proxyClass'];
  cost_usd: number;
  phases_ms: PhaseTiming;
  tx_hash: string | null;
  result: 'success' | 'error' | 'timeout' | 'refused_session';
  error?: string;
  payload_bytes: number;
  status_code: number | null;
}

// ── CLI startup measurement (run once per sweep) ──

export function measureCliStartup(): number {
  const T0 = performance.now();
  spawnSync(process.execPath, [AGENTCASH_CLI, '--version'], {
    timeout: 30_000,
    shell: false,
    encoding: 'utf8',
  });
  return Math.round(performance.now() - T0);
}

// ── 402 challenge parsing (only used by previewMppCost) ──

interface MppChallenge {
  intent: string;
  amount: string;
  chainId: number;
}

function parseWwwAuthenticate(header: string): MppChallenge | null {
  const getMethod = (s: string) => s.match(/method="([^"]+)"/)?.[1] ?? '';
  const getIntent = (s: string) => s.match(/intent="([^"]+)"/)?.[1] ?? '';
  const getRequest = (s: string) => s.match(/request="([^"]+)"/)?.[1] ?? '';

  const intent = getIntent(header);
  // SAFETY: refuse session intents (streaming/recurring payments).
  if (intent === 'session') return null;

  const requestB64 = getRequest(header);
  if (!requestB64) return null;

  try {
    const decoded = JSON.parse(Buffer.from(requestB64, 'base64url').toString());
    return {
      intent,
      amount: decoded.amount,
      chainId: decoded.methodDetails?.chainId ?? 0,
    };
  } catch {
    return null;
  }
}

// ── previewMppCost: free 402 probe, never pays ──

export interface PreviewResult {
  ok: boolean;
  intent?: string;
  costUsd?: number;
  chainId?: number;
  reason?: string;
}

export async function previewMppCost(svc: ServiceConfig): Promise<PreviewResult> {
  if (svc.freeEndpoint) {
    return { ok: true, intent: 'free', costUsd: 0 };
  }

  try {
    const res = await fetch(svc.url, {
      method: svc.method,
      headers: { 'Content-Type': 'application/json' },
      body: svc.body && svc.method !== 'GET' ? JSON.stringify(svc.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status !== 402) {
      return { ok: false, reason: `expected 402, got ${res.status}` };
    }

    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    const challenge = parseWwwAuthenticate(wwwAuth);
    if (!challenge) {
      const intentMatch = wwwAuth.match(/intent="([^"]+)"/)?.[1];
      if (intentMatch === 'session') {
        return { ok: false, intent: 'session', reason: 'session intent refused' };
      }
      return { ok: false, reason: 'could not parse 402 challenge' };
    }

    return {
      ok: true,
      intent: challenge.intent,
      costUsd: Number(challenge.amount) / 1e6,
      chainId: challenge.chainId,
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

// ── oneShotMppCall: the main paid call path (via agentcash CLI) ──

export interface OneShotOptions {
  bodyOverride?: Record<string, unknown>;
  urlOverride?: string;
}

export async function oneShotMppCall(
  svc: ServiceConfig,
  opts: OneShotOptions = {}
): Promise<CallResult> {
  const url = opts.urlOverride ?? svc.url;
  const body = opts.bodyOverride ?? svc.body;
  const ts = new Date().toISOString();
  const endpoint = new URL(url).pathname;

  // Free endpoints bypass the CLI entirely — no payment to make.
  if (svc.freeEndpoint) {
    return freeFetch(svc, url, body, ts, endpoint);
  }

  // Build CLI args (mirrors lib/modules/housing/rentcast.ts production usage)
  const args = [AGENTCASH_CLI, 'fetch', url, '-m', svc.method, '--format', 'json'];
  if (body && svc.method !== 'GET') {
    args.push('-b', JSON.stringify(body));
  }

  const T0 = performance.now();
  const result = spawnSync(process.execPath, args, {
    timeout: HARNESS_TIMEOUT_MS,
    shell: false,
    encoding: 'utf8',
  });
  const T1 = performance.now();
  const totalMs = round(T1 - T0);

  if (result.error) {
    const isTimeout = (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
    return errResult(
      ts,
      svc,
      endpoint,
      totalMs,
      isTimeout ? 'timeout' : 'error',
      result.error.message
    );
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().slice(0, 300);
    const stdout = (result.stdout || '').toString().slice(0, 300);
    return errResult(
      ts,
      svc,
      endpoint,
      totalMs,
      'error',
      `agentcash exited ${result.status}: ${stderr || stdout}`
    );
  }

  let parsed: {
    success: boolean;
    data?: unknown;
    metadata?: { protocol?: string; network?: string; price?: string; payment?: { transactionHash?: string; success?: boolean } };
    error?: { message?: string; code?: string };
  };
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    return errResult(
      ts,
      svc,
      endpoint,
      totalMs,
      'error',
      `failed to parse agentcash JSON: ${(err as Error).message}`
    );
  }

  if (!parsed.success) {
    return errResult(
      ts,
      svc,
      endpoint,
      totalMs,
      'error',
      parsed.error?.message ?? `agentcash error code=${parsed.error?.code ?? '?'}`
    );
  }

  // Extract cost from metadata.price (formatted as "$0.0030" or "$0.03")
  const meta = parsed.metadata;
  const priceStr = meta?.price ?? '$0';
  const costUsd = parseFloat(priceStr.replace(/[$,\s]/g, '')) || svc.expectedCostUsd;
  const txHash = meta?.payment?.transactionHash ?? null;

  // Payload size: serialize the data field for a rough byte count
  const dataStr = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data ?? '');
  const payloadBytes = Buffer.byteLength(dataStr, 'utf8');

  return {
    ts,
    service: svc.id,
    endpoint,
    proxy_class: svc.proxyClass,
    cost_usd: costUsd,
    phases_ms: {
      // CLI is a black box — only total is meaningful for paid calls.
      initial_402: 0,
      payment: 0,
      retry_response: 0,
      body: 0,
      total: totalMs,
    },
    tx_hash: txHash,
    result: 'success',
    payload_bytes: payloadBytes,
    status_code: 200,
  };
}

// ── Free endpoint path: direct fetch, no CLI, no payment ──

async function freeFetch(
  svc: ServiceConfig,
  url: string,
  body: Record<string, unknown> | undefined,
  ts: string,
  endpoint: string
): Promise<CallResult> {
  const T0 = performance.now();
  try {
    const res = await fetch(url, {
      method: svc.method,
      headers: svc.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: svc.method === 'POST' && body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(HARNESS_TIMEOUT_MS),
    });
    const T1 = performance.now();
    const buf = await res.arrayBuffer();
    const T2 = performance.now();
    return {
      ts,
      service: svc.id,
      endpoint,
      proxy_class: svc.proxyClass,
      cost_usd: 0,
      phases_ms: {
        initial_402: round(T1 - T0),
        payment: 0,
        retry_response: 0,
        body: round(T2 - T1),
        total: round(T2 - T0),
      },
      tx_hash: null,
      result: res.ok ? 'success' : 'error',
      error: res.ok ? undefined : `HTTP ${res.status}`,
      payload_bytes: buf.byteLength,
      status_code: res.status,
    };
  } catch (err) {
    const T_err = performance.now();
    const isTimeout = (err as Error).name === 'TimeoutError';
    return errResult(
      ts,
      svc,
      endpoint,
      round(T_err - T0),
      isTimeout ? 'timeout' : 'error',
      (err as Error).message
    );
  }
}

// ── Helpers ──

function round(n: number): number {
  return Math.round(n);
}

function errResult(
  ts: string,
  svc: ServiceConfig,
  endpoint: string,
  totalMs: number,
  result: CallResult['result'],
  error: string
): CallResult {
  return {
    ts,
    service: svc.id,
    endpoint,
    proxy_class: svc.proxyClass,
    cost_usd: 0,
    phases_ms: {
      initial_402: round(totalMs),
      payment: 0,
      retry_response: 0,
      body: 0,
      total: round(totalMs),
    },
    tx_hash: null,
    result,
    error,
    payload_bytes: 0,
    status_code: null,
  };
}
