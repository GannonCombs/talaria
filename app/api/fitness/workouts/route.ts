import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun, dbGet } from '@/lib/db';
import { computeCardioEffort, computeBodyweightEffort, effortToScore } from '@/lib/modules/fitness/scoring';

const CARDIO_ACTIVITIES = new Set(['run', 'walk', 'bike']);

export async function GET(request: NextRequest) {
  const distinct = request.nextUrl.searchParams.get('distinct');

  if (distinct === 'activities') {
    const rows = await dbAll<{ activity: string; n: number }>(
      `SELECT activity, COUNT(*) as n FROM fitness_workouts
       WHERE activity IS NOT NULL AND activity != 'split'
       GROUP BY activity ORDER BY n DESC`
    );
    return NextResponse.json(rows.map((r) => r.activity));
  }

  const rows = await dbAll(
    'SELECT * FROM fitness_workouts ORDER BY date DESC, created_at DESC LIMIT 50'
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { activity, duration_minutes, distance_miles, reps, notes } = body;

  if (!activity) {
    return NextResponse.json({ error: 'activity is required' }, { status: 400 });
  }

  const date = body.date ?? new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const type = CARDIO_ACTIVITIES.has(activity.toLowerCase()) ? 'cardio' : 'activity';

  // Compute effort and score
  const bwRow = await dbGet<{ value: string }>(
    "SELECT value FROM user_preferences WHERE key = 'fitness.body_weight'"
  );
  const bodyWeight = parseFloat(bwRow?.value ?? '0') || 170;

  let effort = 0;
  if (duration_minutes && duration_minutes > 0) {
    // Cardio: has duration
    effort = computeCardioEffort(activity, duration_minutes, bodyWeight);
  } else if (reps && reps > 0) {
    // Bodyweight: has reps but no duration
    effort = computeBodyweightEffort(activity, reps, bodyWeight);
  }
  const score = effort > 0 ? effortToScore(effort) : null;

  const result = await dbRun(
    `INSERT INTO fitness_workouts (date, type, activity, duration_minutes, distance_miles, reps, notes, score, effort_units)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    date, type, activity, duration_minutes ?? null, distance_miles ?? null, reps ?? null, notes ?? null,
    score, effort > 0 ? effort : null
  );

  const row = await dbGet('SELECT * FROM fitness_workouts WHERE id = ?', result.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, activity, date, duration_minutes, distance_miles, reps, notes } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const type = activity ? (CARDIO_ACTIVITIES.has(activity.toLowerCase()) ? 'cardio' : 'activity') : undefined;

  // For an update, explicitly provided fields (even if null/0) should overwrite.
  // Only omitted fields (undefined) keep their old value.
  const set: string[] = [];
  const args: (string | number | null)[] = [];

  if (activity !== undefined)        { set.push('activity = ?');         args.push(activity); }
  if (date !== undefined)            { set.push('date = ?');             args.push(date); }
  if (type !== undefined)            { set.push('type = ?');             args.push(type); }
  if ('duration_minutes' in body)    { set.push('duration_minutes = ?'); args.push(duration_minutes ?? null); }
  if ('distance_miles' in body)      { set.push('distance_miles = ?');   args.push(distance_miles ?? null); }
  if ('reps' in body)                { set.push('reps = ?');             args.push(reps ?? null); }
  if ('notes' in body)               { set.push('notes = ?');            args.push(notes ?? null); }

  if (set.length > 0) {
    args.push(id);
    await dbRun(`UPDATE fitness_workouts SET ${set.join(', ')} WHERE id = ?`, ...args);
  }

  const row = await dbGet('SELECT * FROM fitness_workouts WHERE id = ?', id);
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Delete associated exercises and sets first
  const exercises = await dbAll<{ id: number }>(
    'SELECT id FROM fitness_exercises WHERE workout_id = ?', id
  );
  for (const ex of exercises) {
    await dbRun('DELETE FROM fitness_sets WHERE exercise_id = ?', ex.id);
  }
  await dbRun('DELETE FROM fitness_exercises WHERE workout_id = ?', id);
  await dbRun('DELETE FROM fitness_workouts WHERE id = ?', id);

  return NextResponse.json({ ok: true });
}
