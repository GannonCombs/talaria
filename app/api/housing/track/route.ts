import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { listingId, notes } = await request.json();
  const db = getDb();

  db.prepare(
    `INSERT OR REPLACE INTO housing_tracked (listing_id, notes) VALUES (?, ?)`
  ).run(listingId, notes ?? null);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { listingId } = await request.json();
  const db = getDb();

  db.prepare('DELETE FROM housing_tracked WHERE listing_id = ?').run(listingId);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const db = getDb();
  const tracked = db
    .prepare(
      `SELECT l.*, t.tracked_at, t.notes as track_notes
       FROM housing_tracked t
       JOIN housing_listings l ON l.id = t.listing_id
       ORDER BY t.tracked_at DESC`
    )
    .all();

  return NextResponse.json(tracked);
}
