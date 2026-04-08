/**
 * Per-request phase-timing instrumentation.
 *
 * Hono middleware factory `timed(label)` records six phase timestamps
 * (T0..T6) into the Hono context, then writes a single NDJSON record on
 * response. Also keeps an in-memory ring buffer of the last N records for
 * the /internal/recent endpoint.
 *
 * Phase markers:
 *   T0 — outer middleware entry (BEFORE mppx.charge runs)
 *   T1 — handler entry (AFTER mppx payment verification completes)
 *        On a paid retry, T0→T1 includes mppx's on-chain wait.
 *        On an unpaid 402, T0→T1 is just challenge generation (sub-ms).
 *   T2 — just before upstream fetch() (set by handler)
 *   T3 — upstream fetch() returns headers (set by handler)
 *   T4 — upstream body fully read (set by handler)
 *   T5 — handler returns (mppx will attach receipt header next)
 *   T6 — outer middleware exit (post-receipt-attach)
 *
 * Phases T2/T3/T4/T5 are set by the route handler via `markPhase(c, ...)`.
 * If the request returns a 402 (no payment), T2-T5 are absent and only T0/T1
 * are recorded.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { Receipt } from 'mppx';
import { getConfig } from './config.js';

export type PhaseName = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';

export interface RequestRecord {
  ts: string;
  request_id: string;
  method: string;
  path: string;
  label: string;          // 'streetview' / 'textsearch' / 'photo'
  mode: 'confirmed' | 'fast' | 'free' | 'unknown';
  status: number;
  phases_ms: {
    outer_overhead: number;     // T0→T1
    pre_upstream: number;       // T1→T2
    upstream_ttfb: number;      // T2→T3
    upstream_body: number;      // T3→T4
    handler_finish: number;     // T4→T5
    receipt_attach: number;     // T5→T6
    total: number;              // T0→T6
  };
  tx_hash: string | null;
  upstream_url: string | null;  // redacted (key=REDACTED)
  upstream_status: number | null;
  payload_bytes: number;
  client_host: string;
  error: string | null;
}

// ── Ring buffer (in-memory) ─────────────────────────────────────────────────

const RING_CAPACITY = 200;
const ring: RequestRecord[] = [];

function pushRing(record: RequestRecord): void {
  ring.push(record);
  if (ring.length > RING_CAPACITY) ring.shift();
}

export function getRecentRecords(limit = 50): RequestRecord[] {
  return ring.slice(-limit).reverse();
}

// ── NDJSON file writer ──────────────────────────────────────────────────────

function ensureLogDir(): string {
  const cfg = getConfig();
  const dir = path.resolve(cfg.logDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dailyLogPath(): string {
  const dir = ensureLogDir();
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(dir, `${day}.ndjson`);
}

function writeRecord(record: RequestRecord): void {
  try {
    fs.appendFileSync(dailyLogPath(), JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    // Don't crash the request just because logging failed
    console.error('[instrumentation] failed to write NDJSON:', (err as Error).message);
  }
}

// ── Hono context variables ──────────────────────────────────────────────────

export interface PhaseSlot {
  T0?: number;
  T1?: number;
  T2?: number;
  T3?: number;
  T4?: number;
  T5?: number;
  T6?: number;
}

/**
 * Pure function: convert raw T0..T6 timestamps into the per-phase delta
 * structure used in the NDJSON record. Missing markers cascade forward
 * (e.g. an unpaid 402 has only T0/T6, so T1..T5 = T0). Exported for testing.
 */
export function computePhases(slot: PhaseSlot): RequestRecord['phases_ms'] {
  const T0 = slot.T0 ?? 0;
  const T1 = slot.T1 ?? T0;
  const T2 = slot.T2 ?? T1;
  const T3 = slot.T3 ?? T2;
  const T4 = slot.T4 ?? T3;
  const T5 = slot.T5 ?? T4;
  const T6 = slot.T6 ?? T5;
  return {
    outer_overhead: Math.round(T1 - T0),
    pre_upstream: Math.round(T2 - T1),
    upstream_ttfb: Math.round(T3 - T2),
    upstream_body: Math.round(T4 - T3),
    handler_finish: Math.round(T5 - T4),
    receipt_attach: Math.round(T6 - T5),
    total: Math.round(T6 - T0),
  };
}

interface InstrumentationCtx {
  label: string;
  mode: 'confirmed' | 'fast' | 'free' | 'unknown';
  phases: PhaseSlot;
  upstreamUrl: string | null;
  upstreamStatus: number | null;
  payloadBytes: number;
  txHash: string | null;
  error: string | null;
}

declare module 'hono' {
  interface ContextVariableMap {
    instr?: InstrumentationCtx;
  }
}

function getInstr(c: Context): InstrumentationCtx {
  const existing = c.get('instr');
  if (existing) return existing;
  const fresh: InstrumentationCtx = {
    label: 'unknown',
    mode: 'unknown',
    phases: {},
    upstreamUrl: null,
    upstreamStatus: null,
    payloadBytes: 0,
    txHash: null,
    error: null,
  };
  c.set('instr', fresh);
  return fresh;
}

// ── Public helpers for handlers to mark T2/T3/T4/T5 ─────────────────────────

export function markPhase(c: Context, phase: PhaseName): void {
  const instr = getInstr(c);
  instr.phases[phase] = performance.now();
}

export function recordUpstream(
  c: Context,
  redactedUrl: string,
  status: number,
  payloadBytes: number
): void {
  const instr = getInstr(c);
  instr.upstreamUrl = redactedUrl;
  instr.upstreamStatus = status;
  instr.payloadBytes = payloadBytes;
}

export function recordError(c: Context, err: string): void {
  getInstr(c).error = err;
}

// ── The middleware factory ──────────────────────────────────────────────────

export function timed(label: string, mode: 'confirmed' | 'fast' | 'free'): MiddlewareHandler {
  return async (c, next) => {
    const instr = getInstr(c);
    instr.label = label;
    instr.mode = mode;
    instr.phases.T0 = performance.now();

    let err: Error | null = null;
    try {
      await next();
    } catch (e) {
      err = e as Error;
      instr.error = err.message;
    }

    instr.phases.T6 = performance.now();

    // Capture tx hash from the Payment-Receipt header. The header is a
    // base64url-encoded JSON receipt (not a raw hash) — use mppx's own
    // deserializer to parse it. The tx hash is in the `reference` field
    // for tempo charge receipts.
    const receiptHeader = c.res.headers.get('payment-receipt');
    if (receiptHeader && !instr.txHash) {
      try {
        const receipt = Receipt.deserialize(receiptHeader);
        if (receipt.reference) instr.txHash = receipt.reference;
      } catch {
        // Receipt format may differ across mppx versions / methods.
        // Don't crash the request just because we couldn't parse the header.
      }
    }

    const record: RequestRecord = {
      ts: new Date().toISOString(),
      request_id: crypto.randomUUID(),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      label: instr.label,
      mode: instr.mode,
      status: c.res.status,
      phases_ms: computePhases(instr.phases),
      tx_hash: instr.txHash,
      upstream_url: instr.upstreamUrl,
      upstream_status: instr.upstreamStatus,
      payload_bytes: instr.payloadBytes,
      client_host: c.req.header('host') ?? '',
      error: instr.error,
    };

    pushRing(record);
    writeRecord(record);

    // Live one-line summary to stdout for the operator
    const tag = record.error ? ` ERR=${record.error}` : '';
    console.log(
      `[${record.label}/${record.mode}] ${record.method} ${record.path} ` +
      `${record.status} total=${record.phases_ms.total}ms ` +
      `(outer=${record.phases_ms.outer_overhead} ` +
      `up_ttfb=${record.phases_ms.upstream_ttfb} ` +
      `up_body=${record.phases_ms.upstream_body})` +
      tag
    );

    if (err) throw err;
  };
}

/**
 * The handler should call this immediately on entry to mark T1 — the moment
 * mppx payment verification has completed and we are about to do real work.
 */
export function markHandlerEntry(c: Context): void {
  markPhase(c, 'T1');
}
