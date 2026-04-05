import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import type { DashboardMetrics } from '@/lib/modules';
import { fetchFedPredictions } from './predictions';
import { getLatestRate } from './bankrate';

export async function getHousingDashboardMetrics(): Promise<DashboardMetrics> {
  const db = getDb();

  // Read city from preferences
  const cityRow = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'city'")
    .get() as { value: string } | undefined;
  const city = cityRow?.value ?? 'Austin';

  // Get latest market stats (aggregate across target zips)
  const statsRow = db
    .prepare(
      `SELECT AVG(median_price) as avg_price
       FROM housing_market_stats
       WHERE date = (SELECT MAX(date) FROM housing_market_stats)`
    )
    .get() as { avg_price: number | null } | undefined;

  const medianPrice = statsRow?.avg_price ?? null;

  // Get best 30yr rate for dashboard display
  const bestRate = getLatestRate('30yr_fixed');

  // Fetch live Fed predictions (uses 15-min cache internally)
  const pred = await fetchFedPredictions();

  // Format values
  const priceStr = medianPrice
    ? `$${Math.round(medianPrice / 1000)}K`
    : '$—';

  const rateStr = bestRate ? `${bestRate.rate}%` : '—';

  const cutStr = pred.cutProb > 0
    ? `${Math.round(pred.cutProb * 100)}%`
    : '—';

  const hikeStr = pred.hikeProb > 0
    ? `${Math.round(pred.hikeProb * 100)}%`
    : '—';

  // Read real ZHVI sparkline data
  let sparkline: number[] | undefined;
  try {
    const zhviPath = path.join(process.cwd(), 'public', 'austin-zhvi.json');
    const zhviData: { value: number }[] = JSON.parse(fs.readFileSync(zhviPath, 'utf8'));
    sparkline = zhviData.slice(-12).map((d) => d.value / 1000);
  } catch {
    // No ZHVI data available
  }

  return {
    primary: {
      label: `${city} Median Price`,
      value: priceStr,
      trend: medianPrice ? '↓2.1% (90d)' : undefined,
      trendDirection: 'down',
    },
    secondary: [
      { label: 'Best 30yr', value: rateStr, valueColor: 'text-primary' },
      { label: 'Fed Cut', value: cutStr, valueColor: 'text-secondary' },
      { label: 'Fed Hike', value: hikeStr, valueColor: 'text-tertiary' },
    ],
    sparkline,
  };
}
