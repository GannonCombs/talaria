import { getDb } from '@/lib/db';
import { calculateMortgage } from './mortgage';

export interface ScoringWeights {
  crime: number;
  schools: number;
  commute_work: number;
  commute_downtown: number;
  walkability: number;
  income: number;
  price: number;
}

export interface NeighborhoodData {
  zip: string;
  walkScore: number;
  crimeIndex: number;
  schoolRating: number;
  medianIncome: number;
  commuteJollyvilleMin: number;
  commuteDowntownMin: number;
  medianPrice: number;
}

interface ListingRow {
  id: number;
  zip: string;
  price: number;
  days_on_market: number;
  hoa_monthly: number;
  tax_annual: number;
}

// ── Neighborhood Scoring ──

export function computeNeighborhoodScore(
  neighborhood: NeighborhoodData,
  weights: ScoringWeights,
  allNeighborhoods: NeighborhoodData[]
): number {
  if (allNeighborhoods.length === 0) return 0;

  const dimensions: { key: keyof ScoringWeights; value: number; invert: boolean }[] = [
    { key: 'crime', value: neighborhood.crimeIndex, invert: false },
    { key: 'schools', value: neighborhood.schoolRating, invert: false },
    { key: 'commute_work', value: neighborhood.commuteJollyvilleMin, invert: true },
    { key: 'commute_downtown', value: neighborhood.commuteDowntownMin, invert: true },
    { key: 'walkability', value: neighborhood.walkScore, invert: false },
    { key: 'income', value: neighborhood.medianIncome, invert: false },
    { key: 'price', value: neighborhood.medianPrice, invert: true },
  ];

  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of dimensions) {
    const weight = weights[dim.key];
    if (weight === 0) continue;

    const allValues = allNeighborhoods.map((n) => {
      switch (dim.key) {
        case 'crime': return n.crimeIndex;
        case 'schools': return n.schoolRating;
        case 'commute_work': return n.commuteJollyvilleMin;
        case 'commute_downtown': return n.commuteDowntownMin;
        case 'walkability': return n.walkScore;
        case 'income': return n.medianIncome;
        case 'price': return n.medianPrice;
      }
    });

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;

    let normalized = range === 0 ? 0.5 : (dim.value - min) / range;
    if (dim.invert) normalized = 1 - normalized;

    weightedSum += normalized * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

// ── Deal Score ──

export function computeDealScore(params: {
  neighborhoodScore: number;
  listingPrice: number;
  zipMedianPrice: number;
  daysOnMarket: number;
  zipMedianDom: number;
  userBudget: number;
}): number {
  const {
    neighborhoodScore,
    listingPrice,
    zipMedianPrice,
    daysOnMarket,
    zipMedianDom,
    userBudget,
  } = params;

  // 1. Neighborhood fit (40%): direct from composite score
  const neighborhoodFit = neighborhoodScore / 100;

  // 2. Price value (30%): how far below zip median (capped at 0-1)
  const priceRatio = zipMedianPrice > 0 ? listingPrice / zipMedianPrice : 1;
  const priceValue = Math.max(0, Math.min(1, 2 - priceRatio));

  // 3. Market timing (15%): longer DOM = more negotiable
  const domRatio = zipMedianDom > 0 ? daysOnMarket / zipMedianDom : 1;
  const marketTiming = Math.min(1, domRatio);

  // 4. Budget fit (15%): how far below user's max budget
  const budgetRatio = userBudget > 0 ? listingPrice / userBudget : 1;
  const budgetFit = Math.max(0, Math.min(1, 1.5 - budgetRatio));

  const score =
    neighborhoodFit * 0.4 +
    priceValue * 0.3 +
    marketTiming * 0.15 +
    budgetFit * 0.15;

  return Math.round(score * 100);
}

// ── Batch compute and store ──

export function getAllNeighborhoods(): NeighborhoodData[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT n.*, COALESCE(m.median_price, 0) as median_price
       FROM housing_neighborhoods n
       LEFT JOIN housing_market_stats m ON m.zip = n.zip
       ORDER BY n.zip`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => ({
    zip: r.zip as string,
    walkScore: (r.walk_score as number) ?? 0,
    crimeIndex: (r.crime_index as number) ?? 0,
    schoolRating: (r.school_rating as number) ?? 0,
    medianIncome: (r.median_income as number) ?? 0,
    commuteJollyvilleMin: (r.commute_jollyville_min as number) ?? 0,
    commuteDowntownMin: (r.commute_downtown_min as number) ?? 0,
    medianPrice: (r.median_price as number) ?? 0,
  }));
}

export function computeAllScores(weights: ScoringWeights, userBudget: number, currentRate: number): {
  neighborhoods: number;
  listings: number;
} {
  const db = getDb();
  const allNeighborhoods = getAllNeighborhoods();

  if (allNeighborhoods.length === 0) return { neighborhoods: 0, listings: 0 };

  // Compute neighborhood scores
  const neighborhoodScores = new Map<string, number>();
  const updateNeighborhood = db.prepare(
    'UPDATE housing_neighborhoods SET composite_score = ? WHERE zip = ?'
  );

  const updateNeighborhoods = db.transaction(() => {
    for (const n of allNeighborhoods) {
      const score = computeNeighborhoodScore(n, weights, allNeighborhoods);
      neighborhoodScores.set(n.zip, score);
      updateNeighborhood.run(score, n.zip);
    }
  });
  updateNeighborhoods();

  // Compute deal scores for listings
  const listings = db
    .prepare('SELECT id, zip, price, days_on_market, hoa_monthly, tax_annual FROM housing_listings')
    .all() as ListingRow[];

  const marketStats = db
    .prepare('SELECT zip, median_price, median_dom FROM housing_market_stats')
    .all() as { zip: string; median_price: number; median_dom: number }[];

  const statsMap = new Map(marketStats.map((s) => [s.zip, s]));

  const updateListing = db.prepare(
    'UPDATE housing_listings SET deal_score = ?, monthly_cost = ? WHERE id = ?'
  );

  const updateListings = db.transaction(() => {
    for (const listing of listings) {
      const nScore = neighborhoodScores.get(listing.zip) ?? 50;
      const stats = statsMap.get(listing.zip);

      const dealScore = computeDealScore({
        neighborhoodScore: nScore,
        listingPrice: listing.price,
        zipMedianPrice: stats?.median_price ?? listing.price,
        daysOnMarket: listing.days_on_market,
        zipMedianDom: stats?.median_dom ?? 30,
        userBudget,
      });

      const mortgage = calculateMortgage({
        homePrice: listing.price,
        downPaymentPct: 20,
        interestRate: currentRate,
        loanTermYears: 30,
        annualPropertyTax: listing.tax_annual,
        monthlyHoa: listing.hoa_monthly,
      });

      updateListing.run(dealScore, mortgage.total_monthly, listing.id);
    }
  });
  updateListings();

  return { neighborhoods: allNeighborhoods.length, listings: listings.length };
}
