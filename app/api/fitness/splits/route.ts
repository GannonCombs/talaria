import { NextResponse } from 'next/server';
import { dbAll, dbGet } from '@/lib/db';

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
