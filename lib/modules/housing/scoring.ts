import { dbGet, dbAll, dbRun, dbBatch } from '@/lib/db';
import { calculateMortgage } from './mortgage';

export interface ScoringWeights {
  crime: number;
  schools: number;
  commute_work: number;
  commute_social: number;
  walkability: number;
  avm: number;
  price: number;
}

// Per-listing raw data for scoring. Each field is nullable —
// null means that data source hasn't been fetched for this listing yet.
export interface ListingScoreData {
  id: number;
  price: number;
  crime_count: number | null;
  // Future dimensions:
  // walk_score_raw: number | null;
  // school_rating_raw: number | null;
  // commute_work_min: number | null;
  // commute_social_min: number | null;
  // avm_ratio: number | null;
}

interface DimensionDef {
  key: keyof ScoringWeights;
  getValue: (l: ListingScoreData) => number | null;
  invert: boolean; // true = lower raw value is better (crime, commute, price)
}

const DIMENSIONS: DimensionDef[] = [
  { key: 'crime', getValue: (l) => l.crime_count, invert: true },
  // Future:
  // { key: 'walkability', getValue: (l) => l.walk_score_raw, invert: false },
  // { key: 'schools', getValue: (l) => l.school_rating_raw, invert: false },
  // { key: 'commute_work', getValue: (l) => l.commute_work_min, invert: true },
  // { key: 'commute_social', getValue: (l) => l.commute_social_min, invert: true },
  // { key: 'avm', getValue: (l) => l.avm_ratio, invert: false },
  // { key: 'price', getValue: (l) => l.price, invert: true },
];

// ── Per-listing scoring ─────────────────────────────────────────────────

// Precompute min/max for each dimension across all listings (avoids
// recomputing inside the per-listing loop).
function buildMinMax(allListings: ListingScoreData[], wiredDimensions: Set<string>): Map<string, { min: number; max: number }> {
  const result = new Map<string, { min: number; max: number }>();

  for (const dim of DIMENSIONS) {
    if (!wiredDimensions.has(dim.key)) continue;

    const values: number[] = [];
    for (const l of allListings) {
      const v = dim.getValue(l);
      if (v !== null) values.push(v);
    }

    if (values.length === 0) continue;
    result.set(dim.key, {
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }

  return result;
}

export function computeListingScore(
  listing: ListingScoreData,
  weights: ScoringWeights,
  wiredDimensions: Set<string>,
  minMax: Map<string, { min: number; max: number }>,
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of DIMENSIONS) {
    if (!wiredDimensions.has(dim.key)) continue;
    const value = dim.getValue(listing);
    if (value === null) continue;
    const weight = weights[dim.key];
    if (weight === 0) continue;

    const mm = minMax.get(dim.key);
    if (!mm) continue;

    const range = mm.max - mm.min;
    let normalized = range === 0 ? 0.5 : (value - mm.min) / range;
    if (dim.invert) normalized = 1 - normalized;

    weightedSum += normalized * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

// ── Wired dimensions tracking ───────────────────────────────────────────

export async function getWiredDimensions(): Promise<Set<string>> {
  const wired = new Set<string>();
  try {
    const row = await dbGet<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'housing.wired_dimensions'"
    );
    if (row?.value) {
      for (const d of JSON.parse(row.value) as string[]) wired.add(d);
    }
  } catch {}
  return wired;
}

export async function setWiredDimension(dimension: string): Promise<void> {
  const current = await getWiredDimensions();
  current.add(dimension);
  await dbRun(
    "INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES ('housing.wired_dimensions', ?, datetime('now'))",
    JSON.stringify([...current])
  );
}

// ── Batch compute and store ─────────────────────────────────────────────

export async function computeAllScores(weights: ScoringWeights, userBudget: number, currentRate: number): Promise<{
  listings: number;
}> {
  const wiredDimensions = await getWiredDimensions();

  // Load all listings with their raw score data
  const rows = await dbAll<{ id: number; price: number; crime_count: number | null; hoa_monthly: number; tax_annual: number }>(
    'SELECT id, price, crime_count, hoa_monthly, tax_annual FROM housing_listings'
  );

  if (rows.length === 0) return { listings: 0 };

  const scoreData: ListingScoreData[] = rows.map((r) => ({
    id: r.id,
    price: r.price,
    crime_count: r.crime_count,
  }));

  const minMax = buildMinMax(scoreData, wiredDimensions);

  const statements = rows.map((row, i) => {
    const score = computeListingScore(scoreData[i], weights, wiredDimensions, minMax);

    const mortgage = calculateMortgage({
      homePrice: row.price,
      downPaymentPct: 20,
      interestRate: currentRate,
      loanTermYears: 30,
      annualPropertyTax: row.tax_annual,
      monthlyHoa: row.hoa_monthly,
    });

    return {
      sql: 'UPDATE housing_listings SET deal_score = ?, monthly_cost = ? WHERE id = ?',
      args: [score, mortgage.total_monthly, row.id],
    };
  });

  await dbBatch(statements);

  return { listings: rows.length };
}
