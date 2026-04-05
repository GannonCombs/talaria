import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare('SELECT key, value FROM user_preferences')
    .all() as { key: string; value: string }[];

  const prefs: Record<string, string> = {};
  for (const row of rows) {
    prefs[row.key] = row.value;
  }
  return NextResponse.json(prefs);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getDb();

  const stmt = db.prepare(
    `INSERT INTO user_preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  for (const [key, value] of Object.entries(body)) {
    stmt.run(key, String(value));
  }

  return NextResponse.json({ ok: true });
}
