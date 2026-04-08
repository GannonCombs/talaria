/**
 * Run: npx tsx scripts/mpp-latency/sweeps/alchemy-tempo.ts
 *
 * Same upstream as alchemy.ts (Alchemy eth_blockNumber), but routed through
 * Tempo's own proxy at alchemy.mpp.tempo.xyz instead of Alchemy's direct
 * MPP receiver at mpp.alchemy.com. The controlled experiment for "is the
 * Tempo proxy class structurally slow?"
 *
 * 10 paid calls × $0.0001 = $0.001.
 */

import { runSweep } from './_common';

const args = process.argv.slice(2);
let samples: number | undefined;
const maxCallsIdx = args.indexOf('--max-calls');
if (maxCallsIdx >= 0 && args[maxCallsIdx + 1]) {
  samples = parseInt(args[maxCallsIdx + 1], 10);
}

runSweep({ serviceId: 'alchemy-tempo', samples }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
