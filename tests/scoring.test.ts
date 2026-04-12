import { describe, it, expect } from 'vitest';
import {
  computeListingScore,
  type ScoringWeights,
  type ListingScoreData,
} from '@/lib/modules/housing/scoring';

const defaultWeights: ScoringWeights = {
  crime: 9,
  schools: 5,
  commute_work: 7,
  commute_downtown: 6,
  walkability: 2,
  income: 5,
  price: 8,
};

// Test listings with varying crime counts
const listings: ListingScoreData[] = [
  { id: 1, price: 400000, crime_count: 50 },   // low crime
  { id: 2, price: 450000, crime_count: 200 },  // medium crime
  { id: 3, price: 350000, crime_count: 500 },  // high crime
];

function buildMinMax(data: ListingScoreData[], wired: Set<string>) {
  // Inline version for testing (production uses the one in scoring.ts)
  const result = new Map<string, { min: number; max: number }>();
  if (wired.has('crime')) {
    const vals = data.map((l) => l.crime_count).filter((v): v is number => v !== null);
    if (vals.length > 0) {
      result.set('crime', { min: Math.min(...vals), max: Math.max(...vals) });
    }
  }
  return result;
}

describe('computeListingScore', () => {
  it('returns a score between 0 and 100', () => {
    const wired = new Set(['crime']);
    const mm = buildMinMax(listings, wired);
    for (const l of listings) {
      const score = computeListingScore(l, defaultWeights, wired, mm);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('returns 0 when no dimensions are wired', () => {
    const wired = new Set<string>();
    const mm = buildMinMax(listings, wired);
    const score = computeListingScore(listings[0], defaultWeights, wired, mm);
    expect(score).toBe(0);
  });

  it('returns 0 when all weights are 0', () => {
    const zeroWeights: ScoringWeights = {
      crime: 0, schools: 0, commute_work: 0, commute_downtown: 0,
      walkability: 0, income: 0, price: 0,
    };
    const wired = new Set(['crime']);
    const mm = buildMinMax(listings, wired);
    const score = computeListingScore(listings[0], zeroWeights, wired, mm);
    expect(score).toBe(0);
  });

  it('scores listing with lowest crime highest (crime is inverted)', () => {
    const wired = new Set(['crime']);
    const mm = buildMinMax(listings, wired);
    const scores = listings.map((l) => ({
      id: l.id,
      score: computeListingScore(l, defaultWeights, wired, mm),
    }));

    const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
    expect(best.id).toBe(1); // lowest crime_count = 50
  });

  it('ignores unwired dimensions even if weight is non-zero', () => {
    const wired = new Set<string>(); // nothing wired
    const mm = buildMinMax(listings, wired);
    // All listings should score 0 since no dimension contributes
    for (const l of listings) {
      expect(computeListingScore(l, defaultWeights, wired, mm)).toBe(0);
    }
  });

  it('handles null crime_count gracefully', () => {
    const listingsWithNull: ListingScoreData[] = [
      { id: 1, price: 400000, crime_count: null },
      { id: 2, price: 450000, crime_count: 100 },
    ];
    const wired = new Set(['crime']);
    const mm = buildMinMax(listingsWithNull, wired);
    // Listing with null crime should score 0 (no data for the only wired dim)
    const score = computeListingScore(listingsWithNull[0], defaultWeights, wired, mm);
    expect(score).toBe(0);
  });

  it('returns consistent results for same input', () => {
    const wired = new Set(['crime']);
    const mm = buildMinMax(listings, wired);
    const a = computeListingScore(listings[0], defaultWeights, wired, mm);
    const b = computeListingScore(listings[0], defaultWeights, wired, mm);
    expect(a).toBe(b);
  });
});
