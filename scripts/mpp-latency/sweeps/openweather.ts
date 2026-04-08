/**
 * Run: npx tsx scripts/mpp-latency/sweeps/openweather.ts
 *
 * 5 paid calls × $0.006 = $0.030 (per measurement run).
 */

import { runSweep } from './_common';

runSweep({ serviceId: 'openweather-current' }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
