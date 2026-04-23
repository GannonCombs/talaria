import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun, dbGet } from '@/lib/db';

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
  const { activity, duration_minutes, distance_miles, notes } = body;

  if (!activity) {
    return NextResponse.json({ error: 'activity is required' }, { status: 400 });
  }

  const date = body.date ?? new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const type = CARDIO_ACTIVITIES.has(activity.toLowerCase()) ? 'cardio' : 'activity';

  const result = await dbRun(
    `INSERT INTO fitness_workouts (date, type, activity, duration_minutes, distance_miles, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    date, type, activity, duration_minutes ?? null, distance_miles ?? null, notes ?? null
  );

  const row = await dbGet('SELECT * FROM fitness_workouts WHERE id = ?', result.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
