/**
 * Free dry-run sweep. No payment, no budget impact.
 *
 * Run: npx tsx scripts/mpp-latency/sweeps/agentres.ts
 */

import { runSweep } from './_common';

async function main(): Promise<void> {
  await runSweep({ serviceId: 'agentres-availability' });
  await runSweep({ serviceId: 'agentres-search' });
}

main().catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
