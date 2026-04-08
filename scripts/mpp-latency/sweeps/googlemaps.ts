/**
 * Google Maps sweep — yesterday's failing case.
 *
 * Round 1 scope: only /maps/streetview, the simplest path. The chained
 * textsearch → photo flow is dropped per user direction (textsearch is a
 * known quantity from yesterday's testing, and dropping it saves $0.16+).
 *
 * Run: npx tsx scripts/mpp-latency/sweeps/googlemaps.ts
 *
 * Expected cost: 3 × $0.007 = $0.021.
 */

import { runSweep } from './_common';

runSweep({ serviceId: 'gmaps-streetview' }).catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
