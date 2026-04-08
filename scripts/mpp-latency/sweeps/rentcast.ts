/**
 * Run: npx tsx scripts/mpp-latency/sweeps/rentcast.ts
 *
 * 3 paid calls × $0.033 = $0.099. The most expensive per-call endpoint —
 * deliberately small sample count. Already used in production so we have a
 * known-good baseline; this run is to compare the production agentcash-CLI
 * shellout path against the harness's direct-fetch+ethers path.
 */

import { runSweep } from './_common';

runSweep({ serviceId: 'rentcast-markets' }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
