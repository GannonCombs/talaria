import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun } from '@/lib/db';

export async function GET() {
  const rows = await dbAll<{ key: string; value: string }>(
    'SELECT key, value FROM user_preferences'
  );

  const prefs: Record<string, string> = {};
  for (const row of rows) {
    prefs[row.key] = row.value;
  }
  return NextResponse.json(prefs);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const upsertSql = `INSERT INTO user_preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

  for (const [key, value] of Object.entries(body)) {
    await dbRun(upsertSql, key, String(value));
  }

  return NextResponse.json({ ok: true });
}
