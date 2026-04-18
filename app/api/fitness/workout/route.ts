import { NextRequest, NextResponse } from 'next/server';
import { dbRun, dbGet, dbBatch } from '@/lib/db';

interface SetData {
  set_number: number;
  weight: number | null;
  reps: number | null;
}

interface ExerciseData {
  exercise_name: string;
  exercise_type?: string;
  sort_order: number;
  sets: SetData[];
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'start') {
    const { splitId, splitName } = body;
    const now = new Date().toISOString();
    const date = now.split('T')[0];

    const result = await dbRun(
      `INSERT INTO fitness_workouts (date, type, activity, split_id, split_name, started_at)
       VALUES (?, 'weights', 'split', ?, ?, ?)`,
      date, splitId ?? null, splitName ?? null, now
    );

    return NextResponse.json({
      workoutId: Number(result.lastInsertRowid),
      date,
      startedAt: now,
    }, { status: 201 });
  }

  if (action === 'finish') {
    const { workoutId, exercises } = body as {
      workoutId: number;
      exercises: ExerciseData[];
    };

    if (!workoutId || !exercises) {
      return NextResponse.json({ error: 'workoutId and exercises required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Update workout with finish time
    await dbRun(
      'UPDATE fitness_workouts SET finished_at = ? WHERE id = ?',
      now, workoutId
    );

    // Insert exercises and sets
    for (const ex of exercises) {
      const exResult = await dbRun(
        `INSERT INTO fitness_exercises (workout_id, exercise_name, exercise_type, sort_order)
         VALUES (?, ?, ?, ?)`,
        workoutId, ex.exercise_name, ex.exercise_type ?? 'weighted', ex.sort_order
      );

      const exerciseId = Number(exResult.lastInsertRowid);

      if (ex.sets.length > 0) {
        await dbBatch(
          ex.sets.map((s) => ({
            sql: `INSERT INTO fitness_sets (exercise_id, set_number, weight, reps)
                  VALUES (?, ?, ?, ?)`,
            args: [exerciseId, s.set_number, s.weight, s.reps],
          }))
        );
      }
    }

    // Advance rotation
    const workout = await dbGet<{ split_id: number | null }>(
      'SELECT split_id FROM fitness_workouts WHERE id = ?', workoutId
    );
    if (workout?.split_id) {
      const splitCount = await dbGet<{ n: number }>('SELECT COUNT(*) as n FROM fitness_splits');
      const total = Number(splitCount?.n ?? 3);
      const current = await dbGet<{ current_split_index: number }>(
        'SELECT current_split_index FROM fitness_rotation_state WHERE id = 1'
      );
      const nextIndex = ((current?.current_split_index ?? 0) + 1) % total;
      await dbRun(
        'UPDATE fitness_rotation_state SET current_split_index = ?, last_workout_date = ? WHERE id = 1',
        nextIndex, now.split('T')[0]
      );
    }

    return NextResponse.json({ ok: true, workoutId, finishedAt: now });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
