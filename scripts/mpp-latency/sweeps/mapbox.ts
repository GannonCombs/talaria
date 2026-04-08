/**
 * Run: npx tsx scripts/mpp-latency/sweeps/mapbox.ts
 *
 * 5 paid calls × $0.0037 = $0.0185.
 * Matches the production Talaria geocode usage so we have a known-baseline.
 */

import { runSweep } from './_common';

runSweep({ serviceId: 'mapbox-geocode' }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
