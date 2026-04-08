/**
 * Shared sweep harness. Each sweeps/<service>.ts is a thin wrapper around this.
 *
 * Responsibilities:
 *   1. Refuse to start if global cap is ≥80% consumed.
 *   2. Verify intent + cost via previewMppCost (free 402 probe).
 *   3. Loop oneShotMppCall(), checking budget BEFORE each call.
 *   4. Stream live stdout per call, append NDJSON per call.
 *   5. SIGINT handler: print partial totals and exit clean.
 */

import { oneShotMppCall, previewMppCost, measureCliStartup, type CallResult } from '../runner';
import { getService, type CatalogEntry } from '../services';
import { checkCanSpend, recordSpend, canStartSweep, printBudgetStatus } from '../budget';
import { writeCallResult, printCallSummary } from '../log';

export interface SweepOptions {
  serviceId: string;
  runId?: string;
  samples?: number;
  gapMs?: number;
  /** Skip budget check entirely. Only safe for free endpoints. */
  freeEndpoint?: boolean;
}

export async function runSweep(opts: SweepOptions): Promise<void> {
  const entry = getService(opts.serviceId);
  const runId = opts.runId ?? `round1-${new Date().toISOString().slice(0, 10)}`;
  const samples = opts.samples ?? entry.defaultSamples;
  const gapMs = opts.gapMs ?? 2000;

  console.log('');
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║ Sweep: ${entry.config.id.padEnd(54)}║`);
  console.log(`║ Class: ${entry.config.proxyClass.padEnd(54)}║`);
  console.log(`║ URL:   ${entry.config.url.slice(0, 54).padEnd(54)}║`);
  console.log(`║ Cost:  ~$${entry.config.expectedCostUsd.toFixed(4)} × ${samples} samples ${' '.repeat(38)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);

  // Free sweeps skip the budget check + preflight entirely
  if (opts.freeEndpoint || entry.config.freeEndpoint) {
    await runFreeSweep(entry, runId, samples, gapMs);
    return;
  }

  // Refuse to start if budget already nearly exhausted
  const startCheck = canStartSweep();
  if (!startCheck.ok) {
    console.error(`✗ Cannot start sweep: ${startCheck.reason}`);
    process.exit(1);
  }

  // Preflight: verify intent + cost without spending anything
  console.log('Preflighting (free 402 probe)…');
  const preview = await previewMppCost(entry.config);
  if (!preview.ok) {
    console.error(`✗ Preflight failed: ${preview.reason}`);
    process.exit(1);
  }
  if (preview.intent !== 'charge') {
    console.error(`✗ Refusing: intent="${preview.intent}" (expected "charge")`);
    process.exit(1);
  }
  const actualCost = preview.costUsd ?? 0;
  const expected = entry.config.expectedCostUsd;
  if (actualCost > expected * 1.5) {
    console.error(
      `✗ Cost drift: actual $${actualCost.toFixed(4)} > 1.5× expected $${expected.toFixed(4)}. ` +
      `Aborting — re-authorization required.`
    );
    process.exit(1);
  }
  console.log(`✓ Preflight ok: intent=charge cost=$${actualCost.toFixed(4)} chainId=${preview.chainId}`);

  // One-time CLI startup measurement so the user knows what's baked into every total
  const cliStartupMs = measureCliStartup();
  console.log(`✓ CLI startup baseline: ${cliStartupMs}ms (subtract from total to estimate MPP work)`);
  console.log('');

  // SIGINT handler — finalize and exit clean
  let interrupted = false;
  const onSigint = () => {
    console.log('\n[SIGINT] finalizing…');
    interrupted = true;
  };
  process.on('SIGINT', onSigint);

  const results: CallResult[] = [];
  for (let i = 0; i < samples; i++) {
    if (interrupted) break;

    // Check budget BEFORE the call (using the verified actual cost, not the estimate)
    const check = checkCanSpend(opts.serviceId, actualCost);
    if (!check.ok) {
      console.error(`✗ Budget refusal: ${check.reason}`);
      break;
    }

    process.stdout.write(`[${i + 1}/${samples}] `);
    const result = await oneShotMppCall(entry.config);
    results.push(result);

    // Always log + display, even errors
    writeCallResult(runId, result);
    printCallSummary(result);

    // Only record spend on actually-paid calls
    if (result.cost_usd > 0 && result.tx_hash) {
      recordSpend(opts.serviceId, result.cost_usd, runId);
    }

    if (i < samples - 1 && !interrupted) {
      await sleep(gapMs);
    }
  }

  process.removeListener('SIGINT', onSigint);

  console.log('');
  console.log(`Sweep done. ${results.length} calls.`);
  printBudgetStatus();
}

async function runFreeSweep(
  entry: CatalogEntry,
  runId: string,
  samples: number,
  gapMs: number
): Promise<void> {
  console.log('Free endpoint — no payment, no budget check.');
  console.log('');

  let interrupted = false;
  const onSigint = () => {
    console.log('\n[SIGINT] finalizing…');
    interrupted = true;
  };
  process.on('SIGINT', onSigint);

  for (let i = 0; i < samples; i++) {
    if (interrupted) break;
    process.stdout.write(`[${i + 1}/${samples}] `);
    const result = await oneShotMppCall(entry.config);
    writeCallResult(runId, result);
    printCallSummary(result);
    if (i < samples - 1 && !interrupted) {
      await sleep(gapMs);
    }
  }

  process.removeListener('SIGINT', onSigint);
  console.log('');
  console.log(`Sweep done. ${samples} calls.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
