import { describe, it, expect } from 'vitest';
import {
  computeNeighborhoodScore,
  computeDealScore,
  type ScoringWeights,
  type NeighborhoodData,
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

const neighborhoods: NeighborhoodData[] = [
  { zip: '78745', walkScore: 35, crimeIndex: 5.8, schoolRating: 5.5, medianIncome: 62000, commuteJollyvilleMin: 32, commuteDowntownMin: 14, medianPrice: 415000 },
  { zip: '78704', walkScore: 72, crimeIndex: 5.2, schoolRating: 6.8, medianIncome: 78000, commuteJollyvilleMin: 28, commuteDowntownMin: 8, medianPrice: 585000 },
  { zip: '78731', walkScore: 30, crimeIndex: 8.2, schoolRating: 8.5, medianIncome: 115000, commuteJollyvilleMin: 12, commuteDowntownMin: 16, medianPrice: 575000 },
];

describe('computeNeighborhoodScore', () => {
  it('returns a score between 0 and 100', () => {
    for (const n of neighborhoods) {
      const score = computeNeighborhoodScore(n, defaultWeights, neighborhoods);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('returns 0 when all weights are 0', () => {
    const zeroWeights: ScoringWeights = {
      crime: 0, schools: 0, commute_work: 0, commute_downtown: 0,
      walkability: 0, income: 0, price: 0,
    };
    const score = computeNeighborhoodScore(neighborhoods[0], zeroWeights, neighborhoods);
    expect(score).toBe(0);
  });

  it('scores 78731 highest with default weights (best schools, closest to work)', () => {
    const scores = neighborhoods.map((n) => ({
      zip: n.zip,
      score: computeNeighborhoodScore(n, defaultWeights, neighborhoods),
    }));

    const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
    expect(best.zip).toBe('78731');
  });

  it('scores 78704 highest when walkability is heavily weighted', () => {
    const walkWeights: ScoringWeights = {
      crime: 0, schools: 0, commute_work: 0, commute_downtown: 0,
      walkability: 10, income: 0, price: 0,
    };
    const scores = neighborhoods.map((n) => ({
      zip: n.zip,
      score: computeNeighborhoodScore(n, walkWeights, neighborhoods),
    }));

    const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
    expect(best.zip).toBe('78704');
  });

  it('returns consistent results for same input', () => {
    const a = computeNeighborhoodScore(neighborhoods[0], defaultWeights, neighborhoods);
    const b = computeNeighborhoodScore(neighborhoods[0], defaultWeights, neighborhoods);
    expect(a).toBe(b);
  });
});

describe('computeDealScore', () => {
  it('returns a score between 0 and 100', () => {
    const score = computeDealScore({
      neighborhoodScore: 70,
      listingPrice: 400000,
      zipMedianPrice: 415000,
      daysOnMarket: 30,
      zipMedianDom: 28,
      userBudget: 550000,
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores higher when price is below median', () => {
    const below = computeDealScore({
      neighborhoodScore: 70,
      listingPrice: 350000,
      zipMedianPrice: 415000,
      daysOnMarket: 20,
      zipMedianDom: 28,
      userBudget: 550000,
    });

    const above = computeDealScore({
      neighborhoodScore: 70,
      listingPrice: 480000,
      zipMedianPrice: 415000,
      daysOnMarket: 20,
      zipMedianDom: 28,
      userBudget: 550000,
    });

    expect(below).toBeGreaterThan(above);
  });

  it('scores higher when well under budget', () => {
    const cheap = computeDealScore({
      neighborhoodScore: 70,
      listingPrice: 300000,
      zipMedianPrice: 415000,
      daysOnMarket: 20,
      zipMedianDom: 28,
      userBudget: 550000,
    });

    const expensive = computeDealScore({
      neighborhoodScore: 70,
      listingPrice: 540000,
      zipMedianPrice: 415000,
      daysOnMarket: 20,
      zipMedianDom: 28,
      userBudget: 550000,
    });

    expect(cheap).toBeGreaterThan(expensive);
  });
});
