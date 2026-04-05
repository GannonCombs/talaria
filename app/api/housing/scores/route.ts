import { NextRequest, NextResponse } from 'next/server';
import { computeAllScores, getAllNeighborhoods, computeNeighborhoodScore, type ScoringWeights } from '@/lib/modules/housing/scoring';
import { getDb } from '@/lib/db';

const DEFAULT_WEIGHTS: ScoringWeights = {
  crime: 9,
  schools: 5,
  commute_work: 7,
  commute_downtown: 6,
  walkability: 2,
  income: 5,
  price: 8,
};

// GET: return current neighborhood scores
export async function GET() {
  const neighborhoods = getAllNeighborhoods();
  const allN = getAllNeighborhoods();

  const db = getDb();
  const weightsRow = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'housing.scoring_weights'")
    .get() as { value: string } | undefined;

  const weights: ScoringWeights = weightsRow
    ? JSON.parse(weightsRow.value)
    : DEFAULT_WEIGHTS;

  const scored = neighborhoods.map((n) => ({
    ...n,
    compositeScore: computeNeighborhoodScore(n, weights, allN),
  }));

  return NextResponse.json(scored);
}

// POST: recompute all scores with given weights
export async function POST(request: NextRequest) {
  const body = await request.json();
  const weights: ScoringWeights = body.weights ?? DEFAULT_WEIGHTS;
  const budget = body.budget ?? 550000;
  const currentRate = body.currentRate ?? 5.98;

  const result = computeAllScores(weights, budget, currentRate);
  return NextResponse.json({ ok: true, computed: result });
}
