import { NextResponse } from 'next/server';
import { resetDb } from '@/lib/db';

export async function POST() {
  resetDb();
  return NextResponse.json({ ok: true, message: 'Database reset and reseeded' });
}
