import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbAll } from '@/lib/db';

export async function GET(request: NextRequest) {
  const splitId = request.nextUrl.searchParams.get('splitId');
  const workoutId = request.nextUrl.searchParams.get('workoutId');

  let targetId: number | null = null;

  if (workoutId) {
    // Load a specific workout by ID (for editing)
    targetId = Number(workoutId);
  } else if (splitId) {
    // Find the most recent completed workout for this split
    const workout = await dbGet<{ id: number }>(
      `SELECT id FROM fitness_workouts
       WHERE split_id = ? AND finished_at IS NOT NULL
       ORDER BY date DESC, finished_at DESC LIMIT 1`,
      splitId
    );
    targetId = workout?.id ?? null;
  } else {
    return NextResponse.json({ error: 'splitId or workoutId required' }, { status: 400 });
  }

  if (!targetId) {
    return NextResponse.json({ exercises: null });
  }

  // Get exercises + sets for that workout
  const exercises = await dbAll<{
    id: number;
    exercise_name: string;
    sort_order: number;
  }>(
    'SELECT id, exercise_name, sort_order FROM fitness_exercises WHERE workout_id = ? ORDER BY sort_order',
    targetId
  );

  const result = [];
  for (const ex of exercises) {
    const sets = await dbAll<{ reps: number; weight: number }>(
      'SELECT reps, weight FROM fitness_sets WHERE exercise_id = ? ORDER BY set_number',
      ex.id
    );
    result.push({
      name: ex.exercise_name,
      sets: sets.map((s) => ({ reps: s.reps, weight: s.weight })),
    });
  }

  return NextResponse.json({ exercises: result });
}
