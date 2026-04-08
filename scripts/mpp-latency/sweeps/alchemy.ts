/**
 * Run: npx tsx scripts/mpp-latency/sweeps/alchemy.ts
 * Optional: --max-calls <N> to override default sample count (smoke test)
 *
 * Cheapest endpoint at $0.0001/call. 20 calls = $0.002.
 * Useful for high-N statistics and smoke testing.
 */

import { runSweep } from './_common';

const args = process.argv.slice(2);
let samples: number | undefined;
const maxCallsIdx = args.indexOf('--max-calls');
if (maxCallsIdx >= 0 && args[maxCallsIdx + 1]) {
  samples = parseInt(args[maxCallsIdx + 1], 10);
}

runSweep({ serviceId: 'alchemy-rpc', samples }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
