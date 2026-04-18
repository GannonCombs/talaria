import { NextRequest, NextResponse } from 'next/server';
import { dbGet } from '@/lib/db';

// Cheap, read-only endpoint. The client uses it on every /housing load
// to decide whether to trigger a refresh. No MPP cost — pure SQLite.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const city = params.get('city');
  const state = params.get('state');

  if (!city || !state) {
    return NextResponse.json(
      { error: 'city and state required' },
      { status: 400 }
    );
  }

  const summary = await dbGet<{ rowCount: number; newestLastSeen: string | null }>(
    `SELECT COUNT(*) AS rowCount,
            MAX(last_seen) AS newestLastSeen
     FROM housing_listings
     WHERE city = ? AND state = ?`,
    city, state
  );

  const attemptRow = await dbGet<{ value: string }>(
    "SELECT value FROM user_preferences WHERE key = 'housing.listings_last_refresh_attempt'"
  );

  let lastRefreshAttempt: { city: string; state: string; startedAt: string } | null = null;
  if (attemptRow) {
    try {
      lastRefreshAttempt = JSON.parse(attemptRow.value);
    } catch {
      lastRefreshAttempt = null;
    }
  }

  return NextResponse.json({
    city,
    state,
    rowCount: summary?.rowCount ?? 0,
    newestLastSeen: summary?.newestLastSeen ?? null,
    lastRefreshAttempt,
  });
}
