/**
 * Probe every paid endpoint in the catalog with previewMppCost.
 *
 * Reads the 402 challenge — does NOT pay anything. Verifies:
 *   1. HTTP 402 is returned at all (endpoint exists)
 *   2. intent === "charge" (not "session")
 *   3. cost matches the catalog estimate (within 1.5×)
 *
 * Run: npx tsx scripts/mpp-latency/preflight-all.ts
 */

import { previewMppCost } from './runner';
import { SERVICES } from './services';

interface ProbeResult {
  id: string;
  proxy: string;
  ok: boolean;
  intent?: string;
  costUsd?: number;
  expected: number;
  drift?: string;
  reason?: string;
}

async function main(): Promise<void> {
  console.log('');
  console.log('Probing all catalog endpoints with previewMppCost (NO PAYMENT)…');
  console.log('');

  const results: ProbeResult[] = [];
  for (const [id, entry] of Object.entries(SERVICES)) {
    if (entry.config.freeEndpoint) {
      results.push({
        id,
        proxy: entry.config.proxyClass,
        ok: true,
        intent: 'free',
        costUsd: 0,
        expected: 0,
      });
      continue;
    }

    process.stdout.write(`  ${id} … `);
    const preview = await previewMppCost(entry.config);
    const expected = entry.config.expectedCostUsd;
    const drift = preview.costUsd
      ? `${((preview.costUsd / expected) * 100).toFixed(0)}%`
      : '—';

    if (!preview.ok) {
      console.log(`✗ ${preview.reason}`);
      results.push({
        id,
        proxy: entry.config.proxyClass,
        ok: false,
        intent: preview.intent,
        expected,
        reason: preview.reason,
      });
      continue;
    }

    const ok =
      preview.intent === 'charge' &&
      preview.costUsd !== undefined &&
      preview.costUsd <= expected * 1.5;

    console.log(
      `${ok ? '✓' : '✗'} intent=${preview.intent} cost=$${(preview.costUsd ?? 0).toFixed(4)} ` +
      `(expected $${expected.toFixed(4)}, drift=${drift})`
    );
    results.push({
      id,
      proxy: entry.config.proxyClass,
      ok,
      intent: preview.intent,
      costUsd: preview.costUsd,
      expected,
      drift,
      reason: ok ? undefined : 'intent or cost mismatch',
    });
  }

  console.log('');
  console.log('── Summary ──');
  const okCount = results.filter((r) => r.ok).length;
  console.log(`  ${okCount} / ${results.length} endpoints ready for paid sweeps`);
  console.log('');

  // Show readiness table
  console.log('| Endpoint | Class | Intent | Actual | Expected | Drift | Status |');
  console.log('|---|---|---|---:|---:|---:|---|');
  for (const r of results) {
    const status = r.ok ? '✓' : `✗ ${r.reason ?? ''}`;
    console.log(
      `| ${r.id} | ${r.proxy} | ${r.intent ?? '?'} | ` +
      `${r.costUsd != null ? '$' + r.costUsd.toFixed(4) : '—'} | ` +
      `$${r.expected.toFixed(4)} | ${r.drift ?? '—'} | ${status} |`
    );
  }
}

main().catch((err) => {
  console.error('Preflight failed:', err);
  process.exit(1);
});
