import { NextResponse } from 'next/server';
import { dbAll } from '@/lib/db';
import { getMyReservations } from '@/lib/modules/food/resy-client';

// GET: Return reservations. Syncs from Resy on each call.
// Query: ?status=confirmed (optional, defaults to all)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  // Try to sync from Resy (best-effort — don't block on failure)
  try {
    const remoteReservations = await getMyReservations();
    // TODO: sync remote reservations with local DB
    // For now, just return remote data directly
    if (remoteReservations.length > 0) {
      const filtered = status
        ? remoteReservations.filter((r) => r.status === status)
        : remoteReservations;
      return NextResponse.json(filtered);
    }
  } catch {
    // Fall through to local DB
  }

  // Fall back to local DB
  let sql = 'SELECT * FROM food_reservations ORDER BY date ASC, time ASC';
  const args: string[] = [];
  if (status) {
    sql = 'SELECT * FROM food_reservations WHERE status = ? ORDER BY date ASC, time ASC';
    args.push(status);
  }

  const reservations = await dbAll(sql, ...args);
  return NextResponse.json(reservations);
}
