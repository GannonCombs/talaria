import { NextRequest, NextResponse } from 'next/server';
import { computeAllScores, getWiredDimensions, type ScoringWeights } from '@/lib/modules/housing/scoring';
import { getDb } from '@/lib/db';

const DEFAULT_WEIGHTS: ScoringWeights = {
  crime: 9,
  schools: 5,
  commute_work: 7,
  commute_social: 6,
  walkability: 2,
  avm: 5,
  price: 8,
};

// GET: return wired dimensions + neighborhood data (for map/drawer display)
export async function GET() {
  const wiredDimensions = getWiredDimensions();
  const db = getDb();
  const neighborhoods = db
    .prepare(`SELECT n.*, COALESCE(m.median_price, 0) as median_price
              FROM housing_neighborhoods n
              LEFT JOIN housing_market_stats m ON m.zip = n.zip
              ORDER BY n.zip`)
    .all();

  return NextResponse.json({
    wiredDimensions: [...wiredDimensions],
    neighborhoods,
  });
}

// POST: recompute all listing scores with given weights
export async function POST(request: NextRequest) {
  const body = await request.json();
  const weights: ScoringWeights = body.weights ?? DEFAULT_WEIGHTS;
  const budget = body.budget ?? 550000;
  const currentRate = body.currentRate ?? 5.98;

  const result = computeAllScores(weights, budget, currentRate);
  const wiredDimensions = getWiredDimensions();
  return NextResponse.json({ ok: true, computed: result, wiredDimensions: [...wiredDimensions] });
}
