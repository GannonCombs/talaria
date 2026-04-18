import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun, dbGet } from '@/lib/db';

export async function GET() {
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

  const date = new Date().toISOString().split('T')[0];

  const result = await dbRun(
    `INSERT INTO fitness_workouts (date, type, activity, duration_minutes, distance_miles, notes)
     VALUES (?, 'cardio', ?, ?, ?, ?)`,
    date, activity, duration_minutes ?? null, distance_miles ?? null, notes ?? null
  );

  const row = await dbGet('SELECT * FROM fitness_workouts WHERE id = ?', result.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
