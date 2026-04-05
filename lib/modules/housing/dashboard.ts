import { getDb } from '@/lib/db';
import type { DashboardMetrics } from '@/lib/modules';
import { fetchFedPredictions } from './predictions';

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

  // Get latest 30yr rate
  const rateRow = db
    .prepare(
      `SELECT rate FROM housing_mortgage_rates
       WHERE product = '30yr_fixed'
       ORDER BY fetched_at DESC LIMIT 1`
    )
    .get() as { rate: number } | undefined;

  // Fetch live Fed predictions (uses 15-min cache internally)
  const pred = await fetchFedPredictions();

  // Format values
  const priceStr = medianPrice
    ? `$${Math.round(medianPrice / 1000)}K`
    : '$—';

  const rateStr = rateRow ? `${rateRow.rate}%` : '—';

  const cutStr = pred.cutProb > 0
    ? `${Math.round(pred.cutProb * 100)}%`
    : '—';

  const hikeStr = pred.hikeProb > 0
    ? `${Math.round(pred.hikeProb * 100)}%`
    : '—';

  // Mock sparkline — in production from historical housing_market_stats
  const sparkline = [
    425, 428, 422, 430, 426, 420, 418, 421, 415, 419, 412, 415,
  ];

  return {
    primary: {
      label: `${city} Median Price`,
      value: priceStr,
      trend: medianPrice ? '↓2.1% (90d)' : undefined,
      trendDirection: 'down',
    },
    secondary: [
      { label: 'Best Rate', value: rateStr, valueColor: 'text-primary' },
      { label: 'Fed Cut', value: cutStr, valueColor: 'text-secondary' },
      { label: 'Fed Hike', value: hikeStr, valueColor: 'text-tertiary' },
    ],
    sparkline,
  };
}
