// Fitness scoring system.
// Converts all exercise types to effort units, then maps onto a fixed
// 0-10 calibration curve based on population-level MET research.
// Absolute scoring — a beginner doing 20 pushups scores ~1.5,
// a heavy push day scores 7-8, beast mode hits 9+.

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScoredSet {
  weight: number;
  reps: number;
}

export interface ScoredExercise {
  name: string;
  difficulty: number;   // coefficient: compound ~1.2, isolation ~0.7
  sets: ScoredSet[];
}

// ── Cardio intensity multipliers (MET-based) ──────────────────────────────

const CARDIO_METS: Record<string, number> = {
  run: 10.0,
  walk: 3.5,
  bike: 7.0,
  swimming: 8.0,
  'rock climbing': 8.0,
  hiking: 6.0,
  yoga: 3.0,
  stretching: 2.0,
  rowing: 7.0,
  elliptical: 5.0,
  stairmaster: 9.0,
  'jump rope': 12.0,
};

const DEFAULT_CARDIO_MET = 4.0;

// ── Bodyweight exercise fractions ─────────────────────────────────────────

const BODYWEIGHT_FRACTIONS: Record<string, { fraction: number; difficulty: number }> = {
  pushups: { fraction: 0.65, difficulty: 1.0 },
  'push-ups': { fraction: 0.65, difficulty: 1.0 },
  'pull-ups': { fraction: 1.0, difficulty: 1.3 },
  pullups: { fraction: 1.0, difficulty: 1.3 },
  dips: { fraction: 0.8, difficulty: 1.1 },
  'sit-ups': { fraction: 0.3, difficulty: 0.8 },
  situps: { fraction: 0.3, difficulty: 0.8 },
  burpees: { fraction: 0.8, difficulty: 1.4 },
  squats: { fraction: 0.6, difficulty: 1.0 },
  lunges: { fraction: 0.6, difficulty: 1.0 },
  planks: { fraction: 0.5, difficulty: 0.8 },
};

const DEFAULT_BODYWEIGHT = { fraction: 0.5, difficulty: 1.0 };

// ── Effort calculations ───────────────────────────────────────────────────

/**
 * Weighted exercises: effort = Σ(reps × weight × difficulty) per set.
 * If weight is 0, effort for that set is 0 — garbage in, garbage out.
 */
export function computeWeightsEffort(exercises: ScoredExercise[]): number {
  let total = 0;
  for (const ex of exercises) {
    const diff = ex.difficulty || 1.0;
    for (const set of ex.sets) {
      total += set.reps * set.weight * diff;
    }
  }
  return total;
}

/**
 * Cardio: effort = duration_minutes × MET × bodyWeight / 100
 * MET is "metabolic equivalent" — scales with body mass. Dividing by 100
 * keeps cardio and weighted exercises in comparable effort ranges.
 * Without body weight, estimates 170 lbs.
 */
export function computeCardioEffort(activity: string, durationMinutes: number, bodyWeight?: number): number {
  const met = CARDIO_METS[activity.toLowerCase()] ?? DEFAULT_CARDIO_MET;
  const bw = bodyWeight ?? 170;
  return durationMinutes * met * bw / 100;
}

/**
 * Bodyweight (reps-based, no external weight):
 * effort = reps × BW × fraction × difficulty / 10
 * The /10 normalizes against cardio — one pushup rep is roughly equivalent
 * to ~7 seconds of moderate exercise, not a full minute.
 */
export function computeBodyweightEffort(
  activity: string,
  reps: number,
  bodyWeight: number,
): number {
  const config = BODYWEIGHT_FRACTIONS[activity.toLowerCase()] ?? DEFAULT_BODYWEIGHT;
  return reps * bodyWeight * config.fraction * config.difficulty / 10;
}

// ── Fixed calibration curve ───────────────────────────────────────────────
// Maps raw effort units to a 0-10 score. These breakpoints are based on
// population-level MET research and gym session volume data.

const CALIBRATION: [number, number][] = [
  [0, 0.0],
  [500, 2.0],       // short walk
  [1500, 3.5],      // light activity
  [3000, 5.0],      // moderate workout
  [6000, 6.5],      // good gym session
  [10000, 7.5],     // solid push day
  [15000, 8.5],     // heavy session
  [25000, 9.5],     // beast mode
  [40000, 10.0],    // elite two-a-day
];

/**
 * Convert raw effort units to a 0-10 score via linear interpolation
 * on the fixed calibration curve.
 */
export function effortToScore(effort: number): number {
  if (effort <= 0) return 0;
  if (effort >= CALIBRATION[CALIBRATION.length - 1][0]) return 10.0;

  for (let i = 1; i < CALIBRATION.length; i++) {
    const [e0, s0] = CALIBRATION[i - 1];
    const [e1, s1] = CALIBRATION[i];
    if (effort <= e1) {
      const t = (effort - e0) / (e1 - e0);
      return Math.round((s0 + t * (s1 - s0)) * 100) / 100;
    }
  }

  return 10.0;
}

/**
 * Trend arrow: compare today's score to the 30-day rolling average.
 */
export function computeTrend(todayScore: number, last30Scores: number[]): '↑' | '↓' | '→' {
  if (last30Scores.length === 0) return '→';
  const avg = last30Scores.reduce((s, v) => s + v, 0) / last30Scores.length;
  const diff = todayScore - avg;
  if (diff > 0.3) return '↑';
  if (diff < -0.3) return '↓';
  return '→';
}
