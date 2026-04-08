/**
 * Tests for the per-call phase math.
 *
 * `computePhases` converts six raw timestamps (T0..T6, in performance.now()
 * milliseconds) into the structured per-phase delta record that lands in
 * NDJSON. The math has to handle:
 *   - All six markers populated (the happy path)
 *   - Missing markers cascading forward (e.g. an unpaid 402 has only T0/T6)
 *   - Sub-millisecond phases rounding correctly
 *   - All-zero input (defensive)
 */

import { describe, it, expect } from 'vitest';
import { computePhases, type PhaseSlot } from '../src/instrumentation.js';

describe('computePhases — happy path', () => {
  it('computes correct deltas when all markers are present', () => {
    const slot: PhaseSlot = {
      T0: 1000,
      T1: 1100,  // outer_overhead = 100
      T2: 1110,  // pre_upstream = 10
      T3: 1500,  // upstream_ttfb = 390
      T4: 1580,  // upstream_body = 80
      T5: 1581,  // handler_finish = 1
      T6: 1582,  // receipt_attach = 1
    };
    const phases = computePhases(slot);
    expect(phases).toEqual({
      outer_overhead: 100,
      pre_upstream: 10,
      upstream_ttfb: 390,
      upstream_body: 80,
      handler_finish: 1,
      receipt_attach: 1,
      total: 582,
    });
  });

  it('total equals the sum of all phases', () => {
    const slot: PhaseSlot = {
      T0: 0, T1: 1106, T2: 1106, T3: 1426, T4: 1508, T5: 1508, T6: 1509,
    };
    const phases = computePhases(slot);
    const sum =
      phases.outer_overhead +
      phases.pre_upstream +
      phases.upstream_ttfb +
      phases.upstream_body +
      phases.handler_finish +
      phases.receipt_attach;
    expect(sum).toBe(phases.total);
  });
});

describe('computePhases — missing markers cascade forward', () => {
  it('handles an unpaid 402 (only T0 and T6 populated)', () => {
    // The mppx middleware short-circuits on 402, so the handler never
    // runs and T1..T5 are never set. T6 is set in the after-next() phase.
    const slot: PhaseSlot = { T0: 100, T6: 101 };
    const phases = computePhases(slot);
    expect(phases.total).toBe(1);
    expect(phases.outer_overhead).toBe(0); // T1 cascades from T0
    expect(phases.pre_upstream).toBe(0);
    expect(phases.upstream_ttfb).toBe(0);
    expect(phases.upstream_body).toBe(0);
    expect(phases.handler_finish).toBe(0);
    expect(phases.receipt_attach).toBe(1);
  });

  it('handles missing T2..T5 with T0, T1, and T6', () => {
    // mppx handled the credential (T1 set), then the handler errored
    // before reaching the upstream (T2..T5 unset), then mppx attached
    // the receipt (T6 set).
    const slot: PhaseSlot = { T0: 0, T1: 100, T6: 200 };
    const phases = computePhases(slot);
    expect(phases.outer_overhead).toBe(100);
    expect(phases.pre_upstream).toBe(0);
    expect(phases.upstream_ttfb).toBe(0);
    expect(phases.upstream_body).toBe(0);
    expect(phases.handler_finish).toBe(0);
    expect(phases.receipt_attach).toBe(100); // T5 cascades to T1 = 100, T6 - T5 = 100
    expect(phases.total).toBe(200);
  });

  it('handles all markers missing (defensive zero)', () => {
    const slot: PhaseSlot = {};
    const phases = computePhases(slot);
    expect(phases.outer_overhead).toBe(0);
    expect(phases.total).toBe(0);
  });
});

describe('computePhases — rounding', () => {
  it('rounds sub-millisecond phases to the nearest integer', () => {
    const slot: PhaseSlot = {
      T0: 0,
      T1: 0.4,    // rounds to 0
      T2: 0.6,    // T2-T1 = 0.2 → rounds to 0
      T3: 1.5,    // T3-T2 = 0.9 → rounds to 1
      T4: 1.5,
      T5: 1.5,
      T6: 1.5,
    };
    const phases = computePhases(slot);
    expect(phases.outer_overhead).toBe(0);
    expect(phases.pre_upstream).toBe(0);
    expect(phases.upstream_ttfb).toBe(1);
    expect(phases.total).toBe(2); // 1.5 → 2 (banker's rounding... actually Math.round → 2)
  });
});
