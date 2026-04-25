import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun } from '@/lib/db';

export async function GET() {
  const rows = await dbAll(
    'SELECT * FROM reading_logs ORDER BY date DESC, created_at DESC LIMIT 30'
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { pages } = body;

  if (!pages || pages <= 0) {
    return NextResponse.json({ error: 'pages must be a positive number' }, { status: 400 });
  }

  const date = body.date ?? new Date().toLocaleDateString('en-CA');

  const result = await dbRun(
    'INSERT INTO reading_logs (date, pages) VALUES (?, ?)',
    date, pages
  );

  return NextResponse.json({ id: Number(result.lastInsertRowid), date, pages }, { status: 201 });
}
