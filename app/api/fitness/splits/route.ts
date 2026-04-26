import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun } from '@/lib/db';

export async function GET() {
  const splits = await dbAll<{
    id: number;
    name: string;
    muscle_groups: string;
    rotation_order: number;
    exercises: string;
  }>('SELECT * FROM fitness_splits ORDER BY rotation_order');

  const rotation = await dbGet<{
    current_split_index: number;
    last_workout_date: string | null;
  }>('SELECT * FROM fitness_rotation_state WHERE id = 1');

  return NextResponse.json({
    splits: splits.map((s) => ({
      ...s,
      muscle_groups: JSON.parse(s.muscle_groups || '[]'),
      exercises: JSON.parse(s.exercises),
    })),
    currentSplitIndex: rotation?.current_split_index ?? 0,
    lastWorkoutDate: rotation?.last_workout_date ?? null,
  });
}

// PUT: Update a split's exercises (and optionally name/muscle_groups)
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, exercises, name, muscle_groups } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const set: string[] = [];
  const args: (string | number)[] = [];

  if (exercises !== undefined) { set.push('exercises = ?'); args.push(JSON.stringify(exercises)); }
  if (name !== undefined) { set.push('name = ?'); args.push(name); }
  if (muscle_groups !== undefined) { set.push('muscle_groups = ?'); args.push(JSON.stringify(muscle_groups)); }

  if (set.length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  args.push(id);
  await dbRun(`UPDATE fitness_splits SET ${set.join(', ')} WHERE id = ?`, ...args);

  const row = await dbGet<{ id: number; name: string; exercises: string; muscle_groups: string }>(
    'SELECT * FROM fitness_splits WHERE id = ?', id
  );
  return NextResponse.json({
    ...row,
    exercises: JSON.parse(row?.exercises ?? '[]'),
    muscle_groups: JSON.parse(row?.muscle_groups ?? '[]'),
  });
}
