import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import type { DashboardMetrics } from '@/lib/modules';
import { fetchFedPredictions } from './predictions';
import { getLatestRate } from './bankrate';

export async function getHousingDashboardMetrics(): Promise<DashboardMetrics> {
  const db = getDb();

  const cityRow = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'city'")
    .get() as { value: string } | undefined;
  const city = cityRow?.value ?? 'Austin';

  const bestRate = getLatestRate('30yr_fixed');
  const pred = await fetchFedPredictions();

  const rateStr = bestRate ? `${bestRate.rate}%` : '—';
  const cutStr = pred.cutProb > 0 ? `${Math.round(pred.cutProb * 100)}%` : '—';
  const hikeStr = pred.hikeProb > 0 ? `${Math.round(pred.hikeProb * 100)}%` : '—';

  // Read real ZHVI data for median price + sparkline + trend
  let priceStr = '$—';
  let trend: string | undefined;
  let trendDirection: 'up' | 'down' | undefined;
  let sparkline: number[] | undefined;

  try {
    const zhviPath = path.join(process.cwd(), 'public', 'austin-zhvi.json');
    // Round 4 changed the artifact shape from a flat array to an object
    // with a `medianSeries` field (plus per-zip series for the heat map).
    // Read medianSeries here.
    const artifact: { medianSeries?: { date: string; value: number }[] } = JSON.parse(
      fs.readFileSync(zhviPath, 'utf8')
    );
    const medianSeries = artifact.medianSeries ?? [];

    if (medianSeries.length > 0) {
      const latest = medianSeries[medianSeries.length - 1].value;
      priceStr = `$${Math.round(latest / 1000)}K`;

      // Compute real trend from 3 months ago
      if (medianSeries.length >= 4) {
        const threeMonthsAgo = medianSeries[medianSeries.length - 4].value;
        const pctChange = ((latest - threeMonthsAgo) / threeMonthsAgo) * 100;
        trendDirection = pctChange < 0 ? 'down' : 'up';
        trend = `${trendDirection === 'down' ? '↓' : '↑'}${Math.abs(pctChange).toFixed(1)}% (90d)`;
      }

      sparkline = medianSeries.slice(-12).map((d) => d.value / 1000);
    }
  } catch {
    // No ZHVI data available
  }

  return {
    primary: {
      label: `${city} Median Price`,
      value: priceStr,
      trend,
      trendDirection,
    },
    secondary: [
      { label: 'Best 30yr', value: rateStr, valueColor: 'text-primary' },
      { label: 'Fed Cut', value: cutStr, valueColor: 'text-secondary' },
      { label: 'Fed Hike', value: hikeStr, valueColor: 'text-tertiary' },
    ],
    sparkline,
  };
}
