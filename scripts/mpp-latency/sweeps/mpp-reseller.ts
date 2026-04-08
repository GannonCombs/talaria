/**
 * Round 2 — sweep our own locally-hosted mpp-reseller.
 *
 * Runs all four reseller catalog entries in sequence:
 *   reseller-streetview-confirmed   (5 calls, mppx waitForConfirmation: true)
 *   reseller-streetview-fast        (5 calls, mppx waitForConfirmation: false)
 *   reseller-textsearch-confirmed   (3 calls)
 *   reseller-textsearch-fast        (3 calls)
 *
 * Total: 16 paid calls × $0.001 = $0.016 of USDC.e (paid from agentcash
 * wallet to the reseller wallet — both controlled by the user).
 *
 * REQUIREMENTS BEFORE RUNNING:
 *   - mpp-reseller/.env must have GOOGLE_MAPS_API_KEY and MPP_SECRET_KEY set
 *   - The reseller must be running on 127.0.0.1:8787
 *     (cd mpp-reseller && npm start)
 *
 * Run: npx tsx scripts/mpp-latency/sweeps/mpp-reseller.ts
 */

import { runSweep } from './_common';

async function main(): Promise<void> {
  // Confirmed mode first (matches Locus baseline behavior)
  await runSweep({ serviceId: 'reseller-streetview-confirmed' });
  await runSweep({ serviceId: 'reseller-textsearch-confirmed' });

  // Fast mode (waitForConfirmation: false)
  await runSweep({ serviceId: 'reseller-streetview-fast' });
  await runSweep({ serviceId: 'reseller-textsearch-fast' });
}

main().catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
