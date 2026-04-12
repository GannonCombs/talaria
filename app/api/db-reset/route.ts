import { NextResponse } from 'next/server';
import { resetDb } from '@/lib/db';

export async function POST() {
  try {
    await resetDb();
    return NextResponse.json({ ok: true, message: 'Database reset and reseeded' });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 403 },
    );
  }
}

export const maxDuration = 120; // Touch ID confirmation
