/**
 * Run: npx tsx scripts/mpp-latency/sweeps/timezone.ts
 *
 * 5 paid calls × $0.006 = $0.030.
 */

import { runSweep } from './_common';

runSweep({ serviceId: 'timezone-current' }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
