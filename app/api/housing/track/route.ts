import { NextRequest, NextResponse } from 'next/server';
import { dbRun, dbAll } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { listingId, notes } = await request.json();

  await dbRun(
    `INSERT OR REPLACE INTO housing_tracked (listing_id, notes) VALUES (?, ?)`,
    listingId, notes ?? null
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { listingId } = await request.json();

  await dbRun('DELETE FROM housing_tracked WHERE listing_id = ?', listingId);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // `l.*` would set `id` from the listings table, shadowing the tracked
  // FK. Select listing_id explicitly so the frontend can match by it.
  const tracked = await dbAll(
    `SELECT t.listing_id, t.tracked_at, t.notes as track_notes,
            l.id, l.address, l.zip, l.price, l.beds, l.baths, l.sqft,
            l.lot_sqft, l.year_built, l.hoa_monthly, l.tax_annual,
            l.listing_url, l.days_on_market, l.status, l.latitude,
            l.longitude, l.deal_score, l.monthly_cost
     FROM housing_tracked t
     JOIN housing_listings l ON l.id = t.listing_id
     ORDER BY t.tracked_at DESC`
  );

  return NextResponse.json(tracked);
}
