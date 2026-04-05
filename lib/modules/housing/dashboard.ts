import { getDb } from '@/lib/db';
import type { DashboardMetrics } from '@/lib/modules';

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

  // Get latest Fed prediction
  const predRow = db
    .prepare(
      `SELECT cut_prob FROM housing_fed_predictions
       ORDER BY fetched_at DESC LIMIT 1`
    )
    .get() as { cut_prob: number } | undefined;

  // Format values
  const priceStr = medianPrice
    ? `$${Math.round(medianPrice / 1000)}K`
    : '$—';

  const rateStr = rateRow ? `${rateRow.rate}%` : '—';

  const fedStr = predRow
    ? `${Math.round(predRow.cut_prob * 100)}%`
    : '—';

  // Mock sparkline — simulated 90-day median price trend
  // In production this would come from historical housing_market_stats rows
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
      { label: 'Fed Cut Prob', value: fedStr, valueColor: 'text-secondary' },
    ],
    sparkline,
  };
}
